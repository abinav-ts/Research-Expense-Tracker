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
    await expect(page.getByText('"notes.docx" was skipped: use PDF, JPG, PNG, WebP.')).toBeVisible();
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

test.describe('REQ-CAP-15: tap to assign', () => {
  const UNKNOWN = 'Alert 2399 INR XYZ MART 25/10/26 thanks'; // amount after the currency and no merchant marker: nothing to anchor on
  const word = (page: Page, text: string) => page.getByTestId('assigner-words').getByRole('button', { name: text, exact: true });

  test('REQ-CAP-15: a format the parser cannot read is completed with taps: payee, amount, date', async ({ page }) => {
    await withTrip(page);
    await pasteText(page, UNKNOWN);
    await page.getByRole('link', { name: 'Review' }).click();
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue(''); // nothing guessed for these two
    await expect(page.getByLabel(/^Amount/)).toHaveValue('');

    await expect(page.getByRole('button', { name: 'Use as payee' })).toBeDisabled();
    await word(page, 'XYZ').click();
    await word(page, 'MART').click();
    await expect(word(page, 'XYZ')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Use as payee' }).click();
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('XYZ MART');
    await expect(word(page, 'XYZ')).toHaveAttribute('aria-pressed', 'false'); // selection cleared
    await expect(page.getByTestId('assigner-note')).toContainText('Payee set to XYZ MART');

    await word(page, '2399').click();
    await page.getByRole('button', { name: 'Use as amount' }).click();
    await expect(page.getByLabel(/^Amount/)).toHaveValue('2399');

    await word(page, '25/10/26').click();
    await page.getByRole('button', { name: 'Use as date' }).click();
    await expect(page.getByLabel('Date')).toHaveValue('2026-10-25');

    await page.getByRole('button', { name: 'Confirm expense' }).click();
    await expect(page.getByTestId('inbox-empty')).toBeVisible();
    await page.getByRole('link', { name: 'Grants' }).click();
    await page.getByRole('link', { name: 'DST Sample Grant' }).click();
    await expect(remaining(page)).toHaveText('₹77,601.00 left');
  });

  test('REQ-CAP-15: an unreadable selection shows a message and leaves the form unchanged; Clear empties the selection', async ({ page }) => {
    await withTrip(page);
    await pasteText(page, UNKNOWN);
    await page.getByRole('link', { name: 'Review' }).click();
    await word(page, 'Alert').click();
    await page.getByRole('button', { name: 'Use as amount' }).click();
    await expect(page.getByTestId('assigner-note')).toContainText('"Alert" does not look like an amount.');
    await expect(page.getByLabel(/^Amount/)).toHaveValue('');
    await page.getByRole('button', { name: 'Use as date' }).click();
    await expect(page.getByTestId('assigner-note')).toContainText('does not look like a date');
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(word(page, 'Alert')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Use as reference' })).toBeDisabled();
  });

  test('REQ-CAP-15: words are keyboard-usable buttons at least 44 px tall', async ({ page }) => {
    await withTrip(page);
    await pasteText(page, UNKNOWN);
    await page.getByRole('link', { name: 'Review' }).click();
    const box = await word(page, 'Alert').boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await word(page, 'Alert').focus();
    await page.keyboard.press('Space');
    await expect(word(page, 'Alert')).toHaveAttribute('aria-pressed', 'true');
  });

  test('REQ-CAP-15: a selection assigned for one Inbox item is not carried onto the next item', async ({ page }) => {
    await withTrip(page);
    await pasteText(page, 'second message ZED STORE');
    await pasteText(page, UNKNOWN);
    await page.getByTestId('inbox-item').filter({ hasText: 'XYZ MART' }).getByRole('link', { name: 'Review' }).click();
    await word(page, 'XYZ').click();
    await page.getByRole('button', { name: 'Use as payee' }).click();
    await page.getByLabel(/^Amount/).fill('10');
    await page.getByRole('button', { name: 'Confirm expense' }).click();
    await expect(page.getByTestId('inbox-text')).toContainText('second message');
    await expect(page.getByLabel('Paid to (payee)')).toHaveValue('');
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
