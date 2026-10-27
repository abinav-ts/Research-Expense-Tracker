import { expect, test, type Page } from '@playwright/test';
import { createGrant, createTrip, pngFile, verifiedDemoTrip } from './helpers.ts';

const back = (page: Page) => page.getByTestId('back-link');

/** The page has a back link with this text; following it lands on `url`. */
async function expectBack(page: Page, text: string, url: RegExp | string) {
  await expect(back(page)).toHaveCount(1);
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await expect(back(page)).toHaveText(new RegExp(`^←\\s*Back to ${escaped}$`));
  await back(page).click();
  await expect(page).toHaveURL(url);
}

test.describe('REQ-NFR-09: a "Back to …" link on every inner screen', () => {
  test('REQ-NFR-09: grants, grant, trip and the trip tools each go back to where they came from', async ({ page }) => {
    await verifiedDemoTrip(page);
    const trip = page.url();
    const grantName = 'DST Sample Grant (SAMPLE)';

    await page.getByRole('link', { name: '+ Cash expense' }).click();
    await expectBack(page, 'SampleConf 2026', trip);
    await page.getByRole('link', { name: 'Match bank statement' }).click();
    await expectBack(page, 'SampleConf 2026', trip);
    await page.getByTestId('prepare-claim').click();
    await expectBack(page, 'SampleConf 2026', trip);
    await page.getByRole('link', { name: 'Edit trip' }).click();
    await expectBack(page, 'SampleConf 2026', trip);
    await page.getByTestId('expense-row').first().click();
    await expectBack(page, 'SampleConf 2026', trip);

    await expectBack(page, grantName, /\/grants\/[^/]+$/); // trip -> grant
    await page.getByRole('link', { name: 'Edit grant' }).click();
    await expectBack(page, grantName, /\/grants\/[^/]+$/);
    await page.getByRole('link', { name: 'Add trip' }).click();
    await expectBack(page, grantName, /\/grants\/[^/]+$/);
    await expectBack(page, 'grants', /\/grants$/);
    await expectBack(page, 'start', 'http://localhost:4173/');
  });

  test('REQ-NFR-09: new grant, expenses with proof, a proof being reviewed and settings', async ({ page }) => {
    await page.goto('/grants/new');
    await expectBack(page, 'grants', /\/grants$/);
    await page.goto('/settings');
    await expectBack(page, 'grants', /\/grants$/); // nothing worked on yet
    await createGrant(page);
    await createTrip(page);
    const trip = page.url();
    await page.getByRole('link', { name: '+ Expenses with proof' }).first().click();
    await expectBack(page, 'SampleConf 2026', trip); // the trip last worked on
    await page.getByRole('link', { name: '+ Expenses with proof' }).first().click();
    await page.getByLabel('Choose proof files').setInputFiles(pngFile('shot.png'));
    await page.getByRole('link', { name: 'Review' }).first().click();
    await expectBack(page, 'Expenses with proof', /\/inbox$/);
    await page.goto('/settings');
    await expectBack(page, 'SampleConf 2026', trip);
  });

  test('REQ-NFR-09: the reviewer, owner and landing pages have no back link, and a missing page offers a way out', async ({ page }) => {
    for (const path of ['/', '/review/sample', '/claim/none']) {
      await page.goto(path);
      await expect(back(page), path).toHaveCount(0);
    }
    await page.goto('/grants/none');
    await expect(page.getByRole('link', { name: 'Back to grants' })).toBeVisible();
  });
});

test.describe('REQ-NFR-10: clickable words are boxes', () => {
  /** Every link and text-style button in the page body is a visible box at least 44 px tall, with no underline. */
  async function nonBoxes(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('main a[href], header a[href], nav a[href]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const style = getComputedStyle(el);
        const hasBorder = parseFloat(style.borderTopWidth) > 0;
        const hasFill = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
        if (el.getAttribute('data-testid') === 'brand-logo') continue; // the logo is a mark, not a phrase
        const name = `${(el.textContent ?? '').trim().slice(0, 28)} (${Math.round(r.height)}px${hasBorder ? ', border' : ''}${hasFill ? ', fill' : ''}${style.textDecorationLine.includes('underline') ? ', underlined' : ''})`;
        if (!(hasBorder || hasFill) || r.height < 43.5 || style.textDecorationLine.includes('underline')) bad.push(name);
      }
      for (const el of document.querySelectorAll<HTMLElement>('main button')) {
        const style = getComputedStyle(el);
        if (style.textDecorationLine.includes('underline')) bad.push(`button ${(el.textContent ?? '').trim().slice(0, 28)} (underlined)`);
      }
      return bad;
    });
  }

  test('REQ-NFR-10: on the main screens no link is bare underlined text', async ({ page }) => {
    await verifiedDemoTrip(page);
    const trip = page.url();
    const screens: [string, () => Promise<void>][] = [
      ['trip', async () => { await page.goto(trip); }],
      ['grants', async () => { await page.goto('/grants'); }],
      ['grant', async () => { await page.getByRole('link', { name: /DST Sample Grant/ }).first().click(); }],
      ['expense', async () => { await page.goto(trip); await page.getByTestId('expense-row').first().click(); }],
      ['cash expense', async () => { await page.goto(trip); await page.getByRole('link', { name: '+ Cash expense' }).click(); }],
      ['statement', async () => { await page.goto(trip); await page.getByRole('link', { name: 'Match bank statement' }).click(); }],
      ['claim', async () => { await page.goto(trip); await page.getByTestId('prepare-claim').click(); await expect(page.getByTestId('claim-preview')).toBeVisible(); }],
      ['expenses with proof', async () => { await page.goto('/inbox'); }],
      ['settings', async () => { await page.goto('/settings'); }],
      ['empty trip hint', async () => { await page.goto('/grants/none'); }],
      ['sample claim', async () => { await page.goto('/review/sample'); await expect(page.getByTestId('claim-item')).toHaveCount(5); }],
      ['landing', async () => { await page.goto('/'); }],
      ['not found', async () => { await page.goto('/no-such-page'); }],
    ];
    for (const [name, go] of screens) {
      await go();
      expect(await nonBoxes(page), name).toEqual([]);
    }
  });

  test('REQ-NFR-10: the sentence links on a new trip and in the shell are boxes too, and Dismiss/Hide are boxed buttons', async ({ page }) => {
    await createGrant(page);
    await createTrip(page);
    expect(await nonBoxes(page)).toEqual([]); // the empty trip's sentence has "+ Expenses with proof" as a link
    await expect(page.getByTestId('empty-trip').getByRole('link', { name: '+ Expenses with proof' })).toBeVisible();
    const box = await page.getByTestId('empty-trip').getByRole('link', { name: '+ Expenses with proof' }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
