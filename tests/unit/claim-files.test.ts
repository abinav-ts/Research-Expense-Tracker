import { describe, expect, it } from 'vitest';
import { COMPRESSION_STEPS, fitWithin } from '../../src/shared/claim-files.ts';

describe('REQ-CLM-04: sizing proofs to send', () => {
  it('REQ-CLM-04: scales the longer side down to the limit and keeps the shape', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(1000, 3000, 1500)).toEqual({ width: 500, height: 1500 });
  });
  it('REQ-CLM-04: never scales up, and never gives a side of 0', () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(10_000, 1, 100).height).toBe(1);
  });
  it('REQ-CLM-04: each compression attempt is smaller than the last', () => {
    for (let i = 1; i < COMPRESSION_STEPS.length; i++) {
      const [a, b] = [COMPRESSION_STEPS[i - 1]!, COMPRESSION_STEPS[i]!];
      expect(b.maxSide <= a.maxSide && b.quality <= a.quality).toBe(true);
    }
  });
});
