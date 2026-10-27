import { expect, test } from '@playwright/test';
import { addExpense, createGrant, createTrip } from './helpers.ts';

test.describe('REQ-CAP-17: payee autocomplete and list', () => {
  test('REQ-CAP-17: payees saved before are offered while typing in the payee field', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '560', payee: 'Blossom Book House' });
    await addExpense(page, { amount: '90', payee: 'Cafe Sample' });
    await page.getByRole('link', { name: '+ Cash expense' }).click();
    await expect(page.getByLabel('Paid to (payee)')).toHaveAttribute('list', 'known-payees');
    await expect(page.locator('#known-payees option')).toHaveCount(2);
    const offered = await page.locator('#known-payees option').evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
    expect(offered.sort()).toEqual(['Blossom Book House', 'Cafe Sample']);
  });

  test('REQ-CAP-17: Settings lists the payees with category and how often saved', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '560', payee: 'Blossom Book House', category: 'other' });
    await addExpense(page, { amount: '90', payee: 'Cafe Sample', category: 'meals' });
    await addExpense(page, { amount: '95', payee: 'Cafe Sample', date: '2026-11-13' });
    await page.goto('/settings');
    const rows = page.getByTestId('payee-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Blossom Book House');
    await expect(rows.nth(0)).toContainText('Other · saved 1 time');
    await expect(rows.nth(1)).toContainText('Cafe Sample');
    await expect(rows.nth(1)).toContainText('Meals · saved 2 times');
  });

  test('REQ-CAP-17: renaming a misspelt payee corrects what is suggested, and leaves saved expenses as they are', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '560', payee: 'Blossom Bock House', category: 'other' });
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Rename Blossom Bock House' }).click();
    await page.getByLabel('New name for Blossom Bock House').fill('Blossom Book House');
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(page.getByTestId('payee-name')).toHaveText('Blossom Book House');

    await page.goto('/grants');
    await page.getByRole('link', { name: 'DST Sample Grant' }).click();
    await page.getByRole('link', { name: 'SampleConf 2026' }).click();
    await expect(page.getByTestId('expense-row')).toContainText('Blossom Bock House'); // the saved expense is untouched
    await page.getByRole('link', { name: '+ Cash expense' }).click();
    await expect(page.locator('#known-payees option')).toHaveCount(1);
    const offered = await page.locator('#known-payees option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
    expect(offered).toEqual(['Blossom Book House']);
    await page.getByLabel('Paid to (payee)').fill('blossom book house');
    await expect(page.getByLabel('Category')).toHaveValue('other'); // the category memory moved with the name
  });

  test('REQ-CAP-17: Remove asks first; Cancel keeps the payee, Forget payee removes it', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '90', payee: 'Cafe Sample' });
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Remove Cafe Sample' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Saved expenses are not changed');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('payee-row')).toHaveCount(1);
    await page.getByRole('button', { name: 'Remove Cafe Sample' }).click();
    await page.getByRole('button', { name: 'Forget payee' }).click();
    await expect(page.getByTestId('payees-empty')).toBeVisible();
  });

  test('REQ-CAP-17: an empty new name is refused with a message and the payee keeps its name', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '90', payee: 'Cafe Sample' });
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Rename Cafe Sample' }).click();
    await page.getByLabel('New name for Cafe Sample').fill('   ');
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Enter a name for this payee' })).toBeVisible();
    await expect(page.getByLabel('New name for Cafe Sample')).toBeVisible(); // still editing
  });

  test('REQ-CAP-17: on a phone the payee rows keep a readable name and 44 px buttons', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '90', payee: 'A Rather Long Business Name Private Limited, Bengaluru' });
    await page.goto('/settings');
    const name = await page.getByTestId('payee-name').boundingBox();
    expect(name!.width).toBeGreaterThan(200);
    for (const button of await page.getByTestId('payee-row').getByRole('button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});
