import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { createGrant, createTrip } from './helpers.ts';

// fixtures/upi-success.heic is the UPI-style fixture saved as HEIC, the format iPhones use.
const heic = join(import.meta.dirname, '../../fixtures/upi-success.heic');

test.describe('REQ-CAP-02: iPhone (HEIC) photos', () => {
  test('REQ-CAP-02: in a browser that can open HEIC (Safari) the photo becomes a JPEG in the Inbox and is read like any other', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'HEIC can only be opened by WebKit');
    await createGrant(page);
    await createTrip(page);
    await page.goto('/inbox');
    await page.getByLabel('Choose proof files').setInputFiles(heic);

    await expect(page.getByTestId('inbox-item')).toHaveCount(1);
    await expect(page.getByTestId('inbox-item')).toContainText('upi-success.jpg'); // renamed: it is a JPEG now
    await expect(page.getByTestId('inbox-item').locator('img')).toBeVisible(); // and it can be shown
    await page.getByRole('link', { name: 'Review' }).click();

    // What was stored is a real JPEG with no HEIC left in it.
    const stored = await page.evaluate(async () => {
      const open = indexedDB.open('expres');
      const db: IDBDatabase = await new Promise((res) => { open.onsuccess = () => res(open.result); });
      const items: { mime: string; name: string; blobKey: string }[] = await new Promise((res) => { const r = db.transaction('inbox').objectStore('inbox').getAll(); r.onsuccess = () => res(r.result); });
      const row: { blob?: Blob; bytes?: ArrayBuffer } = await new Promise((res) => { const r = db.transaction('blobs').objectStore('blobs').get(items[0]!.blobKey); r.onsuccess = () => res(r.result); });
      // Safari may keep the file as a Blob or, where it cannot, as bytes: read either
      const buffer = row.blob ? await row.blob.arrayBuffer() : row.bytes!;
      const head = new Uint8Array(buffer, 0, 3);
      return { mime: items[0]!.mime, name: items[0]!.name, jpegSignature: head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff, size: buffer.byteLength };
    });
    expect(stored).toMatchObject({ mime: 'image/jpeg', name: 'upi-success.jpg', jpegSignature: true });
    expect(stored.size).toBeLessThan(2_000_000);

    await expect(page.getByLabel(/^Amount/)).toHaveValue('1200', { timeout: 90_000 });
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('RAMESH STORES');
  });

  test('REQ-CAP-02: in a browser that cannot open HEIC the photo is skipped with a clear message, and other files in the pick are still added', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'this is the browser without HEIC support');
    await page.goto('/inbox');
    await page.getByLabel('Choose proof files').setInputFiles([heic, join(import.meta.dirname, '../../fixtures/foreign-invoice.png')]);
    await expect(page.getByText('"upi-success.heic" is a HEIC photo and this browser cannot open it.')).toBeVisible();
    await expect(page.getByText(/share the photo as a JPEG/)).toBeVisible();
    await expect(page.getByTestId('inbox-item')).toHaveCount(1); // the PNG was added
    await expect(page.getByTestId('inbox-item')).toContainText('foreign-invoice.png');
  });

  test('REQ-CAP-02: grant documents accept an iPhone photo too (converted to JPEG in Safari)', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'HEIC can only be opened by WebKit');
    await createGrant(page);
    await page.locator('#grant-doc-input').setInputFiles(heic);
    await expect(page.getByTestId('grant-doc')).toContainText('upi-success.jpg');
    await expect(page.getByTestId('grant-doc')).toContainText('JPEG');
  });

  test('REQ-CAP-02: the file pickers offer HEIC to the phone', async ({ page }) => {
    await page.goto('/inbox');
    await expect(page.getByLabel('Choose proof files')).toHaveAttribute('accept', /\.heic/);
    await expect(page.getByLabel('Choose proof files')).toHaveAttribute('accept', /image\/heic/);
  });
});
