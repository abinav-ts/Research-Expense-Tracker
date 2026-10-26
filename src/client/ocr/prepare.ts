// REQ-CAP-05: make a photo easier to read before OCR: apply its orientation, scale very large photos down, then
// stretch contrast and apply a local threshold (shared/image-prep.ts). If anything fails the original image is used.
import { fitSize, prepareRgba } from '../../shared/image-prep.ts';

const MAX_PIXELS = 4_000_000;

export async function prepareForOcr(image: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
    const { width, height } = fitSize(bitmap.width, bitmap.height, MAX_PIXELS);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, width, height);
    pixels.data.set(prepareRgba(pixels.data, width, height));
    ctx.putImageData(pixels, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not encode'))), 'image/png'));
  } catch (error) {
    console.warn('Image preparation skipped; reading the original', error);
    return image;
  }
}
