import { expect, test } from '@playwright/test';
import { brandTokens } from '../../build/brand.ts';

// M0 PWA shell. No REQ IDs: REQ-OFF-01/02 are only partly done (no share target, install button, or app data yet).
test.describe('M0 PWA shell', () => {
  test('M0 PWA: the manifest is valid and its icons load', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await request.get(href!)).json();
    expect(manifest).toMatchObject({ name: 'ExpRes', short_name: 'ExpRes', start_url: '/', display: 'standalone' });
    expect(manifest.theme_color.toLowerCase()).toBe(brandTokens()['ex-ink']!.toLowerCase());
    const sizes = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? `:${i.purpose}` : ''}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512', '512x512:maskable']));
    for (const icon of manifest.icons) {
      const res = await request.get(icon.src);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
    }
  });

  test('M0 PWA: a service worker registers and the page says it is ready for offline use', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect(page.getByText('Ready for offline use')).toBeVisible();
  });

  test('M0 PWA: after one online visit, a cold start with the network off still loads the app shell and client routes', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // now controlled by the service worker
    await expect(page.getByText('Ready for offline use')).toBeVisible();

    await context.setOffline(true);
    await page.goto('/trips'); // a client route, answered by the navigation fallback
    await expect(page.locator('[data-testid="brand-logo"]')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Researcher workspace' })).toBeVisible();

    await page.goto('/review/sample');
    await expect(page.getByRole('heading', { name: 'Sample claim' })).toBeVisible();

    // /api is never served from the cache.
    const outcome = await page.evaluate(() => fetch('/api/health').then((r) => `status ${r.status}`, () => 'network error'));
    expect(outcome).toBe('network error');
    await context.setOffline(false);
  });
});
