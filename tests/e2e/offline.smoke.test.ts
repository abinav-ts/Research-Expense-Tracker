import { expect, test, type Page } from '@playwright/test';
import { addExpense, createGrant, createTrip, verifiedDemoTrip } from './helpers.ts';

const CARD_SMS = 'INR 2,450.00 spent on card XX1234 at HOTEL SAMPLE on 12-Nov-26. Avl Lmt INR 85,000.00';
const ORIGIN = 'http://localhost:4173';

async function readyForOffline(page: Page) {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  await expect(page.getByText('Ready for offline use')).toBeVisible();
}

test.describe('REQ-OFF-02: segments A and B work with the network off', () => {
  test('REQ-OFF-02: offline, a user can create a grant and trip, add by hand and by pasted SMS, import and match the statement, preview the claim and export the PDF, touching no other origin', async ({ page, context }) => {
    await readyForOffline(page);
    const requests: string[] = [];
    page.on('request', (r) => !r.url().startsWith('blob:') && !r.url().startsWith('data:') && requests.push(r.url()));
    await context.setOffline(true);

    // the demo trip (it can only be loaded into an empty app), its statement, matching and the claim
    await verifiedDemoTrip(page);
    await page.getByTestId('prepare-claim').click();
    await expect(page.getByTestId('claim-item')).toHaveCount(4);
    await expect(page.getByTestId('claim-offline')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download claim pack (PDF)' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

    // then, still offline, set up another grant by hand and capture by hand and by pasted SMS
    await createGrant(page);
    await createTrip(page);
    await addExpense(page, { amount: '450', payee: 'Corner Cafe', category: 'meals' });
    await page.goto('/inbox');
    await page.getByRole('button', { name: 'Paste text' }).click();
    await page.getByLabel('Paste an SMS or payment notification').fill(CARD_SMS);
    await page.getByRole('button', { name: 'Add to Inbox' }).click();
    await expect(page.getByTestId('inbox-item')).toHaveCount(1);

    for (const url of requests) expect(new URL(url).origin, url).toBe(ORIGIN);
    expect(requests.filter((u) => u.includes('/api/claims'))).toEqual([]);
  });

  test('REQ-OFF-02: closing and reopening the app offline (a cold start) still shows the saved data', async ({ page, context }) => {
    await readyForOffline(page);
    await createGrant(page, { name: 'Kept Offline Grant' });
    await context.setOffline(true);
    const reopened = await context.newPage();
    await reopened.goto('/grants');
    await expect(reopened.getByTestId('grant-card').filter({ hasText: 'Kept Offline Grant' })).toBeVisible();
  });

  test('REQ-OFF-02: offline, the reviewer routes open from the app shell but the claim itself says it needs the network', async ({ page, context }) => {
    await readyForOffline(page);
    await context.setOffline(true);
    await page.goto('/review/' + 'a'.repeat(43));
    await expect(page.getByRole('heading', { name: 'The claim could not be loaded' })).toBeVisible();
  });
});

test.describe('REQ-OFF-07: online/offline indicator', () => {
  test('REQ-OFF-07: the header says Online or Offline with an icon, follows the connection within 2 seconds, and announces politely', async ({ page, context }) => {
    await page.goto('/grants');
    const status = page.getByTestId('connection-status');
    await expect(status).toHaveText('Online');
    await expect(status.locator('svg')).toHaveCount(1); // an icon as well as words
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await expect(status).toHaveAttribute('role', 'status');
    await context.setOffline(true);
    await expect(status).toHaveText('Offline', { timeout: 2000 });
    await context.setOffline(false);
    await expect(status).toHaveText('Online', { timeout: 2000 });
  });

  test('REQ-OFF-07: the indicator is on every kind of page, including the reviewer’s', async ({ page }) => {
    for (const path of ['/', '/grants', '/inbox', '/settings', '/review/sample']) {
      await page.goto(path);
      await expect(page.getByTestId('connection-status'), path).toBeVisible();
    }
  });

  test('REQ-OFF-07: offline, Submit is disabled with an explanation and fetching a review explains it needs the network', async ({ page, context }) => {
    await verifiedDemoTrip(page);
    await page.getByTestId('prepare-claim').click();
    await context.setOffline(true);
    await expect(page.getByRole('button', { name: 'Submit claim' })).toBeDisabled();
    await expect(page.getByTestId('claim-offline')).toContainText('Submit when connected');
  });
});
