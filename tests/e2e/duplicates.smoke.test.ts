import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { addExpense, createGrant, createTrip, pngFile } from './helpers.ts';

const fixture = (name: string) => join(import.meta.dirname, '../../fixtures', name);
const warning = (page: Page) => page.getByTestId('duplicate-warning');

async function fillExpense(page: Page, e: { amount: string; payee: string; date?: string; reference?: string }) {
  await page.getByLabel(/^Amount/).fill(e.amount);
  await page.getByLabel('Date').fill(e.date ?? '2026-11-12');
  await page.getByLabel('Paid to (payee)').fill(e.payee);
  if (e.reference) await page.getByLabel(/^Reference/).fill(e.reference);
}

test.describe('REQ-CAP-07: duplicate warning', () => {
  test('REQ-CAP-07: the same amount, date and payee warns first; "Save anyway" saves a second copy, "Discard" leaves without saving', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '560', payee: 'Blossom Book House' });

    await page.getByRole('link', { name: '+ Cash expense' }).click();
    await fillExpense(page, { amount: '560.00', payee: 'blossom BOOK house' });
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(warning(page)).toContainText('Looks like a duplicate of Blossom Book House ₹560.00 on 12 Nov 2026 (the same amount, date and payee)');
    await expect(page).toHaveURL(/expenses\/new/); // nothing was saved yet

    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByTestId('expense-row')).toHaveCount(1);

    await page.getByRole('link', { name: '+ Cash expense' }).click();
    await fillExpense(page, { amount: '560', payee: 'Blossom Book House' });
    await page.getByRole('button', { name: 'Save expense' }).click();
    await page.getByRole('button', { name: 'Save anyway' }).click();
    await expect(page.getByTestId('expense-row')).toHaveCount(2);
  });

  test('REQ-CAP-07: the same reference warns even when amount, date and payee differ', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await page.getByRole('link', { name: '+ Cash expense' }).click();
    await fillExpense(page, { amount: '100', payee: 'Shop A', reference: 'INV-4471' });
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.getByTestId('expense-row')).toHaveCount(1);

    await page.getByRole('link', { name: '+ Cash expense' }).click();
    await fillExpense(page, { amount: '999', payee: 'Shop B', date: '2026-11-13', reference: 'inv-4471' });
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(warning(page)).toContainText('(the same reference number)');
  });

  test('REQ-CAP-07: a different amount, date or payee is not warned about', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '560', payee: 'Blossom Book House' });
    await addExpense(page, { amount: '561', payee: 'Blossom Book House' });
    await addExpense(page, { amount: '560', payee: 'Blossom Book House', date: '2026-11-13' });
    await addExpense(page, { amount: '560', payee: 'Other Shop' });
    await expect(page.getByTestId('expense-row')).toHaveCount(4);
  });

  test('REQ-CAP-07: the same image added again is caught by its file fingerprint, however the details are typed', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await page.goto('/inbox');
    await page.getByLabel('Choose proof files').setInputFiles(fixture('foreign-invoice.png'));
    await page.getByRole('link', { name: 'Review' }).click();
    await fillExpense(page, { amount: '100', payee: 'Lisbon Society' });
    await page.getByRole('button', { name: 'Confirm expense' }).click();
    await expect(page.getByTestId('inbox-empty')).toBeVisible();

    await page.getByLabel('Choose proof files').setInputFiles(fixture('foreign-invoice.png')); // the very same file
    await page.getByRole('link', { name: 'Review' }).click();
    await fillExpense(page, { amount: '55', payee: 'Typed completely differently', date: '2026-11-14' });
    await page.getByRole('button', { name: 'Confirm expense' }).click();
    await expect(warning(page)).toContainText('(the same file or message)');
    await expect(warning(page)).toContainText('Lisbon Society');

    // Discard in the Inbox asks for confirmation, like the normal Discard button.
    await warning(page).getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Discard this item?');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await warning(page).getByRole('button', { name: 'Save anyway' }).click();
    await expect(page.getByTestId('inbox-empty')).toBeVisible();
    await page.getByRole('link', { name: 'Grants' }).click();
    await page.getByRole('link', { name: 'RSF Conference Grant' }).click();
    await page.getByRole('link', { name: 'ECM 2026' }).click();
    await expect(page.getByTestId('expense-row')).toHaveCount(2);
  });

  test('REQ-CAP-07: the same pasted message is caught too', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await page.goto('/inbox');
    for (let round = 0; round < 2; round++) {
      await page.getByRole('button', { name: 'Paste text' }).click();
      await page.getByLabel('Paste an SMS or payment notification').fill('Rs 2399 spent@ ABDUSROLLS on 12NOV26 Ref 34567');
      await page.getByRole('button', { name: 'Add to list' }).click();
    }
    await expect(page.getByTestId('inbox-item')).toHaveCount(2);
    await page.getByRole('link', { name: 'Review' }).first().click();
    await page.getByLabel(/^Reference/).fill(''); // so only the message itself can match
    await page.getByLabel('Paid to (payee)').fill('First Entry');
    await page.getByRole('button', { name: 'Confirm expense' }).click(); // opens the next item automatically
    await page.getByLabel(/^Reference/).fill('');
    await page.getByLabel('Paid to (payee)').fill('Second Entry');
    await page.getByLabel(/^Amount/).fill('5');
    await page.getByRole('button', { name: 'Confirm expense' }).click();
    await expect(warning(page)).toContainText('(the same file or message)');
  });

  test('REQ-CAP-07: the same invoice under another trip of the same grant is still a duplicate', async ({ page }) => {
    await createGrant(page);
    await createTrip(page, 'First Conf');
    await addExpense(page, { amount: '560', payee: 'Blossom Book House' });
    await page.getByRole('link', { name: 'RSF Conference Grant' }).click();
    await createTrip(page, 'Second Conf');
    await page.getByRole('link', { name: '+ Cash expense' }).click();
    await fillExpense(page, { amount: '560', payee: 'Blossom Book House' });
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(warning(page)).toContainText('Looks like a duplicate of Blossom Book House');
  });

  test('REQ-CAP-07: saving a change to an expense does not flag it against itself', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '560', payee: 'Blossom Book House' });
    await page.getByTestId('expense-row').click();
    await page.getByLabel('Note (optional)').fill('edited');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByTestId('expense-row')).toHaveCount(1); // saved straight away, no warning
  });

  test('REQ-CAP-07: editing an expense so that it matches another warns, with "Keep editing" instead of Discard', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '560', payee: 'Blossom Book House' });
    await addExpense(page, { amount: '300', payee: 'Blossom Book House' });
    await page.getByTestId('expense-row').filter({ hasText: '₹300.00' }).click();
    await page.getByLabel(/^Amount/).fill('560');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(warning(page)).toBeVisible();
    await warning(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(warning(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/expenses\//);
  });

  test('REQ-CAP-07: the warning is amber with an icon and words, and changing a field clears it', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '560', payee: 'Blossom Book House' });
    await page.getByRole('link', { name: '+ Cash expense' }).click();
    await fillExpense(page, { amount: '560', payee: 'Blossom Book House' });
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(warning(page)).toHaveClass(/border-state-low/);
    await expect(warning(page).locator('li').first()).toContainText('⚠');
    await page.getByLabel(/^Amount/).fill('561');
    await expect(warning(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Save expense' }).click(); // different amount now: saved straight away
    await expect(page.getByTestId('expense-row')).toHaveCount(2);
  });

  test('REQ-CAP-07: an unrelated file is not flagged', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await page.goto('/inbox');
    for (const name of ['a.png', 'b.png']) {
      await page.getByLabel('Choose proof files').setInputFiles({ ...pngFile(name), buffer: Buffer.concat([pngFile(name).buffer, Buffer.from(name)]) });
    }
    await expect(page.getByTestId('inbox-item')).toHaveCount(2);
  });
});
