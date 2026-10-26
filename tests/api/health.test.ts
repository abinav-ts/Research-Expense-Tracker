import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import type { HealthRepo } from '../../src/server/health.ts';
import { memoryClaimRepo } from './helpers/memory-claims.ts';

const deps = (health: HealthRepo) => ({ health, claims: memoryClaimRepo() });

// M0 infrastructure check (no REQ ID: it is a PLAN.md M0 exit check, not a product requirement).
function memoryRepo(): HealthRepo {
  let hits = 0;
  return {
    async ping(nowIso) {
      hits += 1;
      return { hits, checkedAt: nowIso };
    },
  };
}

describe('M0 /api/health', () => {
  it('writes then reads through the repo and reports ok', async () => {
    const app = createApp(() => deps(memoryRepo()));
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as { ok: boolean; db: { hits: number; checkedAt: string } };
    expect(body.ok).toBe(true);
    expect(body.db.hits).toBe(1);
    expect(Date.parse(body.db.checkedAt)).not.toBeNaN();
  });

  it('counts repeated checks', async () => {
    const repo = memoryRepo();
    const app = createApp(() => deps(repo));
    await app.request('/api/health');
    const res = await app.request('/api/health');
    expect(((await res.json()) as { db: { hits: number } }).db.hits).toBe(2);
  });

  it('answers 500 without leaking details when the database fails', async () => {
    const app = createApp(() => deps({
      ping: async () => {
        throw new Error('D1_ERROR: secret detail');
      },
    }));
    const res = await app.request('/api/health');
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('secret');
  });

  it('answers unknown /api paths with JSON 404, not the app shell', async () => {
    const app = createApp(() => deps(memoryRepo()));
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
