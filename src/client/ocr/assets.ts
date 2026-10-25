// REQ-OFF-05: the recognition data (worker, wasm core, English model; ~7 MB) is served from our own origin and cached in
// the background after first load, so recognition works offline later. The service worker answers /ocr/* from this cache.
import { relaxedSimd, simd } from 'wasm-feature-detect';

export const OCR_CACHE = 'expres-ocr-v1';

export type OcrAssetState =
  | { status: 'unknown' }
  | { status: 'ready' }
  | { status: 'downloading'; loadedBytes: number; totalBytes: number }
  | { status: 'missing-offline' }
  | { status: 'error'; message: string };

let state: OcrAssetState = { status: 'unknown' };
const listeners = new Set<() => void>();
const set = (next: OcrAssetState) => {
  state = next;
  listeners.forEach((l) => l());
};
export const subscribeOcrAssets = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
export const getOcrAssetState = () => state;

/** Which wasm core this device would use (the same choice tesseract.js makes). */
async function coreFile(): Promise<string> {
  const variant = (await relaxedSimd()) ? 'relaxedsimd-' : (await simd()) ? 'simd-' : '';
  return `/ocr/core/tesseract-core-${variant}lstm.wasm.js`;
}

async function neededFiles(): Promise<{ url: string; size: number }[]> {
  const manifest = (await (await fetch('/ocr/manifest.json')).json()) as Record<string, number>;
  const core = await coreFile();
  return ['/worker.min.js', core.replace('/ocr', ''), '/lang/eng.traineddata.gz'].map((path) => ({ url: `/ocr${path}`, size: manifest[path] ?? 0 }));
}

async function allCached(): Promise<boolean> {
  if (!('caches' in globalThis)) return false;
  const cache = await caches.open(OCR_CACHE);
  const core = await coreFile();
  const urls = ['/ocr/worker.min.js', core, '/ocr/lang/eng.traineddata.gz'];
  return (await Promise.all(urls.map((u) => cache.match(u)))).every(Boolean);
}

let inFlight: Promise<void> | undefined;

/** Makes the recognition data available: nothing to do if cached, else downloads it (when online). Safe to call often. */
export function ensureOcrAssets(): Promise<void> {
  inFlight ??= (async () => {
    try {
      if (await allCached()) return set({ status: 'ready' });
      if (!navigator.onLine) return set({ status: 'missing-offline' });
      const files = await neededFiles();
      const totalBytes = files.reduce((n, f) => n + f.size, 0);
      let loadedBytes = 0;
      set({ status: 'downloading', loadedBytes, totalBytes });
      const cache = await caches.open(OCR_CACHE);
      for (const file of files) {
        const res = await fetch(file.url);
        if (!res.ok || !res.body) throw new Error(`Could not download ${file.url}`);
        const reader = res.clone().body!.getReader();
        const keep = cache.put(file.url, res);
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          loadedBytes += value.length;
          set({ status: 'downloading', loadedBytes, totalBytes });
        }
        await keep;
      }
      set({ status: 'ready' });
    } catch (error) {
      set(navigator.onLine ? { status: 'error', message: error instanceof Error ? error.message : 'Download failed' } : { status: 'missing-offline' });
    } finally {
      inFlight = undefined;
    }
  })();
  return inFlight;
}
