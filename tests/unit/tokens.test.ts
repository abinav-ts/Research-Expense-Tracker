import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newKey, newToken } from '../../src/client/lib/tokens.ts';
import { TOKEN_PATTERN } from '../../src/shared/claim.ts';

describe('REQ-REV-07: link tokens made on the device', () => {
  it('REQ-REV-07: a token is 256 bits written as 43 URL-safe characters, and no two are alike', () => {
    const tokens = new Set(Array.from({ length: 500 }, newToken));
    expect(tokens.size).toBe(500);
    for (const t of tokens) expect(t).toMatch(TOKEN_PATTERN);
  });
  it('REQ-CLM-04: a submission key is a fresh UUID', () => {
    expect(newKey()).toMatch(/^[0-9a-f-]{36}$/);
    expect(newKey()).not.toBe(newKey());
  });
  it('REQ-REV-07: robots.txt keeps search engines out of claim pages, and the headers file marks them noindex', () => {
    const robots = readFileSync(new URL('../../public/robots.txt', import.meta.url), 'utf8');
    for (const path of ['/review/', '/claim/', '/api/']) expect(robots).toContain(`Disallow: ${path}`);
    const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
    expect(headers).toMatch(/\/review\/\*\n\s+X-Robots-Tag: noindex, nofollow/);
    expect(headers).toMatch(/\/claim\/\*\n\s+X-Robots-Tag: noindex, nofollow/);
  });
});
