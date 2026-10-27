import { expect, test } from '@playwright/test';
import { loadDemoAndOpenTrip, remaining } from './helpers.ts';

test.describe('REQ-CAP-06: expense list', () => {
  test('REQ-CAP-06, REQ-DEMO-02: the demo data gives a trip whose expenses are grouped by day (newest first) with day totals, category, status and proof thumbnails', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    const days = page.getByTestId('day-group');
    await expect(days).toHaveCount(4);
    await expect(days.first()).toContainText('12 Nov 2026');
    await expect(days.first().getByTestId('day-total')).toHaveText('₹17,100.00');
    await expect(days.last()).toContainText('9 Nov 2026');
    const foreign = days.first().getByTestId('expense-row');
    await expect(foreign).toContainText('Lisbon Computing Society');
    await expect(foreign).toContainText('EUR 180.00');
    await expect(foreign).toContainText('Estimated');
    await expect(foreign).toContainText('Registration');
    await expect(foreign.locator('img')).toBeVisible();
    await expect(page.getByTestId('trip-total')).toHaveText('₹44,090.00');
    await expect(page.getByTestId('trip-pending')).toHaveText('₹44,090.00');
    await expect(page.getByTestId('trip-confirmed')).toHaveText('₹0.00');
  });

  test('REQ-CAP-06: filters narrow the list, can be cleared, and never change the trip totals', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    await page.getByLabel('Category').selectOption('accommodation');
    await expect(page.getByTestId('expense-row')).toHaveCount(1);
    await expect(page.getByTestId('expense-row')).toContainText('HOTEL SAMPLE');
    await expect(page.getByText('Showing 1 of 4 expenses.')).toBeVisible();
    await expect(page.getByTestId('trip-total')).toHaveText('₹44,090.00');
    await page.getByLabel('Status').selectOption('confirmed');
    await expect(page.getByText('No expenses match these filters.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByTestId('expense-row')).toHaveCount(4);
  });

  test('REQ-CAP-06: excluding dims the row, labels it, and the balance rises; including puts it back', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    await expect(remaining(page)).toHaveText('₹35,910.00 left');
    await page.getByTestId('expense-row').filter({ hasText: 'HOTEL SAMPLE' }).click();
    await page.getByRole('button', { name: 'Exclude' }).click();
    await expect(page.getByText('Excluded: not counted in the balance')).toBeVisible();
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    const row = page.getByTestId('expense-row').filter({ hasText: 'HOTEL SAMPLE' });
    await expect(row).toContainText('Excluded');
    await expect(remaining(page)).toHaveText('₹60,410.00 left');
    await expect(page.getByTestId('trip-total')).toHaveText('₹19,590.00');
    await row.click();
    await page.getByRole('button', { name: 'Include again' }).click();
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await expect(remaining(page)).toHaveText('₹35,910.00 left');
  });

  test('REQ-CAP-06: editing an expense updates the balance; deleting asks first and then removes it and its proof', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    await page.getByTestId('expense-row').filter({ hasText: 'Uber' }).click();
    await expect(page.getByTestId('proof-view')).toContainText('UPI screenshot');
    await page.getByLabel(/^Amount/).fill('1,640');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(remaining(page)).toHaveText('₹34,910.00 left');

    await page.getByTestId('expense-row').filter({ hasText: 'Uber' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Delete expense' }).click();
    await expect(page.getByTestId('expense-row')).toHaveCount(3);
    await expect(remaining(page)).toHaveText('₹36,550.00 left');
  });

  test('REQ-CAP-06: an empty trip explains how to add the first expense', async ({ page }) => {
    await page.goto('/grants/new');
    await page.getByLabel('Grant name').fill('G');
    await page.getByLabel('Sanctioned total (₹)').fill('1000');
    await page.getByLabel('Grant start date').fill('2026-01-01');
    await page.getByLabel('Grant end date').fill('2026-12-31');
    await page.getByRole('button', { name: 'Create grant' }).click();
    await page.getByRole('link', { name: 'Add trip' }).click();
    await page.getByLabel('Conference name').fill('T');
    await page.getByLabel('City').fill('C');
    await page.getByLabel('Country').fill('X');
    await page.getByLabel('Start date').fill('2026-02-01');
    await page.getByLabel('End date').fill('2026-02-02');
    await page.getByRole('button', { name: 'Create trip' }).click();
    await expect(page.getByTestId('empty-trip')).toContainText('+ Cash expense');
  });
});
