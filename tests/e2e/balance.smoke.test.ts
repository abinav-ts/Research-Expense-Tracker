import { expect, test } from '@playwright/test';
import { addExpense, loadDemoAndOpenTrip, remaining } from './helpers.ts';

const state = (page: import('@playwright/test').Page) => page.getByTestId('balance-state').first();

test.describe('REQ-BAL-02: indicator states', () => {
  test('REQ-BAL-02: Healthy → Low → Overspent each show a distinct word and icon, with an accessible label', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    const indicator = page.getByTestId('balance-indicator').first();
    await expect(state(page)).toHaveText('Healthy');
    await expect(indicator).toHaveAttribute('aria-label', /Grant balance: ₹35,910.00 remaining, 35 percent, Healthy/);
    await expect(indicator.locator('svg')).toBeVisible();
    await expect(page.getByTestId('balance-percent').first()).toContainText('35% of ₹1,00,000.00 sanctioned');

    await addExpense(page, { amount: '30,000', payee: 'Big One' });
    await expect(state(page)).toHaveText('Low');
    await expect(remaining(page)).toHaveText('₹5,910.00 left');
    await expect(indicator).toHaveAttribute('data-state', 'low');

    await addExpense(page, { amount: '10,000', payee: 'Bigger One' });
    await expect(state(page)).toHaveText('Overspent');
    await expect(remaining(page)).toHaveText('Overspent by ₹4,090.00');
    await expect(indicator).toHaveAttribute('aria-label', /overspent by ₹4,090.00, Overspent/);
  });

  test('REQ-BAL-02: the indicator is on both the grants screen and the trip screen and agrees', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    await expect(page.getByTestId('balance-indicator')).toHaveCount(1);
    await page.goto('/grants');
    await expect(page.getByTestId('grant-card').getByTestId('balance-remaining')).toHaveText('₹35,910.00 left');
  });
});

test.describe('REQ-BAL-01 and REQ-BAL-06: live update and pending split', () => {
  test('REQ-BAL-01: the balance moves immediately on add, edit, exclude and delete, with no reload', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    await expect(remaining(page)).toHaveText('₹35,910.00 left');
    await addExpense(page, { amount: '1,000', payee: 'Snack Bar' });
    await expect(remaining(page)).toHaveText('₹34,910.00 left');
    await page.getByTestId('expense-row').filter({ hasText: 'Snack Bar' }).click();
    await page.getByLabel(/^Amount/).fill('2,000');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(remaining(page)).toHaveText('₹33,910.00 left');
    await page.getByTestId('expense-row').filter({ hasText: 'Snack Bar' }).click();
    await page.getByRole('button', { name: 'Exclude' }).click();
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await expect(remaining(page)).toHaveText('₹35,910.00 left');
  });

  test('REQ-BAL-06: all demo spend is pending verification, called out under the remaining amount', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    await expect(page.getByTestId('balance-pending').first()).toHaveText('₹44,090.00 of spend is pending verification');
  });

  test('REQ-BAL-06: with no spend the "pending verification" phrase is not shown', async ({ page }) => {
    await page.goto('/grants/new');
    await page.getByLabel('Grant name').fill('Empty');
    await page.getByLabel('Sanctioned total (₹)').fill('1000');
    await page.getByLabel('Grant start date').fill('2026-01-01');
    await page.getByLabel('Grant end date').fill('2026-12-31');
    await page.getByRole('button', { name: 'Create grant' }).click();
    await expect(remaining(page)).toHaveText('₹1,000.00 left');
    await expect(page.getByTestId('balance-pending')).toHaveCount(0);
  });
});
