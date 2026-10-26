// REQ-CLM-04, REQ-PRIV-04: sizes for the pictures that go with a claim. Pure; the canvas work is in src/client/lib/claim-files.ts.

/** Scales (width, height) down so the longer side is at most `maxSide`; never scales up. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Attempts, best first: each is tried until the file is small enough. */
export const COMPRESSION_STEPS: readonly { maxSide: number; quality: number }[] = [
  { maxSide: 2000, quality: 0.85 },
  { maxSide: 2000, quality: 0.7 },
  { maxSide: 1600, quality: 0.7 },
  { maxSide: 1400, quality: 0.6 },
  { maxSide: 1100, quality: 0.55 },
  { maxSide: 800, quality: 0.5 },
];
