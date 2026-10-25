// REQ-CAP-05: on-device OCR. Tesseract runs in its own Web Worker, so the page stays responsive.
// The raw text is returned to the caller and kept in memory only; nothing is stored.
import type { Worker as TesseractWorker } from 'tesseract.js';

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

/** Reads the text in an image at its original resolution. Rejects if recognition cannot run. */
export async function recogniseImage(image: Blob): Promise<string> {
  const w = await getWorker();
  const { data } = await w.recognize(image);
  return data.text;
}
