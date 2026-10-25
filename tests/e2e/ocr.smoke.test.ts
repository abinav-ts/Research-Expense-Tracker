import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { createGrant, createTrip, pngFile } from './helpers.ts';

const fixture = (name: string) => join(import.meta.dirname, '../../fixtures', name);
const CACHE = 'expres-ocr-v1';

async function openFirstInboxItem(page: Page) {
  await page.getByRole('link', { name: 'Review' }).first().click();
}
const setup = async (page: Page) => {
  await createGrant(page);
  await createTrip(page); // 10–14 Nov 2026: the fixtures are dated 12 Nov
  await page.goto('/inbox');
};

test.describe('REQ-CAP-05: OCR prefill for screenshots', () => {
  test('REQ-CAP-05: the UPI-style screenshot prefills amount, date, payee and reference, each marked Check, within 10 s', async ({ page }) => {
    await setup(page);
    await page.getByLabel('Choose proof files').setInputFiles(fixture('upi-success.png'));
    await openFirstInboxItem(page);
    const started = Date.now();
    await expect(page.getByTestId('ocr-reading')).toBeVisible();
    await expect(page.getByLabel(/^Amount/)).toHaveValue('1200', { timeout: 30_000 });
    await expect(page.getByTestId('ocr-reading')).toHaveCount(0);
    expect(Date.now() - started).toBeLessThan(10_000);
    await expect(page.getByLabel('Date')).toHaveValue('2026-11-12');
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('RAMESH STORES');
    await expect(page.getByLabel(/^Reference/)).toHaveValue('123456789012');
    for (const field of ['amountText', 'date', 'payee', 'reference']) await expect(page.getByTestId(`check-${field}`)).toBeVisible();

    // A mark goes away once the user edits that field; the others stay until edited.
    await page.getByLabel('Paid to (payee)').fill('RAMESH STORES PVT');
    await expect(page.getByTestId('check-payee')).toHaveCount(0);
    await expect(page.getByTestId('check-amountText')).toBeVisible();

    // The raw recognised text is only in memory: nothing of it is in the stored Inbox item.
    const stored = await page.evaluate(async () => {
      const open = indexedDB.open('expres');
      const db: IDBDatabase = await new Promise((res) => { open.onsuccess = () => res(open.result); });
      const rows: unknown[] = await new Promise((res) => { const r = db.transaction('inbox').objectStore('inbox').getAll(); r.onsuccess = () => res(r.result); });
      return JSON.stringify(rows);
    });
    expect(stored).not.toContain('RAMESH');
    expect(stored).not.toContain('123456789012');

    await page.getByRole('button', { name: 'Confirm expense' }).click();
    await expect(page.getByTestId('inbox-empty')).toBeVisible();
  });

  test('REQ-CAP-05: a card-alert screenshot prefills ₹2,450.00 and HOTEL SAMPLE; card digits and the limit never reach the page', async ({ page }) => {
    await setup(page);
    await page.getByLabel('Choose proof files').setInputFiles(fixture('card-alert-sms.png'));
    await openFirstInboxItem(page);
    await expect(page.getByLabel(/^Amount/)).toHaveValue('2450', { timeout: 30_000 });
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('HOTEL SAMPLE');
    await expect(page.getByLabel('Date')).toHaveValue('2026-11-12');
    const words = await page.getByTestId('assigner-words').innerText();
    expect(words).not.toContain('1234');
    expect(words).not.toContain('85,000');
  });

  test('REQ-CAP-05: a foreign invoice only suggests: the total and currency are filled for the user to confirm', async ({ page }) => {
    await setup(page);
    await page.getByLabel('Choose proof files').setInputFiles(fixture('foreign-invoice.png'));
    await openFirstInboxItem(page);
    await expect(page.getByLabel(/^Amount/)).toHaveValue('180', { timeout: 30_000 });
    await expect(page.getByLabel('Currency')).toHaveValue('EUR');
    await expect(page.getByTestId('check-currency')).toBeVisible();
    await expect(page.getByLabel('Estimated rate (₹ per 1 unit)')).toBeVisible(); // a rate is still needed from the user
  });

  test('REQ-CAP-05: words read from a screenshot can be tapped to fix a field (REQ-CAP-15)', async ({ page }) => {
    await setup(page);
    await page.getByLabel('Choose proof files').setInputFiles(fixture('upi-success.png'));
    await openFirstInboxItem(page);
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('RAMESH STORES', { timeout: 30_000 });
    await page.getByTestId('assigner-words').getByRole('button', { name: 'RAMESH', exact: true }).click();
    await page.getByRole('button', { name: 'Use as payee' }).click();
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('RAMESH');
    await expect(page.getByTestId('check-payee')).toHaveCount(0);
  });

  test('REQ-CAP-05: an unreadable image leaves the form empty and the expense can still be saved', async ({ page }) => {
    await setup(page);
    await page.getByLabel('Choose proof files').setInputFiles(pngFile('blank.png'));
    await openFirstInboxItem(page);
    await expect(page.getByTestId('ocr-note')).toHaveAttribute('data-phase', /nothing-found|failed/, { timeout: 30_000 });
    await expect(page.getByLabel(/^Amount/)).toHaveValue('');
    await page.getByLabel(/^Amount/).fill('75');
    await page.getByLabel('Paid to (payee)').fill('Typed By Hand');
    await page.getByLabel('Date').fill('2026-11-12');
    await page.getByRole('button', { name: 'Confirm expense' }).click();
    await expect(page.getByTestId('inbox-empty')).toBeVisible();
  });

  test('REQ-CAP-05: the Reading indicator can be dismissed, and the form stays usable', async ({ page }) => {
    await setup(page);
    await page.getByLabel('Choose proof files').setInputFiles(fixture('upi-success.png'));
    await openFirstInboxItem(page);
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByTestId('ocr-reading')).toHaveCount(0);
    await page.waitForTimeout(3000);
    await expect(page.getByLabel(/^Amount/)).toHaveValue(''); // a dismissed reading never fills the form later
  });

  test('REQ-CAP-05: recognition never overwrites what the user already typed', async ({ page }) => {
    await setup(page);
    await page.getByLabel('Choose proof files').setInputFiles(fixture('upi-success.png'));
    await openFirstInboxItem(page);
    await page.getByLabel('Paid to (payee)').fill('My Own Words');
    await expect(page.getByLabel(/^Amount/)).toHaveValue('1200', { timeout: 30_000 });
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('My Own Words');
  });
});

test.describe('REQ-DEMO-05: synthetic watermarked fixtures', () => {
  for (const name of ['upi-success.png', 'card-alert-sms.png', 'foreign-invoice.png']) {
    test(`REQ-DEMO-05: fixtures/${name} is watermarked SAMPLE and is read by recognition`, async ({ page }) => {
      await setup(page);
      await page.getByLabel('Choose proof files').setInputFiles(fixture(name));
      await openFirstInboxItem(page);
      await expect(page.getByTestId('ocr-note')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('assigner-words')).toContainText('SAMPLE'); // the footer watermark was read
      await expect(page.getByTestId('assigner-words')).toContainText('synthetic');
    });
  }
});

test.describe('REQ-OFF-05: OCR assets self-hosted and cached', () => {
  test('REQ-OFF-05: recognition data comes only from our own origin, is cached in the background, and the Inbox says it is ready', async ({ page }) => {
    const hosts = new Set<string>();
    page.on('request', (r) => hosts.add(new URL(r.url()).host));
    await page.goto('/inbox');
    await expect(page.getByTestId('ocr-status')).toHaveAttribute('data-state', /downloading|ready/, { timeout: 15_000 });
    await expect(page.getByTestId('ocr-status')).toHaveText('✓ Recognition ready', { timeout: 60_000 });
    const cached = await page.evaluate(async (name) => (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname), CACHE);
    expect(cached.sort()).toEqual([
      expect.stringMatching(/^\/ocr\/core\/tesseract-core-(relaxedsimd-|simd-)?lstm\.wasm\.js$/),
      '/ocr/lang/eng.traineddata.gz',
      '/ocr/worker.min.js',
    ].sort((a, b) => (typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : 0)) as string[]);
    expect([...hosts]).toEqual(['localhost:4173']);
  });

  test('REQ-OFF-05: while downloading the Inbox shows the size progress', async ({ page }) => {
    await page.route('**/ocr/lang/eng.traineddata.gz', async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await page.goto('/inbox');
    await expect(page.getByTestId('ocr-status')).toContainText(/Downloading recognition data \(\d+\.\d of \d+\.\d MB\)…/, { timeout: 15_000 });
    await expect(page.getByTestId('ocr-status')).toHaveText('✓ Recognition ready', { timeout: 60_000 });
  });

  test('REQ-OFF-05: once cached, a screenshot is read with the network off', async ({ page, context }) => {
    await setup(page);
    await expect(page.getByTestId('ocr-status')).toHaveText('✓ Recognition ready', { timeout: 60_000 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // now controlled by the service worker
    await expect(page.getByTestId('ocr-status')).toHaveText('✓ Recognition ready');
    await context.setOffline(true);
    await page.getByLabel('Choose proof files').setInputFiles(fixture('upi-success.png'));
    await openFirstInboxItem(page);
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('RAMESH STORES', { timeout: 30_000 });
    await context.setOffline(false);
  });

  test('REQ-OFF-05: offline before the data is cached, recognition is off with a clear message and the form still works', async ({ page, context }) => {
    await page.route('**/ocr/**', (route) => route.abort()); // the data can never be fetched in this test
    await setup(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.getByLabel('Choose proof files').setInputFiles(fixture('upi-success.png'));
    await openFirstInboxItem(page);
    await expect(page.getByTestId('ocr-status')).toContainText('not downloaded yet', { timeout: 10_000 });
    await expect(page.getByTestId('ocr-note')).toHaveAttribute('data-phase', 'unavailable');
    await expect(page.getByLabel(/^Amount/)).toHaveValue('');
    await page.getByLabel(/^Amount/).fill('1200'); // the form still works
    await context.setOffline(false);
  });
});
