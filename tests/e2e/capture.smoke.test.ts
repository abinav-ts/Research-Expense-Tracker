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

test.describe('REQ-RULE-02: date outside the trip window', () => {
  test('REQ-RULE-02: a date outside the trip ± buffer shows a warning while typing, still saves, and the row is flagged', async ({ page }) => {
    await createGrant(page);
    await createTrip(page); // 10–14 Nov 2026, buffer 2 days → allowed 8–16 Nov
    await page.getByRole('link', { name: 'Add expense' }).click();
    await page.getByLabel('Date').fill('2026-11-08');
    await expect(page.getByTestId('date-window-warning')).toHaveCount(0);
    await page.getByLabel('Date').fill('2026-11-07');
    await expect(page.getByTestId('date-window-warning')).toContainText('Dated 7 Nov 2026, outside the allowed window 8 Nov 2026 to 16 Nov 2026');
    await page.getByLabel(/^Amount/).fill('500');
    await page.getByLabel('Paid to (payee)').fill('Early Cafe');
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.getByTestId('expense-row')).toContainText('Date outside trip window');
    await expect(remaining(page)).toHaveText('₹79,500.00 left'); // a warning never blocks or changes the amount
  });

  test('REQ-RULE-02: "Flagged only" shows just the flagged expenses; editing the trip dates clears the flag at once', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '100', payee: 'In Window', date: '2026-11-12' });
    await addExpense(page, { amount: '200', payee: 'Way Early', date: '2026-10-25' });
    await expect(page.getByTestId('flag-chip')).toHaveCount(1);
    await page.getByLabel(/Flagged only/).check();
    await expect(page.getByTestId('expense-row')).toHaveCount(1);
    await expect(page.getByTestId('expense-row')).toContainText('Way Early');

    await page.getByRole('link', { name: 'Edit trip' }).click();
    await page.getByLabel('Start date').fill('2026-10-24');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByTestId('flag-chip')).toHaveCount(0); // 25 Oct is now inside 22 Oct – 16 Nov
    await expect(page.getByLabel(/Flagged only/)).toBeVisible();
  });

  test('REQ-RULE-02: the expense page explains the flag in full', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '200', payee: 'Way Early', date: '2026-10-25' });
    await page.getByTestId('expense-row').click();
    await expect(page.getByTestId('expense-flag')).toContainText('Dated 25 Oct 2026, outside the allowed window 8 Nov 2026 to 16 Nov 2026');
  });
});
