import { expect, test } from '@playwright/test';

// M0 landing page. No REQ IDs in these titles: REQ-DEMO-01 is only partly done (no public URL or sample claim yet).
test.describe('M0 landing page', () => {
  test('M0 landing: explains the app and offers Researcher and Reviewer (sample claim) entry points', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Nothing leaves your device until you submit a claim.')).toBeVisible();
    await expect(page.getByRole('link', { name: /Researcher/ })).toHaveAttribute('href', '/grants');
    await expect(page.getByRole('link', { name: /Reviewer \(sample claim\)/ })).toHaveAttribute('href', '/review/sample');
  });

  test('M0 landing: both entry points open a page inside the shell', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Researcher/ }).first().click();
    await expect(page).toHaveURL('/grants');
    await expect(page.getByRole('heading', { name: 'Your grants' })).toBeVisible();
    await page.goBack();
    await page.getByRole('link', { name: /Reviewer \(sample claim\)/ }).click();
    await expect(page).toHaveURL('/review/sample');
    await expect(page.getByRole('heading', { name: 'Sample claim' })).toBeVisible();
  });

  test('M0 landing: the touch targets are at least 44 px tall', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/');
    for (const name of [/Researcher/, /Reviewer \(sample claim\)/]) {
      const box = await page.getByRole('link', { name }).first().boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('M0 landing: the page makes no network request to any other origin and none to /api', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto('/');
    await page.locator('[data-testid="brand-logo"]').waitFor();
    await page.waitForLoadState('networkidle');
    expect(requests.filter((u) => !u.startsWith('http://localhost:4173/'))).toEqual([]);
    expect(requests.filter((u) => u.includes('/api/'))).toEqual([]);
  });
});
