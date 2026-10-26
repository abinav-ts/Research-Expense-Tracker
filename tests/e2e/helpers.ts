import { expect, type Page } from '@playwright/test';

// 1×1 transparent PNG: a real, valid image for upload tests.
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==', 'base64');
export const pngFile = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG });

export interface GrantInput { name?: string; total?: string; utilised?: string; start?: string; end?: string }

/** Creates a grant through the UI and lands on its page. Defaults: ₹1,00,000 total, ₹20,000 utilised. */
export async function createGrant(page: Page, g: GrantInput = {}) {
  await page.goto('/grants/new');
  await page.getByLabel('Grant name').fill(g.name ?? 'DST Sample Grant');
  await page.getByLabel('Sponsor (optional)').fill('Sample Agency');
  await page.getByLabel('Sanctioned total (₹)').fill(g.total ?? '1,00,000.00');
  await page.getByLabel(/Already utilised/).fill(g.utilised ?? '20,000.00');
  await page.getByLabel('Grant start date').fill(g.start ?? '2026-04-01');
  await page.getByLabel('Grant end date').fill(g.end ?? '2027-03-31');
  await page.getByRole('button', { name: 'Create grant' }).click();
  await expect(page.getByRole('heading', { level: 1, name: g.name ?? 'DST Sample Grant' })).toBeVisible();
}

/** From a grant page: add a trip and land on the trip page. */
export async function createTrip(page: Page, name = 'SampleConf 2026', rates?: { currency: string; rate: string }) {
  await page.getByRole('link', { name: 'Add trip' }).click();
  await page.getByLabel('Conference name').fill(name);
  await page.getByLabel('City').fill('Lisbon');
  await page.getByLabel('Country').fill('Portugal');
  await page.getByLabel('Start date').fill('2026-11-10');
  await page.getByLabel('End date').fill('2026-11-14');
  if (rates) {
    await page.getByRole('button', { name: 'Add a rate' }).click();
    await page.getByLabel('Currency').fill(rates.currency);
    await page.getByLabel('₹ per 1 unit').fill(rates.rate);
  }
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

export interface ExpenseInput { amount: string; payee: string; date?: string; currency?: string; rate?: string; category?: string }

/** From a trip page: add an expense by hand and return to the trip page. */
export async function addExpense(page: Page, e: ExpenseInput) {
  await page.getByRole('link', { name: 'Add expense' }).click();
  if (e.currency) await page.getByLabel('Currency').fill(e.currency);
  await page.getByLabel(/^Amount/).fill(e.amount);
  if (e.rate) await page.getByLabel('Estimated rate (₹ per 1 unit)').fill(e.rate);
  await page.getByLabel('Date').fill(e.date ?? '2026-11-12');
  await page.getByLabel('Paid to (payee)').fill(e.payee);
  if (e.category) await page.getByLabel('Category').selectOption(e.category);
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(page.getByTestId('expense-row').filter({ hasText: e.payee }).first()).toBeVisible();
}

export const remaining = (page: Page) => page.getByTestId('balance-remaining').first();

/** Loads the demo data from the empty Grants screen and opens the sample trip. */
export async function loadDemoAndOpenTrip(page: Page) {
  await page.goto('/grants');
  await page.getByRole('button', { name: 'Load demo data' }).click();
  await expect(page.getByTestId('grant-card')).toBeVisible();
  await page.getByRole('link', { name: /DST Sample Grant/ }).click();
  await page.getByRole('link', { name: 'SampleConf 2026' }).click();
  await expect(page.getByTestId('expense-row')).toHaveCount(4);
}
