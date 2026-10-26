import { expect, test } from '@playwright/test';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test.describe('REQ-OFF-01, REQ-NFR-08: install and browser support', () => {
  test.describe('on an iPhone', () => {
    test.use({ userAgent: IPHONE, hasTouch: true, viewport: { width: 390, height: 844 } });
    test('REQ-OFF-01, REQ-NFR-08: Safari on iOS has no install button, so Settings says Share, then Add to Home Screen; the picker is there for capture', async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByTestId('ios-install-hint')).toContainText('Add to Home Screen');
      await expect(page.getByRole('button', { name: 'Install app' })).toHaveCount(0);
      await page.goto('/inbox');
      await expect(page.getByLabel('Choose proof files')).toHaveCount(1);
    });
  });

  test('REQ-OFF-01: where the browser has no install route (desktop Safari, a plain tab) Settings does not show an install box', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('install-section')).toHaveCount(0);
  });

  test('REQ-OFF-01: when the browser offers installation the Install app button asks it to', async ({ page }) => {
    await page.goto('/settings');
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
      (window as unknown as { __prompted: number }).__prompted = 0;
      event.prompt = async () => { (window as unknown as { __prompted: number }).__prompted += 1; };
      event.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(event);
    });
    await page.getByRole('button', { name: 'Install app' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1);
    await expect(page.getByRole('button', { name: 'Install app' })).toHaveCount(0); // offered once
  });

  test('REQ-NFR-08: the app runs in the browser it is opened in with no feature missing that stops the main flow (storage, service worker, canvas, Blob)', async ({ page, browserName }) => {
    await page.goto('/');
    const support = await page.evaluate(() => ({
      idb: 'indexedDB' in window, sw: 'serviceWorker' in navigator, blob: typeof Blob !== 'undefined', bitmap: typeof createImageBitmap === 'function',
      canvas: !!document.createElement('canvas').getContext('2d'), crypto: !!crypto.subtle && typeof crypto.randomUUID === 'function',
    }));
    expect(support, browserName).toEqual({ idb: true, sw: true, blob: true, bitmap: true, canvas: true, crypto: true });
  });
});
