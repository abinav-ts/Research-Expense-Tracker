import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { woff2HasGlyph } from './helpers/woff2-cmap.ts';

const root = join(import.meta.dirname, '../..');
const RUPEE = 0x20b9;
const fontsCss = readFileSync(join(root, 'src/client/brand/fonts.css'), 'utf8');
const tokens = readFileSync(join(root, 'brand/tokens.css'), 'utf8');

const faces = [...fontsCss.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => {
  const body = m[1]!;
  return {
    family: body.match(/font-family:\s*'([^']+)'/)![1]!,
    url: body.match(/url\(([^)]+)\)/)![1]!,
    range: body.match(/unicode-range:\s*([^;]+);/)![1]!,
  };
});

function rangeCovers(range: string, cp: number): boolean {
  return range.split(',').some((part) => {
    const [lo, hi] = part.trim().replace('U+', '').split('-').map((h) => parseInt(h, 16));
    return cp >= lo! && cp <= (hi ?? lo!);
  });
}

describe('REQ-BRAND-02: brand fonts, self-hosted', () => {
  it('REQ-BRAND-02: declares exactly the two brand families from tokens.css, in latin and latin-ext', () => {
    expect(new Set(faces.map((f) => f.family))).toEqual(new Set(['Bricolage Grotesque Variable', 'Inter Variable']));
    for (const f of faces) expect(tokens).toContain(`'${f.family}'`);
    expect(faces).toHaveLength(4);
    expect(faces.every((f) => /latin(-ext)?-wght-normal\.woff2$/.test(f.url))).toBe(true);
  });

  it('REQ-BRAND-02: font files come from the bundled packages, never a remote host', () => {
    for (const f of faces) {
      expect(f.url).toMatch(/^\.\.\/\.\.\/\.\.\/node_modules\/@fontsource-variable\//);
      expect(f.url).not.toMatch(/^(https?:)?\/\//);
    }
    expect(fontsCss.match(/font-display:\s*swap/g)).toHaveLength(4);
  });

  it('REQ-BRAND-02: the ₹ sign (U+20B9) is a real glyph in the font file the browser will pick, for both families', () => {
    for (const family of ['Inter Variable', 'Bricolage Grotesque Variable']) {
      const pickable = faces.filter((f) => f.family === family && rangeCovers(f.range, RUPEE));
      expect(pickable, `${family}: one face must claim U+20B9`).toHaveLength(1);
      const file = readFileSync(join(root, 'src/client/brand', pickable[0]!.url));
      expect(woff2HasGlyph(file, RUPEE), `${family} has no ₹ glyph`).toBe(true);
    }
  });

  it('REQ-BRAND-02: the glyph reader does not just say yes (a code point absent from the font is reported absent)', () => {
    const latin = faces.find((f) => f.family === 'Inter Variable' && f.url.includes('-latin-wght'))!;
    const file = readFileSync(join(root, 'src/client/brand', latin.url));
    expect(woff2HasGlyph(file, 0x41)).toBe(true); // "A"
    expect(woff2HasGlyph(file, 0x4e2d)).toBe(false); // CJK 中
  });

  it('REQ-BRAND-02: amounts use tabular figures', () => {
    const theme = readFileSync(join(root, 'src/client/brand/theme.css'), 'utf8');
    expect(theme).toMatch(/\.amount\s*{[^}]*font-variant-numeric:\s*tabular-nums/);
  });
});
