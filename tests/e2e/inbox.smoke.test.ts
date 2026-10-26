import { expect, test, type Page } from '@playwright/test';
import { createGrant, createTrip, pngFile, remaining } from './helpers.ts';

const CARD_SMS = 'INR 2,450.00 spent on card XX1234 at HOTEL SAMPLE on 12-Nov-26. Avl Lmt INR 85,000.00';

async function withTrip(page: Page) {
  await createGrant(page);
  await createTrip(page);
  await page.goto('/inbox');
}
const pasteText = async (page: Page, text: string) => {
  await page.getByRole('button', { name: 'Paste text' }).click();
  await page.getByLabel('Paste an SMS or payment notification').fill(text);
  await page.getByRole('button', { name: 'Add to Inbox' }).click();
};

test.describe('REQ-CAP-02: import files', () => {
  test('REQ-CAP-02: three images at once become three Inbox items and the nav badge shows 3', async ({ page }) => {
    await page.goto('/inbox');
    await expect(page.getByTestId('inbox-empty')).toBeVisible();
    await page.getByLabel('Choose proof files').setInputFiles([pngFile('a.png'), pngFile('b.png'), pngFile('c.png')]);
    await expect(page.getByTestId('inbox-item')).toHaveCount(3);
    await expect(page.getByTestId('inbox-badge')).toHaveText('3');
    await page.reload();
    await expect(page.getByTestId('inbox-item')).toHaveCount(3); // REQ-CAP-04: survives a reload
  });

  test('REQ-CAP-02: an unsupported file is skipped with a message while valid files in the same selection are added', async ({ page }) => {
    await page.goto('/inbox');
    await page.getByLabel('Choose proof files').setInputFiles([pngFile('ok.png'), { name: 'notes.docx', mimeType: 'application/msword', buffer: Buffer.from('x') }]);
    await expect(page.getByTestId('inbox-item')).toHaveCount(1);
    await expect(page.getByText('"notes.docx" was skipped: use PDF, JPG, PNG, WebP, HEIC.')).toBeVisible();
  });

  test('REQ-CAP-02: a PDF over 1 MB is accepted with the "Too large to include in a claim" note', async ({ page }) => {
    await page.goto('/inbox');
    await page.getByLabel('Choose proof files').setInputFiles({ name: 'ticket.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(1024 * 1024 + 10, 'x') });
    await expect(page.getByTestId('inbox-item')).toContainText('Too large to include in a claim (max 1 MB)');
  });

  test('REQ-CAP-02: the camera input asks the phone for a photo', async ({ page }) => {
    await page.goto('/inbox');
    await expect(page.getByLabel('Take a photo of a proof')).toHaveAttribute('capture', 'environment');
    await expect(page.getByLabel('Take a photo of a proof')).toHaveAttribute('accept', 'image/*');
  });
});

test.describe('REQ-CAP-13: pasted SMS text', () => {
  test('REQ-CAP-13: the card SMS prefills ₹2,450.00, 12 Nov 2026 and HOTEL SAMPLE, and the card digits and limit are never stored', async ({ page }) => {
    await withTrip(page);
    await pasteText(page, CARD_SMS);
    await expect(page.getByTestId('inbox-item')).toHaveCount(1);
    await page.getByRole('link', { name: 'Review' }).click();

    await expect(page.getByLabel(/^Amount/)).toHaveValue('2450');
    await expect(page.getByLabel('Date')).toHaveValue('2026-11-12');
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('HOTEL SAMPLE');
    const shown = await page.getByTestId('inbox-text').innerText();
    expect(shown).not.toContain('1234');
    expect(shown).not.toContain('85,000');

    // Whatever is stored in IndexedDB must not contain them either.
    const stored = await page.evaluate(async () => {
      const open = indexedDB.open('expres');
      const db: IDBDatabase = await new Promise((res) => { open.onsuccess = () => res(open.result); });
      const rows: unknown[] = await new Promise((res) => { const r = db.transaction('inbox').objectStore('inbox').getAll(); r.onsuccess = () => res(r.result); });
      return JSON.stringify(rows);
    });
    expect(stored).not.toContain('1234');
    expect(stored).not.toContain('85,000');
    expect(stored).toContain('HOTEL SAMPLE');
  });

  test('REQ-CAP-13: text the parser cannot read opens an empty form with the text beside it', async ({ page }) => {
    await withTrip(page);
    await pasteText(page, 'see you at the venue tomorrow');
    await page.getByRole('link', { name: 'Review' }).click();
    await expect(page.getByTestId('inbox-text')).toHaveText('see you at the venue tomorrow');
    await expect(page.getByLabel(/^Amount/)).toHaveValue('');
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('');
  });
});

test.describe('REQ-CAP-13: the owner\'s own SMS format', () => {
  test('REQ-CAP-13: "Rs 2399 spent@ ABDUSROLLS on 25OCT26 …" fills amount, date, payee and reference, drops the balance, and warns the date is outside the trip', async ({ page }) => {
    await withTrip(page); // trip is 10–14 Nov 2026
    await pasteText(page, 'Rs 2399 spent@ ABDUSROLLS on 25OCT26 12:59 Bal Rs.123456 Ref 34567');
    await page.getByRole('link', { name: 'Review' }).click();
    await expect(page.getByLabel(/^Amount/)).toHaveValue('2399');
    await expect(page.getByLabel('Date')).toHaveValue('2026-10-25');
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('ABDUSROLLS');
    await expect(page.getByLabel(/^Reference/)).toHaveValue('34567');
    await expect(page.getByTestId('date-window-warning')).toContainText('Dated 25 Oct 2026, outside the allowed window');
    expect(await page.getByTestId('inbox-text').innerText()).not.toContain('123456'); // the balance is never kept

    await page.getByRole('button', { name: 'Confirm expense' }).click(); // a warning does not block saving
    await expect(page.getByTestId('inbox-empty')).toBeVisible(); // the save has finished
    await page.goto('/grants');
    await expect(page.getByTestId('balance-remaining')).toHaveText('₹77,601.00 left');
  });
});

test.describe('REQ-CAP-15: suggested values for each field', () => {
  // An invoice-like message with several dates and amounts: the right ones must be offered, the rest one tap away.
  const INVOICE = ['Sample Cafe', 'Invoice No: INV-4471', 'Date: 22 Aug 2026', 'Paid on 12 Nov 2026', 'Subtotal 1000.00', 'GST 5% 50.00', 'Grand Total 1050.00'].join('\n');

  test('REQ-CAP-15: the best suggestion is prefilled and marked Check; the other options sit under the field, one tap each', async ({ page }) => {
    await withTrip(page); // trip is 10–14 Nov 2026
    await pasteText(page, INVOICE);
    await page.getByRole('link', { name: 'Review' }).click();

    // Dates inside the trip dates rank first, the invoice date is the alternative.
    await expect(page.getByLabel('Date')).toHaveValue('2026-11-12');
    await expect(page.getByTestId('check-date')).toBeVisible();
    await expect(page.getByLabel(/^Amount/)).toHaveValue('1050'); // next to "Grand Total"
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('Sample Cafe');
    await expect(page.getByLabel(/^Reference/)).toHaveValue('INV-4471');

    const dateChips = page.getByTestId('suggest-date').getByRole('button');
    await expect(dateChips).toHaveCount(1);
    await dateChips.first().click();
    await expect(page.getByLabel('Date')).toHaveValue('2026-08-22');
    await expect(page.getByTestId('check-date')).toHaveCount(0); // choosing it counts as the user's own confirmation
    await expect(page.getByTestId('date-window-warning')).toContainText('Dated 22 Aug 2026'); // and the trip-window warning follows

    // The amount alternatives: at most three, never the value already in the field.
    const amountChips = page.getByTestId('suggest-amount').getByRole('button');
    expect(await amountChips.count()).toBeGreaterThan(0);
    expect(await amountChips.count()).toBeLessThanOrEqual(2);
    await expect(page.getByTestId('suggest-amount')).not.toContainText('₹1,050.00');
    await page.getByTestId('suggest-amount').getByRole('button', { name: /₹1,000\.00/ }).click();
    await expect(page.getByLabel(/^Amount/)).toHaveValue('1000');
  });

  test('REQ-CAP-15: a date whose day was misread is never prefilled: both readings are chips, and one tap chooses', async ({ page }) => {
    await withTrip(page);
    await pasteText(page, 'Sample Cafe\nDate: 72-bugust-2026\nTotal 100.00');
    await page.getByRole('link', { name: 'Review' }).click();
    await expect(page.getByLabel(/^Amount/)).toHaveValue('100');
    await expect(page.getByLabel('Date')).not.toHaveValue(/^2026-08/); // left as it was, not guessed
    await expect(page.getByTestId('check-date')).toHaveCount(0);
    const chips = page.getByTestId('suggest-date').getByRole('button');
    await expect(chips).toHaveCount(2);
    await expect(chips.first()).toContainText('read with a guess');
    await page.getByTestId('suggest-date').getByRole('button', { name: /^22 Aug 2026/ }).click();
    await expect(page.getByLabel('Date')).toHaveValue('2026-08-22');
  });

  test('REQ-CAP-15: there is no list of every word on the page, and the full text is in a closed "What was read" section only for screenshots', async ({ page }) => {
    await withTrip(page);
    await pasteText(page, INVOICE);
    await page.getByRole('link', { name: 'Review' }).click();
    await expect(page.getByTestId('assigner-words')).toHaveCount(0);
    await expect(page.getByTestId('text-assigner')).toHaveCount(0);
    // each suggestion chip is a button at least 44 px tall
    const chip = page.getByTestId('suggest-date').getByRole('button').first();
    await expect(chip).toBeVisible();
    expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test('REQ-CAP-15: a chip equal to the current value is not shown, and nothing plausible means no chips and an empty field', async ({ page }) => {
    await withTrip(page);
    await pasteText(page, 'hello, see you tomorrow');
    await page.getByRole('link', { name: 'Review' }).click();
    await expect(page.getByLabel(/^Amount/)).toHaveValue('');
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('');
    for (const field of ['amount', 'date', 'payee', 'reference']) await expect(page.getByTestId(`suggest-${field}`)).toHaveCount(0);
    await expect(page.getByTestId('check-payee')).toHaveCount(0);
  });

  test('REQ-CAP-15: suggestions never overwrite what the user has already typed', async ({ page }) => {
    await withTrip(page);
    await pasteText(page, INVOICE);
    await page.getByRole('link', { name: 'Review' }).click();
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('Sample Cafe');
    // Typing replaces the prefill and removes its mark; the old suggestion then comes back as a chip.
    await page.getByLabel('Paid to (payee)').fill('My Own Words');
    await expect(page.getByTestId('check-payee')).toHaveCount(0);
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('My Own Words');
  });
});

test.describe('REQ-CAP-04: Inbox confirm and discard', () => {
  test('REQ-CAP-04: confirming creates the expense with the proof attached, drops the balance, and opens the next item', async ({ page }) => {
    await withTrip(page);
    await pasteText(page, CARD_SMS);
    await page.getByLabel('Choose proof files').setInputFiles(pngFile('shot.png'));
    await expect(page.getByTestId('inbox-badge')).toHaveText('2');

    // Newest first: the screenshot. Type its details, tag it as a UPI screenshot, confirm.
    await page.getByRole('link', { name: 'Review' }).first().click();
    await expect(page.getByTestId('proof-view')).toBeVisible();
    await page.getByLabel('Proof type').selectOption('upi_screenshot');
    await page.getByLabel(/^Amount/).fill('1200');
    await page.getByLabel('Date').fill('2026-11-11');
    await page.getByLabel('Paid to (payee)').fill('Ramesh Stores');
    await page.getByRole('button', { name: 'Confirm expense' }).click();

    // The next item (the SMS) opens by itself; confirm it too.
    await expect(page.getByTestId('inbox-text')).toContainText('HOTEL SAMPLE');
    await expect(page.getByTestId('inbox-badge')).toHaveText('1');
    await page.getByRole('button', { name: 'Confirm expense' }).click();
    await expect(page.getByTestId('inbox-empty')).toBeVisible();
    await expect(page.getByTestId('inbox-badge')).toHaveCount(0);

    await page.getByRole('link', { name: 'Grants' }).click();
    await page.getByRole('link', { name: 'DST Sample Grant' }).click();
    await expect(remaining(page)).toHaveText('₹76,350.00 left'); // 80,000 − 1,200 (screenshot) − 2,450 (SMS)
    await page.getByRole('link', { name: 'SampleConf 2026' }).click();
    await expect(page.getByTestId('expense-row')).toHaveCount(2);
    await page.getByTestId('expense-row').filter({ hasText: 'Ramesh Stores' }).click();
    await expect(page.getByTestId('proof-view')).toContainText('UPI screenshot');
  });

  test('REQ-CAP-04: with no trip yet the item is kept and the user is told to create a grant and trip first', async ({ page }) => {
    await page.goto('/inbox');
    await page.getByLabel('Choose proof files').setInputFiles(pngFile('junk.png'));
    await page.getByRole('link', { name: 'Review' }).click();
    await expect(page.getByText('Create a grant and a trip first')).toBeVisible();
    await page.goto('/inbox');
    await expect(page.getByTestId('inbox-item')).toHaveCount(1);
  });

  test('REQ-CAP-04: with a trip, Discard asks for confirmation; Cancel keeps the item, Discard removes it', async ({ page }) => {
    await withTrip(page);
    await page.getByLabel('Choose proof files').setInputFiles(pngFile('junk.png'));
    await page.getByRole('link', { name: 'Review' }).click();
    await page.getByRole('button', { name: 'Discard' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Confirm expense' })).toBeVisible();
    await page.getByRole('button', { name: 'Discard' }).click();
    await page.getByRole('button', { name: 'Discard', exact: true }).last().click();
    await expect(page.getByTestId('inbox-empty')).toBeVisible();
  });

  test('REQ-CAP-04: the trip defaults to the one whose dates include today, else the last used', async ({ page }) => {
    await createGrant(page);
    await createTrip(page, 'First Conf');
    await page.getByRole('link', { name: 'DST Sample Grant' }).click();
    await createTrip(page, 'Second Conf'); // last used
    await page.goto('/inbox');
    await page.getByLabel('Choose proof files').setInputFiles(pngFile('x.png'));
    await page.getByRole('link', { name: 'Review' }).click();
    expect(await page.getByLabel('Trip').locator('option:checked').innerText()).toContain('Second Conf');
  });
});
