import { expect, test, type Page } from '@playwright/test';
import { addExpense, addProofExpense, createGrant, createTrip, loadDemoAndOpenTrip, remaining } from './helpers.ts';

/** Changes what is stored directly (there is no screen for grant rules yet: REQ-SET-04 is later). */
async function patchStore(page: Page, table: 'grants' | 'expenses', change: (row: Record<string, unknown>, all: Record<string, unknown>[]) => void) {
  await page.evaluate(async ({ table, source }) => {
    const apply = new Function('row', 'all', source) as (row: Record<string, unknown>, all: Record<string, unknown>[]) => void;
    const open = indexedDB.open('expres');
    const db: IDBDatabase = await new Promise((res) => { open.onsuccess = () => res(open.result); });
    const rows: Record<string, unknown>[] = await new Promise((res) => { const r = db.transaction(table).objectStore(table).getAll(); r.onsuccess = () => res(r.result); });
    for (const row of rows) apply(row, rows);
    await new Promise<void>((res) => { const tx = db.transaction(table, 'readwrite'); for (const row of rows) tx.objectStore(table).put(row); tx.oncomplete = () => res(); });
    db.close();
  }, { table, source: change.toString().replace(/^[^{]*\{/, '').replace(/\}[^}]*$/, '') });
}
const chips = (page: Page, rule: string) => page.locator(`[data-testid="flag-chip"][data-rule="${rule}"]`);

test.describe('REQ-RULE-01: flags on the trip screens', () => {
  test('REQ-RULE-01: an expense with no category and no proof shows a "Needs a category" chip; choosing one clears it', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '500', payee: 'Corner Cafe' });
    await expect(chips(page, 'UNCATEGORISED')).toHaveCount(1);
    await expect(chips(page, 'UNCATEGORISED')).toContainText('✖ Needs a category');
    await page.getByTestId('expense-row').click();
    await page.locator('#categoryId').selectOption('meals'); // the form's field (the trip page has a "Category" filter too)
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(chips(page, 'UNCATEGORISED')).toHaveCount(0);
    await expect(chips(page, 'MISSING_PROOF')).toContainText('⚠ No proof attached'); // meals need proof and none is attached
  });

  test('REQ-RULE-01: a row shows at most two chips and "+N more"; the expense page lists every flag with its message', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addProofExpense(page, { amount: '500', payee: 'Far Away', date: '2026-10-01' }); // a bank-paid proof, outside dates, no category
    const row = page.getByTestId('expense-row');
    await expect(row.locator('[data-testid="flag-chip"]')).toHaveCount(2);
    await row.click();
    await expect(page.getByTestId('expense-flag')).toHaveCount(3); // date, category, and "not yet verified"
    await expect(page.locator('[data-testid="expense-flag"][data-rule="UNVERIFIED_AMOUNT"]')).toContainText('The grant authority accepts only the statement amount');
  });

  test('REQ-RULE-01: "Flagged only" shows just the expenses with a flag and its count matches', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '100', payee: 'Clean Cafe', category: 'meals' });
    await page.getByTestId('expense-row').click();
    await page.getByRole('button', { name: 'Exclude' }).click(); // so no proof flag can matter: excluded items are not checked
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await addExpense(page, { amount: '200', payee: 'No Category' });
    await expect(page.locator('label', { hasText: 'Flagged only' })).toContainText('(1)');
    await page.getByLabel(/Flagged only/).check();
    await expect(page.getByTestId('expense-row')).toHaveCount(1);
    await expect(page.getByTestId('expense-row')).toContainText('No Category');
  });
});

test.describe('REQ-RULE-03, REQ-RULE-05: grant rules reach the screens', () => {
  test('REQ-RULE-05, REQ-RULE-03: a category marked not eligible, and a category over its cap, are flagged on the trip screen', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '2,000', payee: 'Taxi One', category: 'local_transport', date: '2026-11-11' });
    await addExpense(page, { amount: '1,500', payee: 'Taxi Two', category: 'local_transport', date: '2026-11-12' });
    await addExpense(page, { amount: '300', payee: 'Lunch Place', category: 'meals', date: '2026-11-12' });
    await patchStore(page, 'grants', (row) => {
      const rules = row.rules as { categories: Record<string, { eligible: boolean; capPerTripMinor?: number }> };
      rules.categories.local_transport!.capPerTripMinor = 300_000; // ₹3,000 cap
      rules.categories.meals!.eligible = false;
    });
    await page.reload();
    await expect(chips(page, 'OVER_CATEGORY_CAP')).toHaveCount(1); // only the item that crosses the cap
    await expect(page.getByTestId('expense-row').filter({ has: chips(page, 'OVER_CATEGORY_CAP') })).toContainText('Taxi Two');
    await expect(chips(page, 'CATEGORY_NOT_ELIGIBLE')).toContainText('✖ Category not eligible');
    await page.getByTestId('expense-row').filter({ hasText: 'Taxi Two' }).click();
    await expect(page.locator('[data-testid="expense-flag"][data-rule="OVER_CATEGORY_CAP"]')).toContainText('Local transport is ₹500.00 over its cap of ₹3,000.00 for this trip.');
  });

  test('REQ-RULE-04: an expense that takes the claim past what is left of the grant is an error on that expense', async ({ page }) => {
    await createGrant(page, { total: '10,000', utilised: '0' });
    await createTrip(page);
    await addExpense(page, { amount: '6,000', payee: 'Big One', category: 'airfare' });
    await addExpense(page, { amount: '5,000', payee: 'Bigger One', category: 'airfare', date: '2026-11-13' });
    await expect(chips(page, 'OVER_GRANT_BALANCE')).toHaveCount(1);
    await expect(page.getByTestId('expense-row').filter({ has: chips(page, 'OVER_GRANT_BALANCE') })).toContainText('Bigger One');
    await expect(page.getByTestId('need-fixing')).toContainText('1 item needs fixing before this can be claimed');
  });
});

test.describe('REQ-RULE-09: justification and blocking', () => {
  test('REQ-RULE-09: a justification is saved and shown on the row and the expense page, and it does not remove the flag', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '150', payee: 'Auto Rickshaw' });
    await page.getByTestId('expense-row').click();
    await page.getByLabel('Why this is fine (optional)').fill('No receipt is given for auto-rickshaws');
    await page.getByRole('button', { name: 'Save note' }).click();
    await expect(page.getByText('✓ Saved')).toBeVisible();
    await expect(page.locator('[data-testid="expense-flag"][data-rule="UNCATEGORISED"]')).toBeVisible(); // still flagged
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await expect(page.getByTestId('row-justification')).toHaveText('“No receipt is given for auto-rickshaws”');
    await expect(chips(page, 'UNCATEGORISED')).toHaveCount(1);

    await page.getByTestId('expense-row').click();
    await page.getByLabel('Why this is fine (optional)').fill('');
    await page.getByRole('button', { name: 'Save note' }).click();
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await expect(page.getByTestId('row-justification')).toHaveCount(0); // clearing the text removes it
  });

  test('REQ-RULE-09: the trip says how many items need fixing and links to the first; a warning alone does not count', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '100', payee: 'Has Category', category: 'meals' }); // only a "no proof" warning, and unverified
    await expect(page.getByTestId('need-fixing')).toHaveCount(0);
    await addExpense(page, { amount: '200', payee: 'No Category', date: '2026-11-13' });
    await expect(page.getByTestId('need-fixing')).toContainText('1 item needs fixing');
    await page.getByRole('link', { name: 'Fix the first one' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'No Category' })).toBeVisible();
  });

  test('REQ-RULE-09: the justification is limited to 500 characters', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '150', payee: 'Auto Rickshaw' });
    await page.getByTestId('expense-row').click();
    await page.getByLabel('Why this is fine (optional)').fill('x'.repeat(600));
    await expect(page.getByLabel('Why this is fine (optional)')).toHaveValue('x'.repeat(500));
    await expect(page.getByText('0 characters left')).toBeVisible();
  });
});

test.describe('REQ-RULE-13: cash', () => {
  test('REQ-RULE-13: a cash expense warns that a justification is needed, is not "unverified", and is left out of the verified percentage', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await page.getByRole('link', { name: '+ Cash expense' }).click();
    await page.getByLabel(/^Amount/).fill('150');
    await page.getByLabel('Date').fill('2026-11-12');
    await page.getByLabel('Paid to (payee)').fill('Street Vendor');
    await page.getByLabel('Category').selectOption('meals');
    await expect(page.getByLabel('Paid by')).toHaveCount(0); // the cash form has no such field
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(chips(page, 'CASH_NOT_IN_STATEMENT')).toContainText('⚠ Paid in cash');
    await expect(page.getByTestId('verified-meter')).toHaveCount(0); // nothing bank-paid to verify
    await page.getByTestId('expense-row').click();
    await expect(page.locator('[data-testid="expense-flag"][data-rule="UNVERIFIED_AMOUNT"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="expense-flag"][data-rule="CASH_NOT_IN_STATEMENT"]')).toContainText('Add a justification');
  });
});

test.describe('REQ-BAL-07: verified share and grouping', () => {
  test('REQ-BAL-07: with everything still to verify the meter says 0% verified and there is no verified section', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    await expect(page.getByTestId('verified-percent')).toHaveText('0% verified');
    await expect(page.getByTestId('section-to-verify')).toBeVisible();
    await expect(page.getByTestId('section-verified')).toHaveCount(0);
    await expect(page.locator('[data-testid="flag-chip"][data-rule="UNVERIFIED_AMOUNT"]')).toHaveCount(0); // not a chip on every row
  });

  test('REQ-BAL-07: verified expenses move to a section at the bottom with their own panel colour; the percentage follows the amounts', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    // Mark the ₹24,500 hotel and the ₹640 cab as matched to the statement (what the statement screen does).
    await patchStore(page, 'expenses', (row) => {
      if (row.payee === 'HOTEL SAMPLE' || row.payee === 'Uber') row.inrStatus = 'confirmed';
    });
    await page.reload();
    // verified = 24,500 + 640 = 25,140 of 44,090 → 57%
    await expect(page.getByTestId('verified-percent')).toHaveText('57% verified');
    const sections = page.locator('[data-testid="section-to-verify"], [data-testid="section-verified"]');
    await expect(sections.first()).toHaveAttribute('data-testid', 'section-to-verify');
    await expect(sections.last()).toHaveAttribute('data-testid', 'section-verified');
    await expect(page.getByTestId('section-to-verify').getByTestId('expense-row')).toHaveCount(2);
    await expect(page.getByTestId('section-verified').getByTestId('expense-row')).toHaveCount(2);
    await expect(page.getByTestId('section-verified').getByRole('heading', { level: 2 })).toContainText('Verified against your statement (2)');

    // A different panel colour, taken from the brand tokens: compare the computed background of one row of each kind.
    const backgrounds = await page.evaluate(() => {
      const bg = (selector: string) => getComputedStyle(document.querySelector(selector)!).backgroundColor;
      return { open: bg('[data-testid="section-to-verify"] [data-testid="expense-row"]'), verified: bg('[data-testid="section-verified"] [data-testid="expense-row"]') };
    });
    expect(backgrounds.open).not.toBe(backgrounds.verified);
    await expect(page.getByTestId('section-verified').getByTestId('expense-row').first()).toContainText('✓ Confirmed');
  });

  test('REQ-BAL-07: the percentage also shows on the grants screen and the grant page', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    await page.goto('/grants');
    await expect(page.getByTestId('grant-card').getByTestId('verified-percent')).toHaveText('0% verified');
    await page.getByRole('link', { name: /RSF Conference Grant/ }).click();
    await expect(page.getByTestId('verified-percent')).toHaveText('0% verified');
    await expect(remaining(page)).toHaveText('₹35,910.00 left');
  });
});
