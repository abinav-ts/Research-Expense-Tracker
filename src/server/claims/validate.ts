// REQ-CLM-04, REQ-PRIV-02: checks an incoming submission (multipart: `payload` JSON, two links, one part per file).
import { CLAIM_LIMITS, claimPayloadSchema, TOKEN_PATTERN, type ClaimPayload } from '../../shared/claim.ts';
import { sha256Bytes, type StoredFile } from './repo.ts';

export class SubmitError extends Error {
  status: 400 | 409 | 413 | 415;
  details: string[];
  constructor(status: 400 | 409 | 413 | 415, message: string, details: string[] = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

/** The bytes must really be what the declared type says. */
export function looksLike(mime: string, b: Uint8Array): boolean {
  switch (mime) {
    case 'image/jpeg': return startsWith(b, [0xff, 0xd8, 0xff]);
    case 'image/png': return startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp': return startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8);
    case 'application/pdf': return startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case 'text/plain':
      try {
        return !new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(b).includes('\0');
      } catch {
        return false;
      }
    default: return false;
  }
}

export interface ParsedSubmission {
  payload: ClaimPayload;
  reviewToken: string;
  ownerToken: string;
  files: StoredFile[];
}

export async function parseSubmission(form: FormData): Promise<ParsedSubmission> {
  const raw = form.get('payload');
  if (typeof raw !== 'string') throw new SubmitError(400, 'The claim data is missing.');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new SubmitError(400, 'The claim data is not valid.');
  }
  const parsed = claimPayloadSchema.safeParse(json);
  if (!parsed.success) {
    // Paths and messages only: never echo what was sent.
    throw new SubmitError(400, 'The claim data was refused.', parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'claim'}: ${i.message}`));
  }
  const payload = parsed.data;

  const reviewToken = form.get('reviewToken');
  const ownerToken = form.get('ownerToken');
  if (typeof reviewToken !== 'string' || typeof ownerToken !== 'string' || !TOKEN_PATTERN.test(reviewToken) || !TOKEN_PATTERN.test(ownerToken) || reviewToken === ownerToken) {
    throw new SubmitError(400, 'The review and owner links are not valid.');
  }

  if (payload.files.length > CLAIM_LIMITS.files) throw new SubmitError(413, `At most ${CLAIM_LIMITS.files} attachments can be sent.`);
  const parts = new Map<string, File>();
  for (const [key, value] of form.entries()) {
    if (key === 'payload' || key === 'reviewToken' || key === 'ownerToken') continue;
    if (typeof value === 'string') throw new SubmitError(400, 'Unexpected data in the claim.');
    parts.set(key, value);
  }
  const declared = new Set(payload.files.map((f) => f.id));
  for (const key of parts.keys()) if (!declared.has(key)) throw new SubmitError(400, 'A file was sent that the claim does not list.');

  const files: StoredFile[] = [];
  let total = 0;
  for (const meta of payload.files) {
    const part = parts.get(meta.id);
    if (!part) throw new SubmitError(400, `The file “${meta.name}” is missing.`);
    if (part.size > CLAIM_LIMITS.fileBytes) throw new SubmitError(413, `“${meta.name}” is larger than 1 MB.`);
    total += part.size;
    if (total > CLAIM_LIMITS.totalBytes) throw new SubmitError(413, 'The attachments add up to more than 25 MB.');
    const data = await part.arrayBuffer();
    if (data.byteLength === 0) throw new SubmitError(400, `“${meta.name}” is empty.`);
    if (!looksLike(meta.mime, new Uint8Array(data))) throw new SubmitError(415, `“${meta.name}” is not really a ${meta.mime} file.`);
    files.push({ fileId: meta.id, mime: meta.mime, size: data.byteLength, sha256: await sha256Bytes(data), data });
  }
  return { payload, reviewToken, ownerToken, files };
}
