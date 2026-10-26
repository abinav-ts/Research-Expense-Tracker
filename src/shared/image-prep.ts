// Makes a photographed document easier for OCR to read (REQ-CAP-05). Pure functions on plain arrays, so they are
// testable without a browser: the canvas wrapper lives in src/client/ocr/prepare.ts.
// Steps: grayscale → stretch contrast → local adaptive threshold (Sauvola). The local threshold is what copes with
// shadows, creases and uneven light on paper, where one global brightness cut-off fails.

export interface Gray {
  width: number;
  height: number;
  data: Uint8Array;
}

export function rgbaToGray(rgba: ArrayLike<number>, width: number, height: number): Gray {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = (0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!) | 0;
  return { width, height, data };
}

/** Stretches brightness so the 2nd percentile becomes black and the 98th becomes white. */
export function stretchContrast(g: Gray): Gray {
  const hist = new Uint32Array(256);
  for (const v of g.data) hist[v]!++;
  const cut = g.data.length * 0.02;
  let lo = 0;
  let hi = 255;
  for (let i = 0, seen = 0; i < 256; i++) if ((seen += hist[i]!) > cut) { lo = i; break; }
  for (let i = 255, seen = 0; i >= 0; i--) if ((seen += hist[i]!) > cut) { hi = i; break; }
  const span = Math.max(1, hi - lo);
  const data = new Uint8Array(g.data.length);
  for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, (((g.data[i]! - lo) * 255) / span) | 0));
  return { width: g.width, height: g.height, data };
}

/** Sauvola local threshold: a pixel is ink if it is darker than its neighbourhood's mean, adjusted by its spread. */
export function adaptiveThreshold(g: Gray, windowSize: number, k = 0.25): Gray {
  const { width: w, height: h, data } = g;
  const stride = w + 1;
  const sum = new Float64Array(stride * (h + 1));
  const sumSq = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    let rowSq = 0;
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x]!;
      row += v;
      rowSq += v * v;
      sum[(y + 1) * stride + x + 1] = sum[y * stride + x + 1]! + row;
      sumSq[(y + 1) * stride + x + 1] = sumSq[y * stride + x + 1]! + rowSq;
    }
  }
  const half = windowSize >> 1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w - 1, x + half);
      const n = (x1 - x0 + 1) * (y1 - y0 + 1);
      const s = sum[(y1 + 1) * stride + x1 + 1]! - sum[y0 * stride + x1 + 1]! - sum[(y1 + 1) * stride + x0]! + sum[y0 * stride + x0]!;
      const sq = sumSq[(y1 + 1) * stride + x1 + 1]! - sumSq[y0 * stride + x1 + 1]! - sumSq[(y1 + 1) * stride + x0]! + sumSq[y0 * stride + x0]!;
      const mean = s / n;
      const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
      out[y * w + x] = data[y * w + x]! > mean * (1 + k * (sd / 128 - 1)) ? 255 : 0;
    }
  }
  return { width: w, height: h, data: out };
}

/** Size to draw at so very large phone photos do not take forever or exhaust memory (about maxPixels in total). */
export function fitSize(width: number, height: number, maxPixels: number): { width: number; height: number } {
  if (width * height <= maxPixels) return { width, height };
  const scale = Math.sqrt(maxPixels / (width * height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** An odd window about 1/14 of the image width: a few text lines tall, wider than a character. */
export function thresholdWindow(width: number): number {
  const w = Math.round(width / 14);
  return Math.min(101, Math.max(31, w % 2 === 0 ? w + 1 : w));
}

/** The whole preparation on RGBA pixels; returns RGBA pixels (black ink on white). */
export function prepareRgba(rgba: ArrayLike<number>, width: number, height: number): Uint8ClampedArray {
  const bw = adaptiveThreshold(stretchContrast(rgbaToGray(rgba, width, height)), thresholdWindow(width));
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < bw.data.length; i++) {
    const v = bw.data[i]!;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}
