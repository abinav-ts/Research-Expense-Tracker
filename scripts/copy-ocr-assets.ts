// REQ-OFF-05: OCR files are served from our own origin (no CDN). They are copied from node_modules into public/ocr/
// (git-ignored) before `dev` and `build`, with a manifest of sizes for the download progress display.
import { copyFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = join(import.meta.dirname, '..');
const nm = (p: string) => join(root, 'node_modules', p);
const out = (p: string) => join(root, 'public/ocr', p);

// LSTM-only core variants: tesseract.js picks one by CPU features (relaxed SIMD, SIMD, plain).
const files: [from: string, to: string][] = [
  [nm('tesseract.js/dist/worker.min.js'), out('worker.min.js')],
  ...['tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'].map((f): [string, string] => [nm(`tesseract.js-core/${f}`), out(`core/${f}`)]),
  [nm('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), out('lang/eng.traineddata.gz')],
];

for (const [from, to] of files) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
const manifest = Object.fromEntries(files.map(([, to]) => [to.slice(out('').length), statSync(to).size]));
writeFileSync(out('manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`OCR assets copied to public/ocr (${Object.keys(manifest).length} files, ${(Object.values(manifest).reduce((a, b) => a + b, 0) / 1e6).toFixed(1)} MB)`);
