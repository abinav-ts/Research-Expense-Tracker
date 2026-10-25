import { expect, test } from '@playwright/test';
import { pageTitle, routes } from '../../src/client/app/routes.ts';

const SLOGAN = 'Breeze through grant-handling grunt work';

test.describe('REQ-BRAND-01: logo on every page', () => {
  for (const route of routes) {
    test(`REQ-BRAND-01: ${route.id} (${route.sample}) has exactly one named logo in the header and a title ending in ExpRes`, async ({ page }) => {
      await page.goto(route.sample);
      const logo = page.locator('[data-testid="brand-logo"]');
      await expect(logo).toHaveCount(1);
      await expect(page.locator('header [data-testid="brand-logo"]')).toHaveCount(1);
      await expect(logo).toHaveAttribute('aria-label', 'ExpRes');
      await expect(page).toHaveTitle(pageTitle(route.title));
      expect(await page.title()).toMatch(/ExpRes$/);

      if (route.shell === 'reviewer') {
        await expect(page.getByRole('img', { name: 'ExpRes' })).toHaveCount(1);
        await expect(page.getByRole('link', { name: 'ExpRes' })).toHaveCount(0);
      } else {
        await expect(page.getByRole('link', { name: 'ExpRes' })).toHaveAttribute('href', '/');
      }
    });
  }

  test('REQ-BRAND-01: the mark is 40×30 px and the wordmark hides below 320 px wide', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/');
    const box = await page.locator('[data-testid="brand-logo"] img').boundingBox();
    expect(Math.round(box!.width)).toBe(40);
    expect(Math.round(box!.height)).toBe(30);
    await expect(page.locator('[data-testid="brand-logo"] span').first()).toBeVisible();
    const fontSize = await page.locator('[data-testid="brand-logo"] span').first().evaluate((el) => getComputedStyle(el).fontSize);
    expect(fontSize).toBe('26px');

    await page.setViewportSize({ width: 300, height: 640 });
    await expect(page.locator('[data-testid="brand-logo"] span').first()).toBeHidden();
    await expect(page.locator('[data-testid="brand-logo"] img')).toBeVisible();
  });

  test('REQ-BRAND-01: clicking the logo on a researcher page goes home', async ({ page }) => {
    await page.goto('/trips');
    await page.getByRole('link', { name: 'ExpRes' }).click();
    await expect(page).toHaveURL('/');
  });
});

test.describe('REQ-BRAND-04: loading screen with slogan, only while loading', () => {
  // Records when #ex-loading first becomes visible and when it leaves the page.
  const watchLoading = () => {
    const w = window as unknown as { __loading: { visibleAt?: number; goneAt?: number } };
    w.__loading = {};
    const tick = () => {
      const el = document.getElementById('ex-loading');
      if (el && getComputedStyle(el).opacity === '1' && w.__loading.visibleAt === undefined) w.__loading.visibleAt = performance.now();
      if (!el && document.getElementById('root') && w.__loading.goneAt === undefined) w.__loading.goneAt = performance.now();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const readLoading = (page: import('@playwright/test').Page) =>
    page.evaluate(() => (window as unknown as { __loading: { visibleAt?: number; goneAt?: number } }).__loading);

  test('REQ-BRAND-04: a fast boot never shows the loading screen, and the slogan appears on no page', async ({ page }) => {
    await page.addInitScript(watchLoading);
    for (const route of routes) {
      await page.goto(route.sample);
      await page.locator('[data-testid="brand-logo"]').waitFor();
      await expect(page.locator('#ex-loading')).toHaveCount(0);
      expect(await page.locator('body').innerText()).not.toContain(SLOGAN);
    }
    expect((await readLoading(page)).visibleAt).toBeUndefined();
  });

  test('REQ-BRAND-04: a slow boot shows mark, wordmark, slogan and "Loading ExpRes", then removes them', async ({ page }) => {
    await page.route('**/assets/index-*.js', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto('/', { waitUntil: 'commit' });
    const loading = page.locator('#ex-loading');
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute('role', 'status');
    await expect(loading).toContainText(SLOGAN);
    await expect(loading).toContainText('Loading ExpRes');
    await expect(loading.locator('svg.ex-loading-mark')).toBeVisible();
    await expect(page.locator('[data-testid="brand-logo"]')).toHaveCount(1, { timeout: 10_000 });
    await expect(loading).toHaveCount(0);
  });

  test('REQ-BRAND-04: once visible it stays at least 700 ms', async ({ page }) => {
    await page.addInitScript(watchLoading);
    // The app mounts ~400 ms in: after the 300 ms reveal, so the screen must linger until ~1000 ms.
    await page.route('**/assets/index-*.js', async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      await route.continue();
    });
    await page.goto('/');
    await page.locator('[data-testid="brand-logo"]').waitFor();
    await expect(page.locator('#ex-loading')).toHaveCount(0);
    const { visibleAt, goneAt } = await readLoading(page);
    expect(visibleAt).toBeDefined();
    expect(goneAt! - visibleAt!).toBeGreaterThanOrEqual(650); // 700 ms minus one frame of slack
  });

  test('REQ-BRAND-04: the mark animates, and is static with prefers-reduced-motion: reduce', async ({ page }) => {
    await page.route('**/assets/index-*.js', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });
    const rupeeAnimation = () => page.locator('#ex-loading .ex-loading-mark > g').evaluate((el) => getComputedStyle(el).animationName);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('#ex-loading')).toBeVisible();
    expect(await rupeeAnimation()).not.toBe('none');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await rupeeAnimation()).toBe('none');
  });
});
