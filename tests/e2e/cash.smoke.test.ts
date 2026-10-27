import { expect, test } from '@playwright/test';
import { createGrant, createTrip, pngFile } from './helpers.ts';

async function openCashForm(page: import('@playwright/test').Page) {
  await createGrant(page);
  await createTrip(page);
  await page.getByRole('link', { name: '+ Cash expense' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cash expense' })).toBeVisible();
}
async function fill(page: import('@playwright/test').Page, payee = 'Street Vendor') {
  await page.getByLabel(/^Amount/).fill('150');
  await page.getByLabel('Date').fill('2026-11-12');
  await page.getByLabel('Paid to (payee)').fill(payee);
  await page.getByLabel('Category').selectOption('meals'); // the sample grant needs a proof for meals
}

test.describe('REQ-CAP-01: cash expense with an optional receipt', () => {
  test('REQ-CAP-01: the trip page offers "+ Cash expense" and "+ Expenses with proof", and the navigation says Proofs', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await expect(page.getByRole('link', { name: '+ Cash expense' })).toBeVisible();
    await expect(page.getByRole('link', { name: '+ Expenses with proof' }).first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Proofs' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add expense' })).toHaveCount(0);
  });

  test('REQ-CAP-01: the cash form has no "Paid by" field and what it saves is cash', async ({ page }) => {
    await openCashForm(page);
    await expect(page.getByLabel('Paid by')).toHaveCount(0);
    await fill(page);
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.locator('[data-testid="flag-chip"][data-rule="CASH_NOT_IN_STATEMENT"]')).toBeVisible();
    await expect(page.locator('[data-testid="flag-chip"][data-rule="UNVERIFIED_AMOUNT"]')).toHaveCount(0);
  });

  test('REQ-CAP-01, REQ-RULE-06: a receipt added on the form is saved with the expense, clears "no proof", and shows on the expense page', async ({ page }) => {
    await openCashForm(page);
    await fill(page, 'Corner Stall');
    await page.getByLabel('Choose receipt files').setInputFiles(pngFile('receipt.png'));
    await expect(page.getByTestId('receipt-file')).toContainText('receipt.png');
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.locator('[data-testid="flag-chip"][data-rule="MISSING_PROOF"]')).toHaveCount(0);
    await page.getByTestId('expense-row').click();
    await expect(page.getByTestId('proof-view')).toContainText('Invoice');
    await expect(page.getByText('No proof attached.')).toHaveCount(0);
  });

  test('REQ-CAP-01: without a receipt a meal still gets the "no proof" warning', async ({ page }) => {
    await openCashForm(page);
    await fill(page);
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.locator('[data-testid="flag-chip"][data-rule="MISSING_PROOF"]')).toBeVisible();
  });

  test('REQ-CAP-01: a receipt can be removed before saving; at most 5 files; other file types are refused with a message', async ({ page }) => {
    await openCashForm(page);
    await page.getByLabel('Choose receipt files').setInputFiles(['a', 'b', 'c', 'd', 'e', 'f'].map((n) => pngFile(`${n}.png`)));
    await expect(page.getByTestId('receipt-file')).toHaveCount(5);
    await expect(page.getByText('at most 5 receipt files')).toBeVisible();
    await page.getByRole('button', { name: 'Remove a.png' }).click();
    await expect(page.getByTestId('receipt-file')).toHaveCount(4);
    await page.getByLabel('Choose receipt files').setInputFiles({ name: 'notes.docx', mimeType: 'application/msword', buffer: Buffer.from('x') });
    await expect(page.getByTestId('receipt-file')).toHaveCount(4);
    await expect(page.getByTestId('receipt-picker')).toContainText('notes.docx');
  });

  test('REQ-CAP-01, REQ-CLM-01: the receipt of a cash expense is a proof in the claim preview', async ({ page }) => {
    await openCashForm(page);
    await fill(page, 'Corner Stall');
    // a real picture (the 1-pixel test image cannot be re-drawn for the claim)
    await page.getByLabel('Choose receipt files').setInputFiles(new URL('../../fixtures/upi-success.png', import.meta.url).pathname);
    await page.getByRole('button', { name: 'Save expense' }).click();
    await page.getByTestId('prepare-claim').click();
    const item = page.getByTestId('claim-item');
    await expect(item).toContainText('Paid in cash');
    await expect(item.getByTestId('claim-proof')).toHaveCount(1);
  });
});

test.describe('REQ-CAP-04: the screen formerly called Inbox', () => {
  test('REQ-CAP-04: it is called "Expenses with proof" and still lives at /inbox', async ({ page }) => {
    await page.goto('/inbox');
    await expect(page.getByRole('heading', { level: 1, name: 'Expenses with proof' })).toBeVisible();
    await expect(page).toHaveTitle(/Expenses with proof · ExpRes/);
    await expect(page.getByTestId('inbox-empty')).toBeVisible();
  });
});
