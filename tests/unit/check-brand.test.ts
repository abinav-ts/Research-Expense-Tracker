import { describe, expect, it } from 'vitest';
import { checkBrand, loadRepoFiles, SLOGAN, type SourceFile } from '../../scripts/check-brand.ts';

const loading: SourceFile = { path: 'index.html', content: `<p>${SLOGAN}</p>` };
const file = (path: string, content: string): SourceFile => ({ path, content });
const rules = (files: SourceFile[]) => checkBrand(files).map((v) => v.rule);

describe('brand checker (scripts/check-brand.ts)', () => {
  it('REQ-BRAND-03: passes clean code that uses only theme classes', () => {
    expect(rules([loading, file('src/client/app/A.tsx', '<p className="text-ink bg-ground" />')])).toEqual([]);
  });

  it('REQ-BRAND-03: fails on hex and rgb colour literals in client code', () => {
    expect(rules([loading, file('src/client/app/A.tsx', 'const c = "#0E2A3B"')])).toEqual(['colour-literal']);
    expect(rules([loading, file('src/client/app/A.css', 'a { color: rgb(1 2 3); }')])).toEqual(['colour-literal']);
    expect(rules([loading, file('src/client/app/A.css', 'a { color: #fff; }')])).toEqual(['colour-literal']);
  });

  it('REQ-BRAND-03: allows colour literals inside src/client/brand/ and ignores fragment links', () => {
    expect(rules([loading, file('src/client/brand/x.css', 'a { color: #0E2A3B; }')])).toEqual([]);
    expect(rules([loading, file('src/client/app/A.tsx', '<a href="#main">skip</a>')])).toEqual([]);
  });

  it('REQ-BRAND-03: also guards the loading screen markup in index.html', () => {
    expect(rules([{ path: 'index.html', content: `<style>a{color:#fff}</style>${SLOGAN}` }])).toEqual(['colour-literal']);
  });

  it('REQ-BRAND-02: fails on font-family outside src/client/brand/', () => {
    expect(rules([loading, file('src/client/app/A.css', 'a { font-family: Arial; }')])).toEqual(['font-family']);
    expect(rules([loading, file('src/client/brand/f.css', 'a { font-family: Arial; }')])).toEqual([]);
  });

  it('REQ-BRAND-02: fails on a Google Fonts URL anywhere in src/ or index.html', () => {
    const url = '<link href="https://fonts.googleapis.com/css2?family=Inter">';
    expect(rules([{ path: 'index.html', content: SLOGAN + url }])).toEqual(['google-fonts']);
    expect(rules([loading, file('src/client/brand/f.css', '@import url(https://fonts.gstatic.com/x)')])).toEqual(['google-fonts']);
  });

  it('REQ-BRAND-04: fails when the slogan is missing, duplicated, or outside the loading screen', () => {
    expect(rules([{ path: 'index.html', content: 'no slogan' }])).toEqual(['slogan']);
    expect(rules([loading, file('src/client/app/A.tsx', SLOGAN)])).toEqual(['slogan']);
    expect(rules([{ path: 'index.html', content: SLOGAN + SLOGAN }])).toEqual(['slogan']);
    expect(rules([file('src/client/app/A.tsx', SLOGAN)])).toEqual(['slogan']);
  });

  it('REQ-BRAND-02, REQ-BRAND-03, REQ-BRAND-04: the real source tree is clean', () => {
    expect(checkBrand(loadRepoFiles(new URL('../..', import.meta.url).pathname))).toEqual([]);
  });
});
