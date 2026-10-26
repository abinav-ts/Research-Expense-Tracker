import { expect, test, type Page } from '@playwright/test';
import { routes } from '../../src/client/app/routes.ts';
import { loadDemoAndOpenTrip, verifiedDemoTrip } from './helpers.ts';

test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** Every button, link, input and select that is on screen must be at least 44 px tall (REQ-NFR-01). */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('a[href], button, select, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, summary')) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden' || el.closest('[hidden]') || el.closest('[aria-hidden="true"]')) continue;
      if (el.closest('p, li, td, dd, pre') && el.tagName === 'A' && !el.closest('nav') && getComputedStyle(el).display === 'inline') continue; // a link inside a sentence
      if (r.height < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(r.height)}px`);
    }
    return out;
  });
}

test.describe('REQ-NFR-01: usable from 360 px wide', () => {
  test('REQ-NFR-01: every screen that needs no data opens at 360 px with no sideways scrolling', async ({ page }) => {
    for (const route of routes) {
      await page.goto(route.sample);
      await expect(page.getByTestId('brand-logo'), route.sample).toBeVisible();
      expect(await noSidewaysScroll(page), route.sample).toBe(true);
    }
  });

  test('REQ-NFR-01: with the demo data, the trip, expense, statement, claim and reviewer screens fit 360 px with touch targets of at least 44 px', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    const stops: [string, () => Promise<void>][] = [
      ['trip', async () => undefined],
      ['expense', async () => { await page.getByTestId('expense-row').first().click(); }],
      ['statement', async () => { await page.goBack(); await page.getByRole('link', { name: 'Match bank statement' }).click(); }],
    ];
    for (const [name, go] of stops) {
      await go();
      expect(await noSidewaysScroll(page), name).toBe(true);
      expect(await smallTargets(page), name).toEqual([]);
    }
    await page.goto('/review/sample');
    await expect(page.getByTestId('claim-item')).toHaveCount(5);
    expect(await noSidewaysScroll(page), 'reviewer').toBe(true);
    expect(await smallTargets(page), 'reviewer').toEqual([]);
  });

  test('REQ-NFR-01: the claim screen at 360 px has big enough targets too', async ({ page }) => {
    await verifiedDemoTrip(page);
    await page.getByTestId('prepare-claim').click();
    await expect(page.getByTestId('claim-preview')).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(true);
    expect(await smallTargets(page)).toEqual([]);
  });
});
