import { describe, expect, it } from 'vitest';
import { adaptiveThreshold, fitSize, prepareRgba, rgbaToGray, stretchContrast, thresholdWindow, type Gray } from '../../src/shared/image-prep.ts';

/** A "page" whose light falls off from left to right (a shadow), with dark strokes printed on it. */
function shadowedPage(): { gray: Gray; ink: Set<number> } {
  const width = 120;
  const height = 60;
  const data = new Uint8Array(width * height);
  const ink = new Set<number>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const paper = 220 - Math.round((x / width) * 150); // 220 on the left, 70 on the right
      const isStroke = y % 12 >= 4 && y % 12 <= 6 && x % 20 >= 4 && x % 20 <= 14;
      data[y * width + x] = isStroke ? paper - 55 : paper;
      if (isStroke) ink.add(y * width + x);
    }
  }
  return { gray: { width, height, data }, ink };
}

describe('REQ-CAP-05: preparing a photographed page for OCR', () => {
  it('REQ-CAP-05: a shadow across the page does not turn the dark side into ink: only the printed strokes become black', () => {
    const { gray, ink } = shadowedPage();
    const globalCut = [...gray.data].filter((v) => v < 128).length;
    expect(globalCut).toBeGreaterThan(gray.data.length * 0.3); // a single brightness cut-off would blacken a third of the page

    const bw = adaptiveThreshold(stretchContrast(gray), 31);
    let wrongInk = 0;
    let missedInk = 0;
    for (let i = 0; i < bw.data.length; i++) {
      const isBlack = bw.data[i] === 0;
      if (isBlack && !ink.has(i)) wrongInk += 1;
      if (!isBlack && ink.has(i)) missedInk += 1;
    }
    expect(wrongInk / bw.data.length).toBeLessThan(0.02);
    expect(missedInk / ink.size).toBeLessThan(0.1);
  });

  it('REQ-CAP-05: contrast stretching spreads a washed-out image across the full range', () => {
    const flat: Gray = { width: 10, height: 10, data: Uint8Array.from({ length: 100 }, (_, i) => 110 + (i % 5) * 8) };
    const out = stretchContrast(flat);
    expect(Math.min(...out.data)).toBe(0);
    expect(Math.max(...out.data)).toBe(255);
  });

  it('REQ-CAP-05: grayscale uses the usual luminance weights, and a flat image stays flat', () => {
    const rgba = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];
    expect([...rgbaToGray(rgba, 4, 1).data]).toEqual([76, 149, 29, 255]);
    const flat = adaptiveThreshold({ width: 20, height: 20, data: new Uint8Array(400).fill(200) }, 9);
    expect(new Set(flat.data).size).toBe(1);
  });

  it('REQ-CAP-05: the whole preparation returns opaque black-and-white pixels of the same size', () => {
    const { gray } = shadowedPage();
    const rgba = new Uint8Array(gray.width * gray.height * 4);
    for (let i = 0; i < gray.data.length; i++) rgba.set([gray.data[i]!, gray.data[i]!, gray.data[i]!, 255], i * 4);
    const out = prepareRgba(rgba, gray.width, gray.height);
    expect(out.length).toBe(rgba.length);
    for (let i = 0; i < out.length; i += 4) {
      expect([0, 255]).toContain(out[i]);
      expect(out[i + 3]).toBe(255);
    }
  });

  it('REQ-CAP-05: very large photos are scaled down to about the pixel budget, keeping their shape; small ones are untouched', () => {
    expect(fitSize(1000, 800, 4_000_000)).toEqual({ width: 1000, height: 800 });
    const big = fitSize(4000, 3000, 4_000_000);
    expect(big.width * big.height).toBeLessThanOrEqual(4_000_000);
    expect(big.width * big.height).toBeGreaterThan(3_800_000);
    expect(Math.abs(big.width / big.height - 4 / 3)).toBeLessThan(0.01);
  });

  it('REQ-CAP-05: the threshold window is odd and stays between 31 and 101 pixels', () => {
    for (const width of [100, 700, 1385, 4000]) {
      const w = thresholdWindow(width);
      expect(w % 2).toBe(1);
      expect(w).toBeGreaterThanOrEqual(31);
      expect(w).toBeLessThanOrEqual(101);
    }
  });
});
