import http from 'node:http';
import type { AddressInfo } from 'node:net';
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
    await page.goto('/grants'); // a client route, answered by the navigation fallback
    await expect(page.locator('[data-testid="brand-logo"]')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Your grants' })).toBeVisible();

    // The reviewer route opens from the app shell too; the claim itself needs the network, and the page says so.
    await page.goto('/review/sample');
    await expect(page.getByRole('heading', { name: 'The claim could not be loaded' })).toBeVisible();

    // /api is never served from the cache.
    const outcome = await page.evaluate(() => fetch('/api/health').then((r) => `status ${r.status}`, () => 'network error'));
    expect(outcome).toBe('network error');
    await context.setOffline(false);
  });

  test('REQ-OFF-06: when a new version is ready a bar says so; the old one keeps running until Reload is tapped, then the new one takes over', async ({ page }) => {
    // A real "new version ships": a small proxy in front of the app (its own origin) serves a changed service worker on demand.
    let newer = '';
    const proxy = http.createServer((req, res) => {
      // Without validators the server always sends the full file: otherwise it would answer 304 "unchanged" for sw.js.
      const headers = { ...req.headers, host: 'localhost:4173', 'accept-encoding': 'identity' };
      delete headers['if-none-match'];
      delete headers['if-modified-since'];
      const upstream = http.request({ host: 'localhost', port: 4173, path: req.url, method: req.method, headers }, (up) => {
        if (req.url?.split('?')[0] !== '/sw.js') {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
          return;
        }
        const chunks: Buffer[] = [];
        up.on('data', (c: Buffer) => chunks.push(c));
        up.on('end', () => {
          const headers = { ...up.headers };
          delete headers['content-length'];
          res.writeHead(up.statusCode ?? 502, headers);
          res.end(Buffer.concat(chunks).toString() + newer);
        });
      });
      req.pipe(upstream);
    });
    await new Promise<void>((resolve) => proxy.listen(0, 'localhost', resolve));
    try {
      const origin = `http://localhost:${(proxy.address() as AddressInfo).port}`;
      await page.goto(origin + '/');
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload(); // controlled by the first version
      await expect(page.getByText('Ready for offline use')).toBeVisible();
      await expect(page.getByTestId('update-bar')).toHaveCount(0); // nothing to announce yet

      newer = '\n// a newer version';
      await page.evaluate(async () => void (await (await navigator.serviceWorker.getRegistration())!.update()));

      await expect(page.getByTestId('update-bar')).toContainText('New version available', { timeout: 20_000 });
      const states = await page.evaluate(async () => {
        const r = (await navigator.serviceWorker.getRegistration())!;
        return { waiting: !!r.waiting, active: !!r.active };
      });
      expect(states).toEqual({ waiting: true, active: true }); // downloaded, but NOT running until the user says so

      await page.getByRole('button', { name: 'Reload' }).click();
      await expect(page.getByTestId('update-bar')).toHaveCount(0, { timeout: 20_000 });
      await page.waitForFunction(async () => !(await navigator.serviceWorker.getRegistration())!.waiting);
      await expect(page.getByTestId('brand-logo')).toHaveCount(1);
    } finally {
      await new Promise((resolve) => proxy.close(resolve));
    }
  });

  test('REQ-OFF-06: a page that cannot show the update bar (an older release of the app) is moved to the new version at once, not left waiting for ever', async ({ page }) => {
    // Pretend this page is an older release: it never answers the service worker's "can you offer an update?" question.
    await page.addInitScript(() => {
      const original = navigator.serviceWorker.addEventListener.bind(navigator.serviceWorker);
      (navigator.serviceWorker as unknown as { addEventListener: unknown }).addEventListener = (type: string, ...rest: unknown[]) =>
        type === 'message' ? undefined : (original as (t: string, ...r: unknown[]) => void)(type, ...rest);
    });
    let newer = '';
    const proxy = http.createServer((req, res) => {
      const headers = { ...req.headers, host: 'localhost:4173', 'accept-encoding': 'identity' };
      delete headers['if-none-match'];
      delete headers['if-modified-since'];
      const upstream = http.request({ host: 'localhost', port: 4173, path: req.url, method: req.method, headers }, (up) => {
        if (req.url?.split('?')[0] !== '/sw.js') {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
          return;
        }
        const chunks: Buffer[] = [];
        up.on('data', (c: Buffer) => chunks.push(c));
        up.on('end', () => {
          const h = { ...up.headers };
          delete h['content-length'];
          res.writeHead(up.statusCode ?? 502, h);
          res.end(Buffer.concat(chunks).toString() + newer);
        });
      });
      req.pipe(upstream);
    });
    await new Promise<void>((resolve) => proxy.listen(0, 'localhost', resolve));
    try {
      await page.goto(`http://localhost:${(proxy.address() as AddressInfo).port}/`);
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();
      newer = '\n// a newer version';
      await page.evaluate(async () => void (await (await navigator.serviceWorker.getRegistration())!.update()));
      // It must not be left waiting: the new worker takes over by itself.
      await page.waitForFunction(async () => {
        const r = await navigator.serviceWorker.getRegistration();
        return !r!.waiting && !r!.installing;
      }, undefined, { timeout: 20_000 });
      await expect(page.getByTestId('update-bar')).toHaveCount(0); // and there is no bar, because this "old" page cannot show one
    } finally {
      await new Promise((resolve) => proxy.close(resolve));
    }
  });
});
