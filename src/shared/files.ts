// Accepted file types and size limits for grant documents (REQ-SET-07) and Inbox imports (REQ-CAP-02).

export const ACCEPTED_TYPES_TEXT = 'PDF, JPG, PNG, WebP';
export const MAX_CLAIM_FILE_BYTES = 1024 * 1024; // 1 MB (REQ-NFR-07; D1 allows 2 MB per row)
export const TOO_LARGE_NOTE = 'Too large to include in a claim (max 1 MB)';

const BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const ACCEPTED_MIMES = new Set(Object.values(BY_EXTENSION));

export type FileCheck =
  | { ok: true; mime: string; isPdf: boolean; overLimit: boolean }
  | { ok: false; message: string };

/** Decides by MIME type, falling back to the file extension when the browser reports none. */
export function checkFile(file: { name: string; type: string; size: number }): FileCheck {
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  const mime = ACCEPTED_MIMES.has(file.type) ? file.type : file.type === '' ? BY_EXTENSION[ext] : undefined;
  if (!mime) return { ok: false, message: `"${file.name}" was skipped: use ${ACCEPTED_TYPES_TEXT}.` };
  return { ok: true, mime, isPdf: mime === 'application/pdf', overLimit: file.size > MAX_CLAIM_FILE_BYTES };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
