// REQ-CLM-02: browser-side helpers that turn the prepared files into what the PDF builder needs.
import markLight from '../../../brand/logo-mark.svg';
import type { PreparedFile } from '../../shared/claim.ts';
import type { PdfImage, PdfProof } from './claim-pdf.ts';

const readDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export async function pdfProofs(files: PreparedFile[]): Promise<Map<string, PdfProof>> {
  const out = new Map<string, PdfProof>();
  for (const f of files) {
    try {
      if (f.meta.mime === 'text/plain') out.set(f.meta.id, { text: await f.bytes.text() });
      else if (f.meta.mime === 'image/jpeg') {
        const bitmap = await createImageBitmap(f.bytes);
        out.set(f.meta.id, { image: { dataUrl: await readDataUrl(f.bytes), format: 'JPEG', width: bitmap.width, height: bitmap.height } });
        bitmap.close();
      }
    } catch {
      // A picture that cannot be read is listed by name only.
    }
  }
  return out;
}

/** The logo mark as a PNG (the PDF cannot draw SVG). Missing logo = text only. */
export async function pdfLogo(): Promise<PdfImage | undefined> {
  try {
    const img = new Image();
    img.src = markLight;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    canvas.getContext('2d')!.drawImage(img, 0, 0, 160, 120);
    return { dataUrl: canvas.toDataURL('image/png'), format: 'PNG', width: 160, height: 120 };
  } catch {
    return undefined;
  }
}
