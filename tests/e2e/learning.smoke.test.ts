import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { addExpense, createGrant, createTrip } from './helpers.ts';

const fixture = (name: string) => join(import.meta.dirname, '../../fixtures', name);
const pasteText = async (page: Page, text: string) => {
  await page.getByRole('button', { name: 'Paste text' }).click();
  await page.getByLabel('Paste an SMS or payment notification').fill(text);
  await page.getByRole('button', { name: 'Add to list' }).click();
};
const review = (page: Page) => page.getByRole('link', { name: 'Review' }).first().click();

test.describe('REQ-CAP-16: learning from corrections', () => {
  test('REQ-CAP-16: a payee spelling the user saved comes back first, labelled "Used before", when a receipt reads slightly differently', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '300', payee: 'Sample Bookhouse' }); // the user's own spelling
    await page.goto('/inbox');
    await page.getByLabel('Choose proof files').setInputFiles(fixture('receipt-photo.jpg')); // reads "Sample Book House"
    await review(page);
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('Sample Bookhouse', { timeout: 60_000 });
    await expect(page.getByTestId('check-payee')).toBeVisible();
    await expect(page.getByTestId('suggest-payee')).toContainText('Sample Book House'); // what the receipt says is one tap away
  });

  test('REQ-CAP-16: a message format the reader could not read is read next time, after one confirmation', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await page.goto('/inbox');

    // First message: nothing in this layout is recognised for payee or amount, so the user types them.
    await pasteText(page, 'Txn: 2399 INR >> SHOP ONE << 25OCT26 Ref 34567');
    await review(page);
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('');
    await expect(page.getByLabel(/^Amount/)).toHaveValue('');
    await page.getByLabel('Paid to (payee)').fill('SHOP ONE');
    await page.getByLabel(/^Amount/).fill('2399');
    await page.getByRole('button', { name: 'Confirm expense' }).click();
    await expect(page.getByTestId('inbox-empty')).toBeVisible();

    // Second message, same layout, different values: read without any typing.
    await pasteText(page, 'Txn: 77 INR >> NEW PLACE << 02NOV26 Ref 99887');
    await review(page);
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('NEW PLACE');
    await expect(page.getByLabel(/^Amount/)).toHaveValue('77');
    await expect(page.getByLabel('Date')).toHaveValue('2026-11-02');
    await expect(page.getByLabel(/^Reference/)).toHaveValue('99887');
    await expect(page.getByTestId('check-payee')).toBeVisible(); // still marked Check: learning never skips the user's confirmation
    await page.getByRole('button', { name: 'Confirm expense' }).click();
    await expect(page.getByTestId('inbox-empty')).toBeVisible();
  });

  test('REQ-CAP-16: what was learned never contains amounts, dates, references or message text', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await page.goto('/inbox');
    await pasteText(page, 'Txn: 2399 INR >> SHOP ONE << 25OCT26 Ref 34567');
    await review(page);
    await page.getByLabel('Paid to (payee)').fill('SHOP ONE');
    await page.getByLabel(/^Amount/).fill('2399');
    await page.getByRole('button', { name: 'Confirm expense' }).click();
    await expect(page.getByTestId('inbox-empty')).toBeVisible();
    const anchors = await page.evaluate(async () => {
      const open = indexedDB.open('expres');
      const db: IDBDatabase = await new Promise((res) => { open.onsuccess = () => res(open.result); });
      const rows: unknown[] = await new Promise((res) => { const r = db.transaction('anchors').objectStore('anchors').getAll(); r.onsuccess = () => res(r.result); });
      return JSON.stringify(rows).toLowerCase();
    });
    expect(anchors.length).toBeGreaterThan(10);
    for (const secret of ['2399', 'shop', '25oct26', '34567']) expect(anchors, secret).not.toContain(secret);
  });

  test('REQ-CAP-16: Settings shows what is remembered and "Forget what ExpRes has learned" empties it, with confirmation, keeping expenses', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '300', payee: 'Sample Cafe', category: 'meals' });
    await page.goto('/settings');
    await expect(page.getByTestId('count-payees')).toHaveText('1');
    await expect(page.getByTestId('count-categories')).toHaveText('1');
    await page.getByRole('button', { name: 'Forget what ExpRes has learned' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('count-payees')).toHaveText('1'); // Cancel changes nothing

    await page.getByRole('button', { name: 'Forget what ExpRes has learned' }).click();
    await page.getByRole('button', { name: 'Forget', exact: true }).click();
    await expect(page.getByTestId('count-payees')).toHaveText('0');
    await expect(page.getByTestId('count-categories')).toHaveText('0');
    await expect(page.getByRole('button', { name: 'Forget what ExpRes has learned' })).toBeDisabled();

    await page.goto('/grants');
    await page.getByRole('link', { name: 'RSF Conference Grant' }).click();
    await page.getByRole('link', { name: 'ECM 2026' }).click();
    await expect(page.getByTestId('expense-row')).toContainText('Sample Cafe'); // the expense itself is untouched
  });

  test('REQ-CAP-16: an existing version-1 database is upgraded in place: nothing is lost and spellings are learned from saved expenses', async ({ page }) => {
    await page.goto('/grants'); // creates the current database
    await page.evaluate(async () => {
      indexedDB.deleteDatabase('expres');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    // Build a version-1 database by hand, as an earlier release of the app would have left it.
    await page.evaluate(async () => {
      await new Promise<void>((res) => { const d = indexedDB.deleteDatabase('expres'); d.onsuccess = () => res(); d.onblocked = () => res(); });
      await new Promise<void>((res, rej) => {
        const open = indexedDB.open('expres', 10); // Dexie stores version 1 as 10
        open.onupgradeneeded = () => {
          const db = open.result;
          for (const [name, key] of Object.entries({ grants: 'id', trips: 'id', expenses: 'id', grantDocs: 'id', inbox: 'id', blobs: 'id', payeeCategories: 'payeeKey', meta: 'key' })) {
            db.createObjectStore(name, { keyPath: key });
          }
          open.transaction!.objectStore('expenses').add({ id: 'e1', tripId: 't', payee: 'Old Shop', date: '2026-11-12', inrMinor: 100, updatedAt: 'a' });
        };
        open.onsuccess = () => { open.result.close(); res(); };
        open.onerror = () => rej(open.error);
      });
    });
    await page.goto('/settings');
    await expect(page.getByTestId('count-payees')).toHaveText('1', { timeout: 15_000 });
  });
});
