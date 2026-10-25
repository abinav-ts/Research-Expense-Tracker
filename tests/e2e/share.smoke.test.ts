import { expect, test, type Page } from '@playwright/test';

// What the Android share sheet does: a multipart POST *navigation* to /share-target.
async function postShare(page: Page, share: { files?: string[]; text?: string; title?: string }) {
  await page.evaluate(({ files = [], text = '', title = '' }) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/share-target';
    form.enctype = 'multipart/form-data';
    const add = (name: string, value: string) => {
      const input = document.createElement('input');
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };
    add('title', title);
    add('text', text);
    add('url', '');
    if (files.length) {
      const input = document.createElement('input');
      input.type = 'file';
      input.name = 'files';
      input.multiple = true;
      const transfer = new DataTransfer();
      for (const name of files) transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], name, { type: name.endsWith('.png') ? 'image/png' : 'application/msword' }));
      input.files = transfer.files;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  }, share);
}

test.describe('REQ-OFF-03: Share Target', () => {
  test('REQ-OFF-03: the manifest declares the share target for images, PDFs and text', async ({ page, request }) => {
    await page.goto('/');
    const manifest = await (await request.get((await page.locator('link[rel="manifest"]').getAttribute('href'))!)).json();
    expect(manifest.share_target).toEqual({
      action: '/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'files', accept: ['image/*', 'application/pdf'] }] },
    });
  });

  test('REQ-CAP-03, REQ-OFF-03: sharing 2 images and text lands in the Inbox as 3 items, with the network off, and the card digits are not kept', async ({ page, context }) => {
    await page.goto('/inbox');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // the service worker now controls the page
    await context.setOffline(true);

    await postShare(page, { files: ['one.png', 'two.png'], text: 'INR 2,450.00 spent on card XX1234 at HOTEL SAMPLE on 12-Nov-26. Avl Lmt INR 85,000.00' });
    await page.waitForURL('**/inbox?shared=3');
    await expect(page.getByTestId('share-result')).toHaveText('✓ 3 items added from the share sheet.');
    await expect(page.getByTestId('inbox-item')).toHaveCount(3);
    await expect(page.getByTestId('inbox-badge')).toHaveText('3');
    const listed = await page.getByTestId('inbox-list').innerText();
    expect(listed).toContain('HOTEL SAMPLE');
    expect(listed).not.toContain('1234');
    expect(listed).not.toContain('85,000');
    await context.setOffline(false);
  });

  test('REQ-CAP-03: an unsupported shared file is skipped with a visible message and the valid one is kept', async ({ page }) => {
    await page.goto('/inbox');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await postShare(page, { files: ['ok.png', 'notes.docx'] });
    await page.waitForURL('**/inbox?shared=1&skipped=1');
    await expect(page.getByTestId('inbox-item')).toHaveCount(1);
    await expect(page.getByText('1 shared file was skipped: use PDF, JPG, PNG, WebP.')).toBeVisible();
  });

  test('REQ-CAP-03: where sharing is not supported the Inbox still offers picker and paste, with a one-line hint', async ({ page }) => {
    await page.goto('/inbox');
    await expect(page.getByText("your phone's share sheet may not list ExpRes")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose files' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Paste text' })).toBeVisible();
  });

  test('REQ-OFF-03: the Inbox says plainly when a share could not be saved', async ({ page }) => {
    await page.goto('/inbox?error=share');
    await expect(page.getByTestId('share-error')).toContainText('Nothing was saved from that share');
  });
});
