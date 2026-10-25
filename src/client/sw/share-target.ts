// REQ-CAP-03 / REQ-OFF-03: the service worker receives what the OS share sheet sends (images, PDFs, text), saves it
// to the Inbox in IndexedDB and redirects to /inbox. No network is needed. Kept free of service-worker globals
// so it can be unit-tested with plain Request/FormData objects.
import { scrubReceiptText } from '../../shared/receipt-parser.ts';
import type { Repo } from '../db/repo.ts';

/** Android often puts the same text in both `title` and `text`; join the distinct non-empty values. */
function sharedText(form: FormData): string {
  const parts = ['title', 'text', 'url']
    .map((key) => form.get(key))
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .map((v) => v.trim());
  return [...new Set(parts)].join('\n');
}

export async function handleShare(request: Request, repo: Pick<Repo, 'addInboxFiles' | 'addInboxText'>): Promise<Response> {
  const to = (query: string) => Response.redirect(new URL(`/inbox?${query}`, request.url).href, 303);
  try {
    const form = await request.formData();
    const files = form.getAll('files').filter((v): v is File => typeof v !== 'string' && v.size > 0);
    const text = sharedText(form);

    let added = 0;
    if (files.length) added += (await repo.addInboxFiles(files)).added;
    const skipped = files.length - added;
    // Card digits and balances are removed before anything is stored (REQ-CAP-13).
    if (text) {
      await repo.addInboxText(scrubReceiptText(text));
      added += 1;
    }
    return to(`shared=${added}${skipped > 0 ? `&skipped=${skipped}` : ''}`);
  } catch (error) {
    console.error('share failed', error);
    return to('error=share'); // never drop silently: the Inbox says nothing was saved
  }
}
