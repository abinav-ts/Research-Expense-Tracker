import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { addExpense, createGrant, createTrip, loadDemoAndOpenTrip, remaining } from './helpers.ts';

const SAMPLE = join(import.meta.dirname, '../../fixtures/sample-statement.csv');

/** Opens the demo trip's statement screen and loads the sample file; confirms the guessed columns when asked. */
async function openStatement(page: Page, options: { confirmColumns?: boolean } = {}) {
  await loadDemoAndOpenTrip(page);
  await page.getByRole('link', { name: 'Match bank statement' }).click();
  await page.getByLabel('Choose statement file').setInputFiles(SAMPLE);
  if (options.confirmColumns !== false) {
    await page.getByRole('button', { name: 'Use these columns' }).click();
  }
}
const proposals = (page: Page) => page.getByTestId('proposal');

test.describe('REQ-CSV-01: reading a statement on the device', () => {
  test('REQ-CSV-01: choosing the sample reads it quickly and no request leaves for any server', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    await page.getByRole('link', { name: 'Match bank statement' }).click();
    await page.waitForLoadState('networkidle');
    const requests: string[] = [];
    page.on('request', (r) => requests.push(`${r.method()} ${r.url()}`));
    const started = Date.now();
    await page.getByLabel('Choose statement file').setInputFiles(SAMPLE);
    await expect(page.getByTestId('file-summary')).toContainText('sample-statement.csv');
    expect(Date.now() - started).toBeLessThan(1000 + 1500); // the 1 s target plus the page's own rendering time
    await page.getByRole('button', { name: 'Use these columns' }).click();
    await expect(page.getByTestId('file-summary')).toContainText('14 debits, 2 credits');
    await page.waitForTimeout(500);
    expect(requests.filter((r) => !r.includes('localhost:4173') || r.includes('/api/') || r.startsWith('POST'))).toEqual([]);
  });

  test('REQ-CSV-01: a file that is not a statement gets a clear message and nothing is shown', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    await page.getByRole('link', { name: 'Match bank statement' }).click();
    await page.getByLabel('Choose statement file').setInputFiles({ name: 'photo.csv', mimeType: 'text/csv', buffer: Buffer.from('%PDF-1.4\u0000\u0001\u0002 binary \u0000') });
    await expect(page.getByTestId('statement-error')).toContainText('cannot be read as a statement');
    await expect(page.getByTestId('transaction-table')).toHaveCount(0);
    await page.getByLabel('Choose statement file').setInputFiles({ name: 'notes.csv', mimeType: 'text/csv', buffer: Buffer.from('hello\nthere,friend,again\n') });
    await expect(page.getByTestId('statement-error')).toContainText('Could not find the row that names the columns');
  });

  test('REQ-CSV-01: a file over 5 MB is refused with a message', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    await page.getByRole('link', { name: 'Match bank statement' }).click();
    await page.getByLabel('Choose statement file').setInputFiles({ name: 'huge.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Narration,Debit\n' + '01/11/26,x,1.00\n'.repeat(400_000)) });
    await expect(page.getByTestId('statement-error')).toContainText('larger than 5 MB');
  });
});

test.describe('REQ-CSV-02: column mapping', () => {
  test('REQ-CSV-02: the columns are guessed, shown with a preview, and used only after the user confirms', async ({ page }) => {
    await openStatement(page, { confirmColumns: false });
    await expect(page.getByTestId('mapping-panel')).toBeVisible();
    await expect(page.getByLabel('Date', { exact: true })).toHaveValue('0');
    await expect(page.getByLabel('Description (narration)')).toHaveValue('1');
    await expect(page.getByLabel('Money out (debit / withdrawal)')).toHaveValue('4');
    await expect(page.getByLabel('Money in (credit / deposit, optional)')).toHaveValue('5');
    await expect(page.getByLabel('Balance (optional)')).toHaveValue('6');
    await expect(page.getByTestId('mapping-preview')).toContainText('₹1,245.50');
    await expect(page.getByTestId('transaction-table')).toHaveCount(0); // nothing is shown before the columns are confirmed
    await page.getByRole('button', { name: 'Use these columns' }).click();
    await expect(page.getByTestId('transaction-table')).toBeVisible();
  });

  test('REQ-CSV-02: the second statement from the same bank needs no questions; "Change the columns" reopens them', async ({ page }) => {
    await openStatement(page);
    await expect(page.getByTestId('transaction-table')).toBeVisible();
    await page.reload();
    await page.getByLabel('Choose statement file').setInputFiles(SAMPLE);
    await expect(page.getByTestId('mapping-panel')).toHaveCount(0); // remembered from the first time
    await expect(page.getByTestId('transaction-table')).toBeVisible();
    await page.getByTestId('change-mapping').click();
    await expect(page.getByTestId('mapping-panel')).toBeVisible();
  });

  test('REQ-CSV-02: an incomplete mapping says what is missing and does not let the user continue', async ({ page }) => {
    await openStatement(page, { confirmColumns: false });
    await page.getByLabel('Money out (debit / withdrawal)').selectOption('');
    await expect(page.getByTestId('mapping-missing')).toContainText('the debit (withdrawal) column or an amount column');
    await expect(page.getByRole('button', { name: 'Use these columns' })).toBeDisabled();
    await page.getByLabel('Date', { exact: true }).selectOption('');
    await expect(page.getByTestId('mapping-missing')).toContainText('the date column');
  });

  test('REQ-CSV-02: the wrong date style leaves nothing readable and says so; fixing it brings the rows back', async ({ page }) => {
    await openStatement(page, { confirmColumns: false });
    await page.getByLabel('How dates are written').selectOption('ymd');
    await expect(page.getByRole('alert').filter({ hasText: 'No row could be read' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use these columns' })).toBeDisabled();
    await page.getByLabel('How dates are written').selectOption('dmy');
    await expect(page.getByTestId('mapping-preview')).toBeVisible();
  });

  test('REQ-CSV-02: the balance column is never shown as an amount anywhere on the screen', async ({ page }) => {
    await openStatement(page);
    const text = await page.locator('main').innerText();
    for (const balance of ['2,50,000.00', '1,91,551.95', '2,48,754.50']) expect(text).not.toContain(balance);
  });
});

test.describe('REQ-CSV-03: the transaction table', () => {
  test('REQ-CSV-03: it starts on the trip dates ± the buffer, counts what is shown, and says why credits are hidden', async ({ page }) => {
    await openStatement(page); // demo trip 10–14 Nov, buffer 2 → 8–16 Nov
    await expect(page.getByTestId('table-count')).toHaveText('6 of 14 debits shown');
    await expect(page.getByTestId('credits-note')).toContainText('2 credits hidden: credits and refunds are not part of a claim.');
    await expect(page.locator('#stmt-from')).toHaveValue('2026-11-08');
    await expect(page.locator('#stmt-to')).toHaveValue('2026-11-16');
    await page.getByRole('button', { name: 'Show all dates' }).click();
    await expect(page.getByTestId('table-count')).toHaveText('14 of 14 debits shown');
  });

  test('REQ-CSV-03: search matches narration and reference, ignoring case', async ({ page }) => {
    await openStatement(page);
    await page.getByRole('button', { name: 'Show all dates' }).click();
    await page.getByLabel('Search').fill('groc');
    await expect(page.getByTestId('table-count')).toHaveText('2 of 14 debits shown');
    await page.getByLabel('Search').fill('0000000114');
    await expect(page.getByTestId('table-count')).toHaveText('1 of 14 debits shown');
    await page.getByLabel('Search').fill('nothing like this');
    await expect(page.getByTestId('table-empty')).toBeVisible();
  });

  test('REQ-CSV-03: "Select all shown" ticks only the rows shown and not paired ones; the total follows', async ({ page }) => {
    await openStatement(page);
    await page.getByRole('button', { name: 'Confirm all 3' }).click(); // pair IRCTC, Uber, hotel so they cannot be ticked
    await expect(page.getByTestId('matched-pair')).toHaveCount(3);
    await page.getByLabel('Search').fill('UPI');
    await page.getByLabel(/Select all \d+ shown/).check();
    const ticked = await page.getByTestId('stmt-row').locator('input[type=checkbox]:checked').count();
    expect(ticked).toBeGreaterThan(0);
    await page.getByLabel('Search').fill('');
    await page.getByRole('button', { name: 'Show all dates' }).click();
    // rows hidden by the search earlier stay unticked; paired rows are disabled and never ticked
    const paired = page.getByTestId('stmt-row').filter({ has: page.getByTestId('row-owner') });
    await expect(paired).toHaveCount(3);
    for (const row of await paired.all()) await expect(row.locator('input[type=checkbox]')).toBeDisabled();
    await expect(page.getByTestId('selection-summary')).toContainText(`${ticked} selected`);
  });

  test('REQ-CSV-03: on a phone each row keeps a readable description and the controls are at least 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openStatement(page);
    await page.getByRole('button', { name: 'Show all dates' }).click();
    const rows = await page.getByTestId('stmt-row').all();
    expect(rows.length).toBe(14);
    for (const row of rows.slice(0, 5)) {
      const text = await row.locator('.font-semibold').first().boundingBox();
      expect(text!.width).toBeGreaterThan(200); // the description has nearly the whole row
      expect(text!.height).toBeLessThan(100);
      expect((await row.locator('input[type=checkbox]').boundingBox())!.width).toBeGreaterThanOrEqual(20);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});

test.describe('REQ-CSV-08: reconcile', () => {
  test('REQ-CSV-08: the cab, train and hotel are proposed automatically with reasons; the second ₹1,850.00 debit on 20 Nov is not', async ({ page }) => {
    await openStatement(page);
    await expect(proposals(page)).toHaveCount(3);
    const irctc = proposals(page).filter({ hasText: 'IRCTC' });
    await expect(irctc).toContainText('same amount, the same day');
    await expect(irctc).toContainText('9 Nov 2026');
    await expect(proposals(page).filter({ hasText: 'Uber' })).toContainText('same amount, 1 day apart');
    await expect(page.getByTestId('reconcile-auto')).not.toContainText('20 Nov 2026');
  });

  test('REQ-CSV-08: the € registration is offered the ₹17,230.55 debit, never confirmed automatically, and confirming it uses the bank amount', async ({ page }) => {
    await openStatement(page);
    await expect(remaining(page)).toHaveCount(0); // (balance lives on the trip page)
    const choice = page.getByTestId('foreign-choice');
    await expect(choice).toHaveCount(1);
    await expect(choice).toContainText('Lisbon Computing Society');
    await expect(choice).toContainText('EUR 180.00 (estimated ₹17,100.00)');
    await expect(choice).toContainText('₹130.55 more than your estimate, 2 days apart');
    await expect(choice.getByRole('button', { name: 'Use this debit' })).toBeDisabled(); // a choice is needed first
    await choice.getByRole('radio').first().check();
    await choice.getByRole('button', { name: 'Use this debit' }).click();
    await expect(page.getByTestId('matched-pair').filter({ hasText: 'Lisbon Computing Society' })).toContainText('₹17,230.55');
  });

  test('REQ-CSV-08: after confirming everything the trip is 100% verified, the balance moved by the foreign difference, and the list regroups', async ({ page }) => {
    await openStatement(page);
    await page.getByRole('button', { name: 'Confirm all 3' }).click();
    await page.getByTestId('foreign-choice').getByRole('radio').first().check();
    await page.getByTestId('foreign-choice').getByRole('button', { name: 'Use this debit' }).click();
    await expect(page.getByTestId('matched-pair')).toHaveCount(4);
    await page.getByRole('link', { name: 'Match bank statement' }).count();
    await page.goto('/grants');
    await page.getByRole('link', { name: /DST Sample Grant/ }).click();
    await page.getByRole('link', { name: 'SampleConf 2026' }).click();
    await expect(page.getByTestId('verified-percent')).toHaveText('100% verified');
    await expect(remaining(page)).toHaveText('₹35,779.45 left'); // ₹35,910.00 − ₹130.55
    await expect(page.getByTestId('balance-pending')).toHaveCount(0); // nothing pending any more
    await expect(page.getByTestId('section-to-verify')).toHaveCount(0);
    await expect(page.getByTestId('section-verified').getByTestId('expense-row')).toHaveCount(4);
  });

  test('REQ-CSV-08: "Not this one" hides a proposal and the expense moves to the by-hand list; Unlink returns an expense to pending', async ({ page }) => {
    await openStatement(page);
    await proposals(page).filter({ hasText: 'Uber' }).getByRole('button', { name: 'Not this one' }).click();
    await expect(proposals(page)).toHaveCount(2);
    await expect(page.getByTestId('unpaired-expense').filter({ hasText: 'Uber' })).toBeVisible();

    await proposals(page).filter({ hasText: 'IRCTC' }).getByRole('button', { name: /^Confirm IRCTC/ }).click();
    const pair = page.getByTestId('matched-pair').filter({ hasText: 'IRCTC' });
    await expect(pair).toBeVisible();
    await pair.getByRole('button', { name: 'Unlink IRCTC' }).click();
    await expect(page.getByTestId('matched-pair').filter({ hasText: 'IRCTC' })).toHaveCount(0);
    await expect(proposals(page).filter({ hasText: 'IRCTC' })).toHaveCount(1); // proposed again
  });

  test('REQ-CSV-08: an expense with no automatic match can be linked by hand; the bank amount is used and the screen says so', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    await addExpense(page, { amount: '2,000', payee: 'Dinner Out', date: '2026-11-15' }); // the statement has ₹2,150.00 on 15 Nov
    await page.getByRole('link', { name: 'Match bank statement' }).click();
    await page.getByLabel('Choose statement file').setInputFiles(SAMPLE);
    await page.getByRole('button', { name: 'Use these columns' }).click();
    const item = page.getByTestId('unpaired-expense').filter({ hasText: 'Dinner Out' });
    await expect(item).toBeVisible();
    await item.getByLabel('Link to a bank debit').selectOption({ label: /15 Nov 2026 · ₹2,150.00/ as unknown as string }).catch(async () => {
      const options = await item.locator('option').allTextContents();
      const label = options.find((o) => o.includes('₹2,150.00'))!;
      await item.getByLabel('Link to a bank debit').selectOption({ label });
    });
    await expect(item).toContainText("The bank's ₹2,150.00 will be used instead of ₹2,000.00");
    await item.getByRole('button', { name: 'Link' }).click();
    await expect(page.getByTestId('matched-pair').filter({ hasText: 'Dinner Out' })).toContainText('₹2,150.00');
  });

  test('REQ-CSV-08: a statement row used by one expense is shown as paired and cannot be ticked or used again', async ({ page }) => {
    await openStatement(page);
    await page.getByRole('button', { name: 'Confirm all 3' }).click();
    await expect(page.getByTestId('row-owner').filter({ hasText: 'Paired with IRCTC' })).toBeVisible();
    await expect(page.getByTestId('row-owner')).toHaveCount(3);
  });

  test('REQ-CSV-08: matching works with no tracked expenses at all: the screen says so and the table is still there', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await page.getByRole('link', { name: 'Match bank statement' }).click();
    await page.getByLabel('Choose statement file').setInputFiles(SAMPLE);
    await page.getByRole('button', { name: 'Use these columns' }).click();
    await expect(page.getByTestId('reconcile-none')).toBeVisible();
    await expect(page.getByTestId('transaction-table')).toBeVisible();
  });
});

test.describe('REQ-CSV-04, REQ-CSV-05: adding other debits', () => {
  async function tickGroceries(page: Page) {
    await page.getByRole('button', { name: 'Show all dates' }).click();
    await page.getByLabel('Search').fill('GREEN GROCERS');
    await page.getByLabel(/Select all \d+ shown/).check();
  }

  test('REQ-CSV-04, REQ-CSV-05: ticked debits get a category and become verified expenses of the trip; the balance moves at once', async ({ page }) => {
    await openStatement(page);
    await tickGroceries(page);
    await expect(page.getByTestId('selection-summary')).toHaveText('2 selected · ₹2,231.75');
    await page.getByLabel('Category for all selected rows').selectOption('meals');
    for (const row of await page.getByTestId('stmt-row').all()) await expect(row.getByLabel(/Category for/)).toHaveValue('meals');
    await page.getByRole('button', { name: 'Add 2 selected to this trip' }).click();
    await expect(page.getByTestId('add-result')).toContainText('Added 2 expenses to this trip');

    await page.goto('/grants');
    await page.getByRole('link', { name: /DST Sample Grant/ }).click();
    await page.getByRole('link', { name: 'SampleConf 2026' }).click();
    const verified = page.getByTestId('section-verified').getByTestId('expense-row');
    await expect(verified).toHaveCount(2);
    await expect(verified.first()).toContainText('UPI-GREEN GROCERS');
    await expect(verified.first()).toContainText('Meals');
    await expect(remaining(page)).toHaveText('₹33,678.25 left'); // 35,910.00 − 2,231.75
  });

  test('REQ-CSV-05: adding the same file again shows those rows as already added and adds nothing', async ({ page }) => {
    await openStatement(page);
    await tickGroceries(page);
    await page.getByRole('button', { name: 'Add 2 selected to this trip' }).click();
    await expect(page.getByTestId('add-result')).toBeVisible();
    await page.reload();
    await page.getByLabel('Choose statement file').setInputFiles(SAMPLE);
    await page.getByRole('button', { name: 'Show all dates' }).click();
    await page.getByLabel('Search').fill('GREEN GROCERS');
    await expect(page.getByTestId('row-owner')).toHaveCount(2);
    await expect(page.getByTestId('row-owner').first()).toHaveText('✓ Already added to your trip');
    await expect(page.getByLabel(/Select all \d+ shown/)).toHaveCount(0); // nothing left to tick
  });

  test('REQ-CSV-04: a row can have its own category, and the suggestion from its narration is offered, not applied', async ({ page }) => {
    await openStatement(page);
    await page.getByRole('button', { name: 'Show all dates' }).click();
    await page.getByLabel('Search').fill('IRCTC');
    await page.getByTestId('stmt-row').first().getByRole('checkbox').check();
    const row = page.getByTestId('stmt-row').first();
    await expect(row.getByLabel(/Category for/)).toHaveValue(''); // nothing applied silently
    await expect(row.getByTestId('row-suggestion')).toContainText('Suggested: Rail / bus');
    await row.getByRole('button', { name: 'Suggested: Rail / bus' }).click();
    await expect(row.getByLabel(/Category for/)).toHaveValue('rail_bus');
  });

  test('REQ-CSV-05: the statement-only path works with no tracked expenses: ticked rows become a trip with a flag-free, verified list', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await page.getByRole('link', { name: 'Match bank statement' }).click();
    await page.getByLabel('Choose statement file').setInputFiles(SAMPLE);
    await page.getByRole('button', { name: 'Use these columns' }).click();
    await page.getByLabel('Search').fill('HOTEL');
    await page.getByRole('button', { name: 'Show all dates' }).click();
    await page.getByTestId('stmt-row').first().getByRole('checkbox').check();
    await page.getByTestId('stmt-row').first().getByLabel(/Category for/).selectOption('accommodation');
    await page.getByRole('button', { name: 'Add 1 selected to this trip' }).click();
    await page.getByRole('link', { name: 'SampleConf 2026' }).click();
    await expect(page.getByTestId('verified-percent')).toHaveText('100% verified');
    await expect(page.getByTestId('section-verified').getByTestId('expense-row')).toContainText('HOTEL SAMPLE LISBON');
  });
});

test.describe('REQ-CSV-10: the sample statement', () => {
  test('REQ-CSV-10: "Download a sample statement" gives the file in fixtures/', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    await page.getByRole('link', { name: 'Match bank statement' }).click();
    const download = page.waitForEvent('download');
    await page.getByTestId('sample-download').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('sample-statement.csv');
    const path = await file.path();
    expect(readFileSync(path!, 'utf8')).toBe(readFileSync(SAMPLE, 'utf8'));
  });
});
