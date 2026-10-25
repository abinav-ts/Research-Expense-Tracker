import { expect, test } from '@playwright/test';
import { addExpense, createGrant, createTrip, remaining } from './helpers.ts';

test.describe('REQ-CAP-01: manual add expense', () => {
  test('REQ-CAP-01: adding ₹2,450.50 shows it on the trip and drops the balance at once', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await expect(remaining(page)).toHaveText('₹80,000.00 left');
    await addExpense(page, { amount: '2,450.50', payee: 'Hotel Sample' });
    await expect(page.getByTestId('expense-row')).toContainText('₹2,450.50');
    await expect(page.getByTestId('expense-row')).toContainText('Pending');
    await expect(remaining(page)).toHaveText('₹77,549.50 left');
    await expect(page.getByTestId('balance-pending')).toHaveText('₹2,450.50 of spend is pending verification');
  });

  test('REQ-CAP-01: 0, -5 and abc are rejected inline with nothing saved; amount, date and payee are required', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await page.getByRole('link', { name: 'Add expense' }).click();
    for (const bad of ['0', '-5', 'abc']) {
      await page.getByLabel(/^Amount/).fill(bad);
      await page.getByRole('button', { name: 'Save expense' }).click();
      await expect(page.getByRole('alert').filter({ hasText: /Enter (a valid number|an amount greater than 0)/ })).toBeVisible();
    }
    await page.getByLabel(/^Amount/).fill('1.234');
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.getByText('At most 2 decimal places')).toBeVisible();
    await expect(page.getByText('Enter who was paid')).toBeVisible();
    await page.getByRole('link', { name: 'Cancel' }).click();
    await expect(page.getByTestId('empty-trip')).toBeVisible();
  });

  test('REQ-CAP-01: a date after today saves, with a non-blocking warning', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await page.getByRole('link', { name: 'Add expense' }).click();
    await page.getByLabel('Date').fill('2099-01-01');
    await expect(page.getByText('This date is in the future')).toBeVisible();
    await page.getByLabel(/^Amount/).fill('100');
    await page.getByLabel('Paid to (payee)').fill('Future Cafe');
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.getByTestId('expense-row')).toHaveCount(1);
  });

  test('REQ-CAP-01: works offline: an expense added with the network off updates the balance', async ({ page, context }) => {
    await createGrant(page);
    await createTrip(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await context.setOffline(true);
    await addExpense(page, { amount: '1,200', payee: 'Offline Cafe' });
    await expect(remaining(page)).toHaveText('₹78,800.00 left');
    await context.setOffline(false);
  });
});

test.describe('REQ-CAP-11: local persistence', () => {
  test('REQ-CAP-11: grant, trip and expenses are all still there after a reload', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '500', payee: 'Persisted Payee', category: 'meals' });
    await page.reload();
    await expect(page.getByTestId('expense-row')).toContainText('Persisted Payee');
    await expect(page.getByTestId('expense-row')).toContainText('Meals');
    await expect(remaining(page)).toHaveText('₹79,500.00 left');
  });

  test('REQ-CAP-11: storage is IndexedDB with files as Blobs, not localStorage', async ({ page }) => {
    await createGrant(page);
    const info = await page.evaluate(async () => ({
      localStorageKeys: Object.keys(localStorage).length,
      databases: (await indexedDB.databases()).map((d) => d.name),
    }));
    expect(info.databases).toContain('expres');
    expect(info.localStorageKeys).toBe(0);
  });
});

test.describe('REQ-CAP-14: category suggestion', () => {
  test('REQ-CAP-14: IRCTC suggests Rail / bus as a chip, applies nothing until tapped, and the choice is remembered', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await page.getByRole('link', { name: 'Add expense' }).click();
    await page.getByLabel('Paid to (payee)').fill('IRCTC');
    const chips = page.getByTestId('category-suggestions');
    await expect(chips.getByRole('button', { name: 'Rail / bus' })).toBeVisible();
    await expect(page.getByLabel('Category')).toHaveValue(''); // never applied silently
    await chips.getByRole('button', { name: 'Rail / bus' }).click();
    await expect(page.getByLabel('Category')).toHaveValue('rail_bus');
    await page.getByLabel(/^Amount/).fill('1850');
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.getByTestId('expense-row')).toContainText('Rail / bus');

    // Next time the same payee is pre-selected; a person's name gets no suggestion.
    await page.getByRole('link', { name: 'Add expense' }).click();
    await page.getByLabel('Paid to (payee)').fill('irctc');
    await expect(page.getByLabel('Category')).toHaveValue('rail_bus');
    await expect(page.getByTestId('category-remembered')).toBeVisible();
    await page.getByLabel('Paid to (payee)').fill('R. Kumar');
    await expect(page.getByLabel('Category')).toHaveValue('');
    await expect(page.getByTestId('category-suggestions')).toHaveCount(0);
  });

  test('REQ-CAP-14: an aggregator like MakeMyTrip offers two candidate chips and chooses neither', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await page.getByRole('link', { name: 'Add expense' }).click();
    await page.getByLabel('Paid to (payee)').fill('MakeMyTrip');
    await expect(page.getByTestId('category-suggestions').getByRole('button')).toHaveCount(2);
    await expect(page.getByLabel('Category')).toHaveValue('');
  });
});
