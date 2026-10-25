import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRepo } from '../../src/client/db/repo.ts';
import { ExpResDb } from '../../src/client/db/schema.ts';
import { handleShare } from '../../src/client/sw/share-target.ts';

let n = 0;
const opened: ExpResDb[] = [];
const fresh = () => {
  const db = new ExpResDb(`share-${++n}`);
  opened.push(db);
  return { db, repo: createRepo(db) };
};
afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close();
    await ExpResDb.delete(db.name);
  }
});

const share = (fields: Record<string, string | File | File[]>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) for (const v of Array.isArray(value) ? value : [value]) form.append(key, v);
  return new Request('https://expres.example/share-target', { method: 'POST', body: form });
};
const png = (name: string) => new File(['PNG'], name, { type: 'image/png' });

describe('REQ-OFF-03: Share Target handled by the service worker', () => {
  it('REQ-OFF-03: 2 images plus some text create 3 Inbox records (2 files, 1 text) and a 303 redirect to /inbox?shared=3', async () => {
    const { db, repo } = fresh();
    const res = await handleShare(share({ files: [png('a.png'), png('b.png')], text: 'Rs 100 spent at CAFE on 01-Nov-26' }), repo);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('https://expres.example/inbox?shared=3');
    const items = await db.inbox.toArray();
    expect(items.filter((i) => i.kind === 'file')).toHaveLength(2);
    expect(items.filter((i) => i.kind === 'text')).toHaveLength(1);
  });

  it('REQ-OFF-03: text may arrive in text, title or url: the distinct non-empty values are joined', async () => {
    const { db, repo } = fresh();
    await handleShare(share({ title: 'Bank alert', text: 'Rs 100 spent at CAFE', url: '' }), repo);
    await handleShare(share({ title: 'Same words', text: 'Same words' }), repo);
    await handleShare(share({ text: '', title: '', url: 'https://example.com/receipt' }), repo);
    const texts = (await db.inbox.toArray()).map((i) => i.text).sort();
    expect(texts).toEqual(['Bank alert\nRs 100 spent at CAFE', 'Same words', 'https://example.com/receipt'].sort());
  });

  it('REQ-OFF-03: shared SMS text is scrubbed of card digits and balances before it is stored', async () => {
    const { db, repo } = fresh();
    await handleShare(share({ text: 'INR 2,450.00 spent on card XX1234 at HOTEL SAMPLE on 12-Nov-26. Avl Lmt INR 85,000.00 Bal Rs.123456' }), repo);
    const stored = JSON.stringify(await db.inbox.toArray());
    for (const secret of ['1234', '85,000', '123456']) expect(stored).not.toContain(secret);
    expect(stored).toContain('HOTEL SAMPLE');
  });

  it('REQ-OFF-03: an unsupported file is skipped and counted, the rest are kept', async () => {
    const { db, repo } = fresh();
    const res = await handleShare(share({ files: [png('ok.png'), new File(['x'], 'notes.docx', { type: 'application/msword' })] }), repo);
    expect(res.headers.get('Location')).toBe('https://expres.example/inbox?shared=1&skipped=1');
    expect(await db.inbox.count()).toBe(1);
  });

  it('REQ-OFF-03: an IndexedDB write failure redirects to /inbox?error=share, never silently dropping the share', async () => {
    const { db, repo } = fresh();
    await db.open();
    db.close(); // writes now fail
    const res = await handleShare(share({ files: png('a.png') }), repo);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('https://expres.example/inbox?error=share');
  });

  it('REQ-OFF-03: an empty share (nothing usable) just opens the Inbox with 0 added', async () => {
    const { repo } = fresh();
    const res = await handleShare(share({ title: ' ' }), repo);
    expect(res.headers.get('Location')).toBe('https://expres.example/inbox?shared=0');
  });
});
