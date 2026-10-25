import { expect, test } from '@playwright/test';

// M0 infrastructure check against the local D1 database behind `vite preview` (PLAN.md M0 exit check; no REQ ID).
test.describe('M0 /api/health', () => {
  test('M0 /api/health: writes to and reads from D1, so the counter rises on every call', async ({ request }) => {
    const first = await (await request.get('/api/health')).json();
    const second = await (await request.get('/api/health')).json();
    expect(first.ok).toBe(true);
    expect(second.db.hits).toBe(first.db.hits + 1);
    expect(Date.parse(second.db.checkedAt)).toBeGreaterThanOrEqual(Date.parse(first.db.checkedAt));
  });

  test('M0 /api/health: an unknown /api path is JSON 404, not the app shell', async ({ request }) => {
    const res = await request.get('/api/nope');
    expect(res.status()).toBe(404);
    expect(res.headers()['content-type']).toContain('application/json');
  });
});
