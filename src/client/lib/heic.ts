// REQ-CAP-02: iPhone photos are HEIC. Browsers that can open them (Safari on iPhone, iPad and Mac) turn them into JPEG
// as they are added, so everything stored and shown later is an ordinary JPEG that works everywhere (the claim PDF, a
// reviewer on Chrome). Re-encoding also drops GPS and camera metadata (REQ-PRIV-04). A browser that cannot open HEIC
// says so, instead of storing a file nobody can display.
import { fitSize } from '../../shared/image-prep.ts';
import { heicNotOpened, isHeic, jpegName } from '../../shared/files.ts';

const MAX_PIXELS = 12_000_000; // keep the detail text needs; the claim copy is shrunk later (REQ-CAP-10)
const QUALITY = 0.88;

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    // Some Safari versions only open HEIC through an <img>.
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } finally {
      URL.revokeObjectURL(url);
    }
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  }
}

export async function heicToJpeg(file: File): Promise<File> {
  const image = await decode(file);
  try {
    const { width, height } = fitSize(image.width, image.height, MAX_PIXELS);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(image.source, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not encode'))), 'image/jpeg', QUALITY));
    return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
  } finally {
    image.close();
  }
}

/** Converts HEIC files and passes everything else through untouched. Files that cannot be converted come back as messages. */
export async function convertHeicFiles(files: File[]): Promise<{ files: File[]; messages: string[] }> {
  const out: File[] = [];
  const messages: string[] = [];
  for (const file of files) {
    if (!isHeic(file)) {
      out.push(file);
      continue;
    }
    try {
      out.push(await heicToJpeg(file));
    } catch (error) {
      console.warn('HEIC conversion failed', error);
      messages.push(heicNotOpened(file.name));
    }
  }
  return { files: out, messages };
}
