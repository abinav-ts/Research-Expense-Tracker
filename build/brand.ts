// Build-time helpers that read the provisional brand files (brand/) so a palette or logo swap needs no code change.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const root = resolve(import.meta.dirname, '..');

/** Reads `--ex-*` custom properties from brand/tokens.css, e.g. tokens()['ex-ink']. */
export function brandTokens(): Record<string, string> {
  const css = readFileSync(resolve(root, 'brand/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens: Record<string, string> = {};
  for (const [, name, value] of css.matchAll(/--(ex-[\w-]+)\s*:\s*([^;]+);/g)) {
    if (name && value) tokens[name] = value.trim();
  }
  return tokens;
}

/** Fills index.html: <!--brand:loading-mark--> (animated logo for the loading screen) and %THEME_COLOR%. */
export function brandHtml(): Plugin {
  return {
    name: 'expres-brand-html',
    transformIndexHtml(html) {
      const mark = readFileSync(resolve(root, 'brand/logo-mark-dark.svg'), 'utf8')
        .replace(/\s(role|aria-label)="[^"]*"/g, '')
        .replace('<svg ', '<svg class="ex-loading-mark" aria-hidden="true" focusable="false" ');
      return html.replace('<!--brand:loading-mark-->', mark).replaceAll('%THEME_COLOR%', brandTokens()['ex-ink'] ?? '');
    },
  };
}
