// Accepted file types and size limits for grant documents (REQ-SET-07) and Inbox imports (REQ-CAP-02).

export const ACCEPTED_TYPES_TEXT = 'PDF, JPG, PNG, WebP, HEIC';
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

const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);

/** iPhone photos: HEIC / HEIF, by type or (when the browser reports none) by extension. */
export function isHeic(file: { name: string; type: string }): boolean {
  return HEIC_TYPES.has(file.type.toLowerCase()) || /\.(heic|heif|hif)$/i.test(file.name);
}

/** "IMG_1234.HEIC" → "IMG_1234.jpg" */
export function jpegName(name: string): string {
  return name.replace(/\.(heic|heif|hif)$/i, '') + '.jpg';
}

/** Shown when a HEIC photo reaches us and the browser could not turn it into a JPEG. */
export const heicNotOpened = (name: string) =>
  `"${name}" is a HEIC photo and this browser cannot open it. Open ExpRes in Safari on your iPhone, or share the photo as a JPEG.`;

export type FileCheck =
  | { ok: true; mime: string; isPdf: boolean; overLimit: boolean }
  | { ok: false; message: string };

/** Decides by MIME type, falling back to the file extension when the browser reports none. */
export function checkFile(file: { name: string; type: string; size: number }): FileCheck {
  if (isHeic(file)) return { ok: false, message: heicNotOpened(file.name) }; // HEIC is converted before it gets here (lib/heic.ts)
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
