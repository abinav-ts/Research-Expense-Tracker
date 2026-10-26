import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { createGrant, createTrip, loadDemoAndOpenTrip, verifiedDemoTrip } from './helpers.ts';

async function openClaim(page: Page) {
  await page.getByTestId('prepare-claim').click();
  await expect(page.getByTestId('claim-preview')).toBeVisible();
}
async function fillAndSubmit(page: Page) {
  await page.getByLabel('Your name').fill('Asha Researcher');
  await page.getByLabel('Your email').fill('asha@example.org');
  await page.getByLabel('I make the declaration above.').check();
  await page.getByLabel('I have checked that the preview is what the reviewer will see.').check();
  await page.getByRole('button', { name: 'Submit claim' }).click();
  await expect(page.getByTestId('claim-sent')).toBeVisible();
}
const links = async (page: Page) => ({
  review: await page.getByTestId('review-link').inputValue(),
  owner: await page.getByTestId('owner-link').inputValue(),
});

test.describe('REQ-CLM-01: the preview is what the reviewer sees', () => {
  test('REQ-CLM-01: lists every item with its statement line, proofs, category totals and the grant position', async ({ page }) => {
    await verifiedDemoTrip(page);
    await openClaim(page);
    const items = page.getByTestId('claim-item');
    await expect(items).toHaveCount(4);
    await expect(page.getByTestId('claim-total')).toContainText('₹44,220.55'); // 1,850 + 640 + 24,500 + 17,230.55
    await expect(items.filter({ hasText: 'HOTEL SAMPLE' }).getByTestId('claim-statement-line')).toContainText('₹24,500.00');
    await expect(items.filter({ hasText: 'Lisbon Computing' }).getByTestId('claim-item-amount')).toHaveText('₹17,230.55'); // the bank amount, not the estimate
    await expect(items.filter({ hasText: 'Lisbon Computing' })).toContainText('EUR 180.00');
    await expect(page.getByTestId('claim-position')).toContainText('₹1,00,000.00');
    await expect(page.getByTestId('claim-categories')).toContainText('Accommodation (1)');
    // proofs are opened on request
    const first = items.first();
    await expect(first.getByTestId('claim-proof')).toHaveCount(1);
    await first.getByRole('button', { name: /^View/ }).click();
    await expect(first.locator('img[alt^="UPI screenshot"]')).toBeVisible();
    await items.filter({ hasText: 'HOTEL SAMPLE' }).getByRole('button', { name: /^View/ }).click();
    await expect(page.getByTestId('claim-proof-text')).toContainText('INR 24,500.00 spent on card');
  });

  test('REQ-CLM-01: an excluded expense is not in the claim', async ({ page }) => {
    await verifiedDemoTrip(page);
    await page.getByTestId('expense-row').filter({ hasText: 'Uber' }).click();
    await page.getByRole('button', { name: /Exclude/ }).click();
    await page.goBack();
    await openClaim(page);
    await expect(page.getByTestId('claim-item')).toHaveCount(3);
    await expect(page.getByTestId('claim-preview')).not.toContainText('Uber');
  });

  test('REQ-CLM-01: works at phone width with no sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await verifiedDemoTrip(page);
    await openClaim(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('REQ-CLM-04: submitting', () => {
  test('REQ-CLM-04, REQ-CLM-03, REQ-PRIV-03: Submit stays disabled until the details, the declaration and the check are done', async ({ page }) => {
    await verifiedDemoTrip(page);
    await openClaim(page);
    const submit = page.getByRole('button', { name: 'Submit claim' });
    await expect(submit).toBeDisabled();
    await page.getByLabel('Your name').fill('Asha Researcher');
    await page.getByLabel('Your email').fill('not-an-email');
    await expect(page.getByText('That does not look like an email address.')).toBeVisible();
    await page.getByLabel('Your email').fill('asha@example.org');
    await expect(submit).toBeDisabled();
    await page.getByLabel('I make the declaration above.').check();
    await expect(submit).toBeDisabled();
    await page.getByLabel('I have checked that the preview is what the reviewer will see.').check();
    await expect(submit).toBeEnabled();
  });

  test('REQ-CLM-04, REQ-RULE-09: unmatched bank-paid items block Submit and the page links to each', async ({ page }) => {
    await loadDemoAndOpenTrip(page);
    await openClaim(page);
    await expect(page.getByTestId('claim-blocked')).toContainText('Fix these before you can submit');
    await expect(page.getByTestId('claim-blocked').getByRole('link')).toHaveCount(4);
    await page.getByLabel('Your name').fill('Asha');
    await page.getByLabel('Your email').fill('asha@example.org');
    await page.getByLabel('I make the declaration above.').check();
    await page.getByLabel('I have checked that the preview is what the reviewer will see.').check();
    await expect(page.getByRole('button', { name: 'Submit claim' })).toBeDisabled();
  });

  test('REQ-CLM-04, REQ-REV-01, REQ-CLM-07: submit returns two links; the reviewer sees the same claim; the trip remembers it', async ({ page, context }) => {
    await verifiedDemoTrip(page);
    await openClaim(page);
    const previewText = await page.getByTestId('claim-preview').innerText();
    await fillAndSubmit(page);
    const { review, owner } = await links(page);
    expect(review).toMatch(/\/review\/[A-Za-z0-9_-]{43}$/);
    expect(owner).toMatch(/\/claim\/[A-Za-z0-9_-]{43}$/);
    expect(review.split('/').pop()).not.toBe(owner.split('/').pop());

    const reviewer = await context.newPage();
    await reviewer.goto(review);
    await expect(reviewer.getByRole('heading', { name: 'Review claim' })).toBeVisible();
    await expect(reviewer.getByTestId('claim-claimant')).toContainText('Asha Researcher');
    // The reviewer's page shows the same pack as the preview (the claimant name aside, which the preview showed too).
    const shown = await reviewer.getByTestId('claim-view').innerText();
    const normal = (t: string) => t.replace(/Your decision[\s\S]*?(?=\n[A-Z][^\n]*\n₹|\nGrant documents|\nDeclaration)/g, '').replace(/\s+/g, ' ');
    for (const line of ['HOTEL SAMPLE', '₹24,500.00', 'Lisbon Computing Society', '₹17,230.55', 'Left after this claim']) {
      expect(previewText).toContain(line);
      expect(shown).toContain(line);
    }
    expect(normal(previewText).length).toBeGreaterThan(200);
    await expect(reviewer.getByTestId('claim-item')).toHaveCount(4);
    await expect(reviewer.getByTestId('claim-total')).toContainText('₹44,220.55');

    // the trip remembers the submission and links to the outcome
    await page.getByRole('link', { name: 'SampleConf 2026' }).first().click();
    await expect(page.getByTestId('sent-claims')).toContainText('4 items');
    await page.getByRole('link', { name: 'See the outcome' }).click();
    await expect(page.getByTestId('claim-status-text')).toHaveText('Submitted');
  });

  test('REQ-CLM-04: offline, Submit explains and sends nothing; the PDF still works; back online it can be sent', async ({ page, context }) => {
    await verifiedDemoTrip(page);
    await openClaim(page);
    await page.getByLabel('Your name').fill('Asha');
    await page.getByLabel('Your email').fill('asha@example.org');
    await page.getByLabel('I make the declaration above.').check();
    await page.getByLabel('I have checked that the preview is what the reviewer will see.').check();
    const posts: string[] = [];
    page.on('request', (r) => r.method() === 'POST' && posts.push(r.url()));
    await context.setOffline(true);
    await expect(page.getByTestId('claim-offline')).toContainText('Submit when connected');
    await expect(page.getByRole('button', { name: 'Submit claim' })).toBeDisabled();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download claim pack (PDF)' }).click();
    expect((await download).suggestedFilename()).toMatch(/^claim-pack-.*\.pdf$/);
    expect(posts).toEqual([]);
    await context.setOffline(false);
    await expect(page.getByRole('button', { name: 'Submit claim' })).toBeEnabled();
  });
});

test.describe('REQ-CLM-02: the PDF', () => {
  test('REQ-CLM-02: the download is a real PDF named after the trip, made without any request', async ({ page }) => {
    await verifiedDemoTrip(page);
    await openClaim(page);
    const requests: string[] = [];
    page.on('request', (r) => !r.url().startsWith('blob:') && !r.url().startsWith('data:') && requests.push(r.url()));
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download claim pack (PDF)' }).click();
    const d = await download;
    expect(d.suggestedFilename()).toBe('claim-pack-SampleConf-2026.pdf');
    const bytes = readFileSync((await d.path())!);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(20_000);
    expect(requests.filter((u) => u.includes('/api/'))).toEqual([]);
  });
});

test.describe('REQ-PRIV-01, REQ-PRIV-02, REQ-PRIV-05: what leaves the device', () => {
  test('REQ-PRIV-01, REQ-PRIV-05: from a new grant to the PDF, every request goes to our own server and none carries data; only Submit does', async ({ page }) => {
    const seen: { url: string; method: string; body: string | null }[] = [];
    page.on('request', (r) => seen.push({ url: r.url(), method: r.method(), body: r.postData() }));
    await verifiedDemoTrip(page);
    await openClaim(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download claim pack (PDF)' }).click();
    await download;
    const real = seen.filter((r) => !r.url.startsWith('blob:') && !r.url.startsWith('data:'));
    for (const r of real) expect(new URL(r.url).origin, r.url).toBe('http://localhost:4173');
    expect(real.filter((r) => r.method !== 'GET' && r.method !== 'HEAD')).toEqual([]);
    expect(real.filter((r) => r.url.includes('/api/claims'))).toEqual([]);
  });

  test('REQ-PRIV-02, REQ-PRIV-03: the request carries the previewed claim and only that: no unmatched statement rows, no balances, no excluded expense', async ({ page }) => {
    // Chromium cannot show the body of a request that holds files, so record what the page hands to fetch().
    await page.addInitScript(() => {
      const real = window.fetch.bind(window);
      (window as unknown as { __sent: Record<string, string>[] }).__sent = [];
      window.fetch = async (input, init) => {
        if (init?.body instanceof FormData) {
          const fields: Record<string, string> = {};
          for (const [k, v] of init.body.entries()) fields[k] = typeof v === 'string' ? v : `file:${v.type}:${v.size}`;
          (window as unknown as { __sent: Record<string, string>[] }).__sent.push(fields);
        }
        return real(input, init);
      };
    });
    await verifiedDemoTrip(page);
    await page.getByTestId('expense-row').filter({ hasText: 'Uber' }).click();
    await page.getByRole('button', { name: /Exclude/ }).click();
    await page.goBack();
    await openClaim(page);
    const previewed = await page.getByTestId('claim-total').innerText();
    await fillAndSubmit(page);
    const sent = await page.evaluate(() => (window as unknown as { __sent: Record<string, string>[] }).__sent);
    expect(sent).toHaveLength(1);
    const fields = sent[0]!;
    const payload = JSON.parse(fields.payload!) as { items: { description: string; amountMinor: number; statementRef?: Record<string, unknown> }[]; position: { thisClaimMinor: number }; files: { id: string }[] };
    expect(payload.items.map((i) => i.description).sort()).toEqual(['HOTEL SAMPLE', 'IRCTC', 'Lisbon Computing Society']);
    expect(previewed).toContain('₹43,580.55'); // 1,850 + 24,500 + 17,230.55
    expect(payload.position.thisClaimMinor).toBe(4_358_055);
    for (const i of payload.items) expect(Object.keys(i.statementRef ?? {}).every((k) => ['date', 'narration', 'debitMinor', 'refNo', 'rowHash'].includes(k))).toBe(true);
    // nothing from the statement's other rows, and no balance, anywhere in the request
    const everything = JSON.stringify(fields);
    for (const unrelated of ['GREEN GROCERS', 'STREAMFLIX', 'PHARMACY', 'RECHARGE', 'SAMPLE DINING', 'BOOKSHOP', 'SALARY', 'SAMPLE HOLDER', '00000000000', 'UBER', 'balance']) expect(everything.toUpperCase(), unrelated).not.toContain(unrelated.toUpperCase());
    // one file part per file the payload lists, and no other
    const parts = Object.keys(fields).filter((k) => !['payload', 'reviewToken', 'ownerToken'].includes(k));
    expect(parts.sort()).toEqual(payload.files.map((f) => f.id).sort());
    for (const part of parts) expect(fields[part]).toMatch(/^file:(image\/jpeg|text\/plain):/);
  });
});

test.describe('REQ-PRIV-04: pictures are made small and plain before they leave', () => {
  test('REQ-CLM-04, REQ-PRIV-04: a large phone photo with location data is sent as a JPEG under 1 MB without that data', async ({ page }) => {
    // A 3000 x 2000 noisy photo (too big to send as it is) with a fake location tag in its EXIF block.
    const photo = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 3000;
      canvas.height = 2000;
      const ctx = canvas.getContext('2d')!;
      const data = ctx.createImageData(3000, 2000);
      for (let i = 0; i < data.data.length; i += 4) { data.data[i] = Math.random() * 255; data.data[i + 1] = Math.random() * 255; data.data[i + 2] = Math.random() * 255; data.data[i + 3] = 255; }
      ctx.putImageData(data, 0, 0);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.95));
      const jpeg = new Uint8Array(await blob.arrayBuffer());
      const exif = new TextEncoder().encode('Exif\0\0GPS-MARKER-12.97N-77.59E');
      const segment = new Uint8Array([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 0xff, ...exif]);
      const out = new Uint8Array(jpeg.length + segment.length);
      out.set(jpeg.subarray(0, 2));
      out.set(segment, 2);
      out.set(jpeg.subarray(2), 2 + segment.length);
      let text = '';
      for (let i = 0; i < out.length; i += 0x8000) text += String.fromCharCode(...out.subarray(i, i + 0x8000));
      return btoa(text);
    });
    const buffer = Buffer.from(photo, 'base64');
    expect(buffer.length).toBeGreaterThan(1_000_000);
    expect(buffer.includes('GPS-MARKER')).toBe(true);

    await page.addInitScript(() => {
      const real = window.fetch.bind(window);
      (window as unknown as { __files: string[] }).__files = [];
      window.fetch = async (input, init) => {
        if (init?.body instanceof FormData) {
          for (const [, v] of init.body.entries()) {
            if (typeof v === 'string') continue;
            const bytes = new Uint8Array(await v.arrayBuffer());
            (window as unknown as { __files: string[] }).__files.push(`${v.type}|${v.size}|${new TextDecoder('latin1').decode(bytes).includes('GPS-MARKER')}`);
          }
        }
        return real(input, init);
      };
    });
    await createGrant(page);
    await createTrip(page);
    await page.goto('/inbox');
    await page.getByLabel('Choose proof files').setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer });
    await page.getByRole('link', { name: 'Review' }).first().click();
    await page.getByLabel(/^Amount/).fill('300');
    await page.getByLabel('Date').fill('2026-11-12');
    await page.getByLabel('Paid to (payee)').fill('Airport Taxi');
    await page.getByLabel('Category').selectOption('local_transport');
    await page.getByLabel('Paid by').selectOption('cash');
    await page.getByRole('button', { name: 'Confirm expense' }).click();
    await expect(page.getByTestId('inbox-empty')).toBeVisible();
    await page.goto('/grants');
    await page.getByRole('link', { name: /DST Sample Grant/ }).click();
    await page.getByRole('link', { name: 'SampleConf 2026' }).click();
    await openClaim(page);
    await fillAndSubmit(page);
    const files = await page.evaluate(() => (window as unknown as { __files: string[] }).__files);
    expect(files).toHaveLength(1);
    const [type, size, hasGps] = files[0]!.split('|');
    expect(type).toBe('image/jpeg');
    expect(Number(size)).toBeLessThanOrEqual(1_000_000);
    expect(hasGps).toBe('false');
  });
});

test.describe('REQ-REV-01..04: the reviewer', () => {
  async function submitDemo(page: Page, context: import('@playwright/test').BrowserContext) {
    await verifiedDemoTrip(page);
    await openClaim(page);
    await fillAndSubmit(page);
    const l = await links(page);
    const reviewer = await context.newPage();
    await reviewer.goto(l.review);
    await expect(reviewer.getByTestId('claim-item')).toHaveCount(4);
    return { reviewer, ...l };
  }
  const item = (p: Page, text: string) => p.getByTestId('claim-item').filter({ hasText: text });

  test('REQ-REV-02, REQ-REV-03, REQ-REV-05, REQ-CLM-07: decide each item with comments, finish with an outcome, then it is locked; the owner sees it all', async ({ page, context }) => {
    const { reviewer, owner } = await submitDemo(page, context);
    await expect(reviewer.getByTestId('claim-status-text')).toHaveText('Submitted');
    await expect(reviewer.getByRole('button', { name: 'Finish review' })).toBeDisabled();

    await item(reviewer, 'IRCTC').getByRole('button', { name: 'Approve' }).click();
    await expect(item(reviewer, 'IRCTC').getByTestId('item-saved')).toContainText('Saved');
    await expect(reviewer.getByTestId('claim-status-text')).toHaveText('In review');
    await item(reviewer, 'Uber').getByRole('button', { name: 'Query' }).click();
    await item(reviewer, 'Uber').getByLabel('Comment (optional)').fill('Which trip was this for?');
    await item(reviewer, 'Uber').getByRole('button', { name: 'Save comment' }).click();
    await item(reviewer, 'HOTEL SAMPLE').getByRole('button', { name: 'Approve' }).click();
    await item(reviewer, 'Lisbon Computing').getByRole('button', { name: 'Reject' }).click();
    await expect(reviewer.getByTestId('total-approved')).toHaveText('₹26,350.00');
    await expect(reviewer.getByTestId('total-rejected')).toHaveText('₹17,230.55');
    await expect(reviewer.getByTestId('total-open')).toHaveText('₹640.00');
    await expect(reviewer.getByRole('button', { name: 'Finish review' })).toBeDisabled(); // a query is not a decision
    await reviewer.reload(); // decisions survive a reload
    await expect(item(reviewer, 'Uber').getByLabel('Comment (optional)')).toHaveValue('Which trip was this for?');
    await item(reviewer, 'Uber').getByRole('button', { name: 'Reject' }).click();

    await reviewer.getByRole('button', { name: 'Finish review' }).click();
    await expect(reviewer.getByTestId('finish-confirm')).toContainText('Partially approved');
    await reviewer.getByLabel('Overall comment (optional)').fill('Hotel and train fine; the rest is not covered.');
    await reviewer.getByRole('button', { name: 'Confirm and finish' }).click();
    await expect(reviewer.getByTestId('review-finished')).toContainText('Partially approved');
    await expect(reviewer.getByRole('button', { name: 'Approve' }).first()).toBeDisabled();
    await reviewer.reload();
    await expect(reviewer.getByTestId('claim-status-text')).toHaveText('Partially approved');
    await expect(reviewer.getByRole('button', { name: 'Approve' }).first()).toBeDisabled(); // still locked after a reload

    const researcher = await context.newPage();
    await researcher.goto(owner);
    await expect(researcher.getByTestId('claim-status-text')).toHaveText('Partially approved');
    await expect(researcher.getByTestId('claim-overall-comment')).toContainText('Hotel and train fine');
    await expect(researcher.getByTestId('total-approved')).toHaveText('₹26,350.00');
    await expect(item(researcher, 'Uber').getByTestId('claim-review-note')).toContainText('Rejected');
  });

  test('REQ-REV-04: the reviewer opens a proof from the server, and a reviewer page has no link home', async ({ page, context }) => {
    const { reviewer } = await submitDemo(page, context);
    await item(reviewer, 'IRCTC').getByRole('button', { name: /^View/ }).click();
    const img = item(reviewer, 'IRCTC').locator('img[alt^="UPI screenshot"]');
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(100);
    await expect(img).toHaveAttribute('src', /\/api\/review\/[A-Za-z0-9_-]{43}\/files\//);
    await expect(reviewer.getByTestId('brand-logo')).toBeVisible();
    await expect(reviewer.getByRole('link', { name: 'ExpRes' })).toHaveCount(0);
    await expect(reviewer.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('REQ-REV-01: an invalid review link or owner link says so plainly', async ({ page }) => {
    await page.goto('/review/' + 'z'.repeat(43));
    await expect(page.getByTestId('link-invalid')).toContainText('This link is not valid');
    await page.goto('/claim/nonsense');
    await expect(page.getByTestId('link-invalid')).toBeVisible();
  });
});

test.describe('REQ-DEMO-03: the sample claim', () => {
  test('REQ-DEMO-03: opens with no setup, shows five items, and decisions stay in this browser; finishing can be repeated', async ({ page }) => {
    const writes: string[] = [];
    page.on('request', (r) => r.method() !== 'GET' && writes.push(r.method() + ' ' + r.url()));
    await page.goto('/review/sample');
    await expect(page.getByTestId('claim-item')).toHaveCount(5);
    await expect(page.getByTestId('claim-total')).toContainText('₹44,520.55');
    await expect(page.getByTestId('claim-status-text')).toContainText('(sample)');
    for (const name of ['Approve']) {
      const buttons = page.getByRole('button', { name });
      for (let i = 0; i < 5; i++) await buttons.nth(i).click();
    }
    await expect(page.getByTestId('total-approved')).toHaveText('₹44,520.55');
    await page.getByRole('button', { name: 'Finish review' }).click();
    await page.getByRole('button', { name: 'Confirm and finish' }).click();
    await expect(page.getByTestId('review-finished')).toContainText('Approved');
    await page.getByRole('button', { name: 'Start the sample again' }).click();
    await expect(page.getByTestId('total-open')).toHaveText('₹44,520.55');
    expect(writes).toEqual([]); // nothing was sent anywhere
  });

  test('REQ-DEMO-03: the sample is reachable from the landing page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /sample/i }).first().click();
    await expect(page).toHaveURL(/\/review\/sample$/);
    await expect(page.getByTestId('claim-item')).toHaveCount(5);
  });
});
