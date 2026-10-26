// REQ-CAP-05: on-device OCR. Tesseract runs in its own Web Worker, so the page stays responsive.
// The raw text is returned to the caller and kept in memory only; nothing is stored.
import type { PSM, Worker as TesseractWorker } from 'tesseract.js';

// tesseract.js is loaded on demand (it is large), so its PSM constants are written out: 3 = automatic layout, 11 = sparse text.
const LAYOUT_AUTO = '3' as PSM;
const LAYOUT_SPARSE = '11' as PSM;

let worker: Promise<TesseractWorker> | undefined;

function getWorker(): Promise<TesseractWorker> {
  worker ??= import('tesseract.js').then(({ createWorker, OEM }) =>
    createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: '/ocr/worker.min.js',
      workerBlobURL: false, // load the worker straight from our origin, so the service worker can serve it offline
      corePath: '/ocr/core',
      langPath: '/ocr/lang',
      gzip: true,
      cacheMethod: 'none', // our own cache (assets.ts) holds the files
    }),
  );
  worker.catch(() => (worker = undefined)); // allow a retry after a failed start
  return worker;
}

/** Stops a stuck worker (e.g. a browser that silently hangs) so the next try starts clean. */
export async function resetRecogniser(): Promise<void> {
  const old = worker;
  worker = undefined;
  try {
    await (await old)?.terminate();
  } catch {
    // already gone
  }
}

/**
 * Reads the text in an image. `layout`: 'auto' finds blocks and columns; 'sparse' finds scattered lines, which suits
 * receipts and screenshots where 'auto' loses lines. Rejects if recognition cannot run.
 */
export async function recogniseImage(image: Blob, layout: 'auto' | 'sparse' = 'auto'): Promise<string> {
  const w = await getWorker();
  await w.setParameters({ tessedit_pageseg_mode: layout === 'sparse' ? LAYOUT_SPARSE : LAYOUT_AUTO });
  const { data } = await w.recognize(image);
  return data.text;
}
