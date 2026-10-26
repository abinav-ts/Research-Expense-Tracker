import { expect, test } from '@playwright/test';
import { addExpense, createGrant, createTrip, pngFile, remaining } from './helpers.ts';

test.describe('REQ-SET-01: grant CRUD', () => {
  test('REQ-SET-01: creating "DST Sample Grant" shows ₹80,000.00 remaining on the grants screen and survives a reload', async ({ page }) => {
    await createGrant(page);
    await expect(remaining(page)).toHaveText('₹80,000.00 left');
    await page.goto('/grants');
    const card = page.getByTestId('grant-card');
    await expect(card).toContainText('DST Sample Grant');
    await expect(card.getByTestId('balance-remaining')).toHaveText('₹80,000.00 left');
    await page.reload();
    await expect(page.getByTestId('grant-card').getByTestId('balance-remaining')).toHaveText('₹80,000.00 left');
  });

  test('REQ-SET-01: each invalid field shows its own inline message and nothing is saved', async ({ page }) => {
    await page.goto('/grants/new');
    await page.getByRole('button', { name: 'Create grant' }).click();
    await expect(page.getByText('Enter a grant name')).toBeVisible();
    await expect(page.getByText('Enter a start date')).toBeVisible();
    await expect(page.getByText('Enter a valid number')).toBeVisible();
    await page.getByLabel('Grant name').fill('G');
    await page.getByLabel('Sanctioned total (₹)').fill('1000');
    await page.getByLabel(/Already utilised/).fill('2000');
    await page.getByLabel('Grant start date').fill('2026-05-01');
    await page.getByLabel('Grant end date').fill('2026-04-01');
    await page.getByRole('button', { name: 'Create grant' }).click();
    await expect(page.getByText('Cannot be more than the sanctioned total')).toBeVisible();
    await expect(page.getByText('End date must be on or after the start date')).toBeVisible();
    await page.goto('/grants');
    await expect(page.getByText('No grants yet')).toBeVisible();
  });

  test('REQ-SET-01: changing the total to ₹1,50,000.00 shows ₹1,30,000.00 remaining at once', async ({ page }) => {
    await createGrant(page);
    await page.getByRole('link', { name: 'Edit grant' }).click();
    await page.getByLabel('Sanctioned total (₹)').fill('1,50,000.00');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(remaining(page)).toHaveText('₹1,30,000.00 left');
  });

  test('REQ-SET-01: delete states what goes, Cancel deletes nothing, Confirm removes everything for good', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '500', payee: 'Cab One' });
    await addExpense(page, { amount: '700', payee: 'Cab Two' });
    await page.getByRole('link', { name: 'DST Sample Grant' }).click();
    await page.locator('#grant-doc-input').setInputFiles(pngFile('letter.png'));
    await expect(page.getByTestId('grant-doc')).toHaveCount(1);

    await page.getByRole('button', { name: 'Delete grant' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('1 trip, 2 expenses and 1 document will be deleted');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByTestId('trip-card')).toHaveCount(1);

    await page.getByRole('button', { name: 'Delete grant' }).click();
    await page.getByRole('button', { name: 'Delete everything' }).click();
    await expect(page.getByText('No grants yet')).toBeVisible();
    await page.reload();
    await expect(page.getByText('No grants yet')).toBeVisible();
  });
});

test.describe('REQ-SET-02: trips', () => {
  test('REQ-SET-02: "Add trip" with no grants asks the user to create a grant first', async ({ page }) => {
    await page.goto('/grants');
    await page.getByRole('button', { name: 'Add trip' }).click();
    await expect(page.getByText('Create a grant first')).toBeVisible();
    await page.goto('/trips/new');
    await expect(page.getByText('Create a grant first')).toBeVisible();
  });

  test('REQ-SET-02: SampleConf 2026 in Lisbon, Portugal is listed under its grant and opens a trip screen', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await expect(page.getByText('Lisbon, Portugal')).toBeVisible();
    await page.getByRole('link', { name: 'DST Sample Grant' }).click();
    await expect(page.getByTestId('trip-card')).toContainText('SampleConf 2026');
  });

  test('REQ-SET-02: required fields, end-before-start, and a warning (not a block) outside the grant period', async ({ page }) => {
    await createGrant(page);
    await page.getByRole('link', { name: 'Add trip' }).click();
    await page.getByRole('button', { name: 'Create trip' }).click();
    await expect(page.getByText('Enter the conference name')).toBeVisible();
    await expect(page.getByText('Enter the city')).toBeVisible();
    await expect(page.getByText('Enter the country')).toBeVisible();
    await page.getByLabel('Conference name').fill('Late Conf');
    await page.getByLabel('City').fill('Oslo');
    await page.getByLabel('Country').fill('Norway');
    await page.getByLabel('Start date').fill('2027-04-10');
    await page.getByLabel('End date').fill('2027-04-12');
    await expect(page.getByText("These dates fall outside the grant's period")).toBeVisible();
    await page.getByRole('button', { name: 'Create trip' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Late Conf' })).toBeVisible();
  });

  test('REQ-SET-02: deleting a trip removes its expenses and the grant balance rises without a reload', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '10,000', payee: 'Big Spend' });
    await expect(remaining(page)).toHaveText('₹70,000.00 left');
    await page.getByRole('link', { name: 'Edit trip' }).click();
    await page.getByRole('button', { name: 'Delete trip' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('1 expense will be deleted');
    await page.getByRole('button', { name: 'Delete trip', exact: true }).last().click();
    await expect(remaining(page)).toHaveText('₹80,000.00 left');
  });
});

test.describe('REQ-SET-06: foreign currency', () => {
  test('REQ-SET-06: €89.00 at the trip default 1 EUR = ₹95.00 is ₹8,455.00, labelled Estimated and Pending', async ({ page }) => {
    await createGrant(page);
    await createTrip(page, 'SampleConf 2026', { currency: 'EUR', rate: '95' });
    await page.getByRole('link', { name: 'Add expense' }).click();
    await page.getByLabel('Currency').fill('EUR');
    await expect(page.getByLabel('Estimated rate (₹ per 1 unit)')).toHaveValue('95'); // prefilled from the trip
    await page.getByLabel(/^Amount/).fill('89');
    await expect(page.getByTestId('inr-preview')).toHaveText('Estimated ₹8,455.00');
    await page.getByLabel('Date').fill('2026-11-12');
    await page.getByLabel('Paid to (payee)').fill('Invoice Co');
    await page.getByRole('button', { name: 'Save expense' }).click();
    const row = page.getByTestId('expense-row');
    await expect(row).toContainText('₹8,455.00');
    await expect(row).toContainText('EUR 89.00');
    await expect(row).toContainText('Estimated');
    await expect(row).toContainText('Pending');
    await expect(remaining(page)).toHaveText('₹71,545.00 left');
  });

  test('REQ-SET-06: saving a foreign expense with no rate is blocked with "Enter an estimated INR rate"', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    await page.getByRole('link', { name: 'Add expense' }).click();
    await page.getByLabel('Currency').fill('USD');
    await page.getByLabel(/^Amount/).fill('45');
    await page.getByLabel('Paid to (payee)').fill('Amazon');
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.getByText('Enter an estimated INR rate')).toBeVisible();
  });
});

test.describe('REQ-SET-07: grant documents', () => {
  test('REQ-SET-07: a PDF and a JPG are listed with type and size, open after reload, and can be removed after confirming', async ({ page }) => {
    await createGrant(page);
    await page.locator('#grant-doc-input').setInputFiles([
      { name: 'sanction.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sample') },
      { name: 'budget.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('jpegbytes') },
    ]);
    const docs = page.getByTestId('grant-doc');
    await expect(docs).toHaveCount(2);
    await expect(docs.filter({ hasText: 'sanction.pdf' })).toContainText('PDF');
    await expect(docs.filter({ hasText: 'budget.jpg' })).toContainText('JPEG');
    await page.reload();
    await expect(docs).toHaveCount(2);
    const popup = page.waitForEvent('popup');
    await docs.filter({ hasText: 'budget.jpg' }).getByRole('button', { name: 'Open' }).click();
    expect((await popup).url()).toContain('blob:');

    await page.getByRole('button', { name: 'Remove sanction.pdf' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('sanction.pdf');
    await page.getByRole('button', { name: 'Remove', exact: true }).last().click();
    await expect(docs).toHaveCount(1);
  });

  test('REQ-SET-07: a .docx is rejected with a message listing the accepted types', async ({ page }) => {
    await createGrant(page);
    await page.locator('#grant-doc-input').setInputFiles({ name: 'budget.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('x') });
    await expect(page.getByRole('status').filter({ hasText: 'use PDF, JPG, PNG, WebP, HEIC' })).toBeVisible();
    await expect(page.getByTestId('grant-doc')).toHaveCount(0);
  });

  test('REQ-SET-07: a file over 1 MB is stored but marked "Too large to include in a claim (max 1 MB)"', async ({ page }) => {
    await createGrant(page);
    await page.locator('#grant-doc-input').setInputFiles({ name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(1024 * 1024 + 10, 'x') });
    await expect(page.getByTestId('grant-doc')).toContainText('Too large to include in a claim (max 1 MB)');
  });
});
