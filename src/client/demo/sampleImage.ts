// Synthetic demo proofs, drawn in the browser and watermarked "SAMPLE" (CLAUDE.md: fixtures are synthetic).
// Colours and the font stack come from the brand tokens at runtime, never from literals.
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export async function makeSampleImage(title: string, lines: string[]): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 400;
  const ctx = canvas.getContext('2d')!;
  const stack = token('--ex-font-ui');
  ctx.fillStyle = token('--ex-surface');
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = token('--ex-ink');
  ctx.font = `700 26px ${stack}`;
  ctx.fillText(title, 32, 56);
  ctx.font = `400 22px ${stack}`;
  lines.forEach((line, i) => ctx.fillText(line, 32, 110 + i * 40));
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2 + 30);
  ctx.rotate(-Math.PI / 8);
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = token('--ex-state-over');
  ctx.font = `800 120px ${stack}`;
  ctx.textAlign = 'center';
  ctx.fillText('SAMPLE', 0, 0);
  ctx.restore();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the sample image'))), 'image/png'));
}
