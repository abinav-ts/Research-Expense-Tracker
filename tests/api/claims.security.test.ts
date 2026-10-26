import { describe, expect, it } from 'vitest';
import { RATE_LIMITS } from '../../src/server/claims/routes.ts';
import { sha256Text } from '../../src/server/claims/repo.ts';
import { submission, testApp } from './helpers/claims.ts';

const ip = (address: string) => ({ 'cf-connecting-ip': address });

describe('REQ-REV-07: link security', () => {
  it('REQ-REV-07: tokens are stored only as hashes, never the link itself', async () => {
    const t = testApp();
    const s = submission();
    await t.submit(s);
    const stored = [...t.claims._claims.values()][0]!;
    expect(stored.reviewHash).toBe(await sha256Text(s.reviewToken));
    expect(stored.ownerHash).toBe(await sha256Text(s.ownerToken));
    expect(JSON.stringify([...t.claims._claims.values()])).not.toContain(s.reviewToken);
    expect(JSON.stringify([...t.claims._claims.values()])).not.toContain(s.ownerToken);
  });

  it('REQ-REV-07: every API answer says noindex, and claim data is never cached', async () => {
    const t = testApp();
    const s = submission();
    const responses = [
      await t.submit(s),
      await t.request(`/api/review/${s.reviewToken}`),
      await t.request('/api/review/nope'),
      await t.request('/api/owner/nope'),
      await t.request('/api/review/sample'),
      await t.request('/api/unknown'),
    ];
    for (const res of responses) {
      expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
      expect(res.headers.get('Cache-Control')).toMatch(/no-store/);
    }
  });

  it('REQ-REV-07: error answers never contain the token that was asked for', async () => {
    const t = testApp();
    const secret = 'S3cretTokenValue_S3cretTokenValue_S3cretTok';
    const res = await t.request(`/api/review/${secret}`);
    expect(await res.text()).not.toContain(secret);
  });

  it('REQ-REV-07: submissions are limited to 10 a minute per address, then 429 with Retry-After', async () => {
    const t = testApp();
    for (let i = 0; i < RATE_LIMITS.submit; i += 1) expect((await t.submit(submission(), ip('1.1.1.1'))).status).toBe(201);
    const res = await t.submit(submission(), ip('1.1.1.1'));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect((await t.submit(submission(), ip('2.2.2.2'))).status).toBe(201); // another address is unaffected
  });

  it('REQ-REV-07: the limit starts again in the next minute', async () => {
    let now = new Date('2026-11-16T10:00:00Z');
    const t = testApp({ now: () => now });
    for (let i = 0; i < RATE_LIMITS.submit; i += 1) await t.submit(submission(), ip('1.1.1.1'));
    expect((await t.submit(submission(), ip('1.1.1.1'))).status).toBe(429);
    now = new Date('2026-11-16T10:01:05Z');
    expect((await t.submit(submission(), ip('1.1.1.1'))).status).toBe(201);
  });

  it('REQ-REV-07: reading is limited to 120 a minute', async () => {
    const t = testApp();
    for (let i = 0; i < RATE_LIMITS.read; i += 1) expect((await t.request('/api/review/sample', { headers: ip('3.3.3.3') })).status).toBe(200);
    expect((await t.request('/api/review/sample', { headers: ip('3.3.3.3') })).status).toBe(429);
  });

  it('REQ-REV-07: after 20 failed guesses in a minute, even a correct link waits', async () => {
    const t = testApp();
    const s = submission();
    await t.submit(s);
    for (let i = 0; i < RATE_LIMITS.badToken; i += 1) expect((await t.request(`/api/review/${'b'.repeat(42)}${i % 10}`, { headers: ip('4.4.4.4') })).status).toBe(404);
    expect((await t.request(`/api/review/${s.reviewToken}`, { headers: ip('4.4.4.4') })).status).toBe(429);
    expect((await t.request(`/api/review/${s.reviewToken}`, { headers: ip('5.5.5.5') })).status).toBe(200);
  });

  it('REQ-REV-07: generated review and owner tokens differ and are 43 URL-safe characters (256 bits)', async () => {
    const { newToken } = await import('./helpers/claims.ts');
    const a = newToken();
    const b = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
});
