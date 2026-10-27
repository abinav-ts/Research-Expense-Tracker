import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { brandTokens } from '../../build/brand.ts';

// WCAG relative luminance and contrast ratio, computed on the real brand tokens.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
const t = brandTokens();

describe('REQ-BAL-02: indicator contrast', () => {
  it('REQ-BAL-02: Healthy, Low and Overspent text is at least 4.5:1 on the card and page backgrounds (light theme)', () => {
    for (const state of ['ex-state-healthy', 'ex-state-low', 'ex-state-over']) {
      for (const ground of ['ex-surface', 'ex-ground']) {
        expect(contrast(t[state]!, t[ground]!), `${state} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('REQ-BAL-02: body text, secondary text, links and light-on-ink button text also reach 4.5:1', () => {
    for (const fg of ['ex-ink', 'ex-ink-soft', 'ex-breeze-deep']) expect(contrast(t[fg]!, t['ex-surface']!), fg).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['ex-on-dark']!, t['ex-ink']!)).toBeGreaterThanOrEqual(4.5);
  });

  it('REQ-BAL-02: the checker is not a rubber stamp (a pale tint fails as text, and the accent colour clears the 3:1 graphics bar)', () => {
    expect(contrast(t['ex-line']!, t['ex-surface']!)).toBeLessThan(4.5);
    expect(contrast(t['ex-breeze']!, t['ex-surface']!)).toBeGreaterThanOrEqual(3);
    expect(readFileSync(join(import.meta.dirname, '../../brand/tokens.css'), 'utf8')).toContain('--ex-state-low');
  });
});
