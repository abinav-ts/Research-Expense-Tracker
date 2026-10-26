// REQ-CLM-04, REQ-PRIV-04: gets a claim's proofs ready to send: pictures are re-drawn as JPEG of at most 1 MB (which also
// drops location and camera data); PDFs and message text are sent as they are if they fit.
import { CLAIM_LIMITS, type PreparedFile } from '../../shared/claim.ts';
import { COMPRESSION_STEPS, fitWithin } from '../../shared/claim-files.ts';
import type { Attachment, GrantDocument } from '../../shared/types.ts';
import { repo } from '../db/index.ts';

export interface SourceFile {
  id: string;
  name: string;
  mime: string;
  blobKey: string;
  kind: PreparedFile['meta']['kind'];
  proofType?: Attachment['proofType'];
}

export interface PreparedSet {
  files: PreparedFile[];
  /** Files that could not be included, with the reason, so the screen can say so. */
  skipped: { id: string; name: string; reason: string }[];
}

const jpegName = (name: string) => `${name.replace(/\.[^.]+$/, '') || 'image'}.jpg`;

async function toJpeg(blob: Blob): Promise<Blob | undefined> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return undefined;
  }
  try {
    for (const step of COMPRESSION_STEPS) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, step.maxSide);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.fillStyle = 'white'; // a transparent picture would otherwise turn black
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', step.quality));
      if (out && out.size <= CLAIM_LIMITS.fileBytes) return out;
    }
    return undefined;
  } finally {
    bitmap.close();
  }
}

export function sourceFilesFor(attachments: Attachment[], docs: GrantDocument[]): SourceFile[] {
  return [
    ...attachments.map((a): SourceFile => ({ id: a.id, name: a.name, mime: a.mime, blobKey: a.blobKey, kind: a.kind, ...(a.proofType && { proofType: a.proofType }) })),
    ...docs.filter((d) => d.includeInPack).map((d): SourceFile => ({ id: d.id, name: d.name, mime: d.mime, blobKey: d.blobKey, kind: 'grant_doc' })),
  ];
}

export async function prepareClaimFiles(sources: SourceFile[]): Promise<PreparedSet> {
  const files: PreparedFile[] = [];
  const skipped: PreparedSet['skipped'] = [];
  let total = 0;
  for (const src of sources) {
    const blob = await repo.getBlob(src.blobKey);
    if (!blob) {
      skipped.push({ id: src.id, name: src.name, reason: 'the file could not be read' });
      continue;
    }
    let out: Blob | undefined = blob;
    let mime = src.mime;
    let name = src.name;
    if (src.mime.startsWith('image/')) {
      out = await toJpeg(blob);
      mime = 'image/jpeg';
      name = jpegName(src.name);
    } else if (src.mime !== 'application/pdf' && src.mime !== 'text/plain') {
      out = undefined;
    }
    if (!out) {
      skipped.push({ id: src.id, name: src.name, reason: src.mime.startsWith('image/') ? 'the picture could not be made smaller than 1 MB' : 'this file type cannot be sent' });
      continue;
    }
    if (out.size > CLAIM_LIMITS.fileBytes) {
      skipped.push({ id: src.id, name: src.name, reason: 'it is larger than 1 MB' });
      continue;
    }
    if (files.length >= CLAIM_LIMITS.files) {
      skipped.push({ id: src.id, name: src.name, reason: `a claim can carry at most ${CLAIM_LIMITS.files} attachments` });
      continue;
    }
    if (total + out.size > CLAIM_LIMITS.totalBytes) {
      skipped.push({ id: src.id, name: src.name, reason: 'the claim would be larger than 25 MB' });
      continue;
    }
    total += out.size;
    files.push({
      meta: { id: src.id, name, mime: mime as PreparedFile['meta']['mime'], kind: src.kind, ...(src.proofType && { proofType: src.proofType }) },
      bytes: out.type === mime ? out : new Blob([out], { type: mime }),
    });
  }
  return { files, skipped };
}
