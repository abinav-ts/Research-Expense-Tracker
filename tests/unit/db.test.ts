import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRepo, StorageError } from '../../src/client/db/repo.ts';
import { ExpResDb } from '../../src/client/db/schema.ts';
import { scrubReceiptText } from '../../src/shared/receipt-parser.ts';
import type { ExpenseFields } from '../../src/shared/expense-form.ts';

let counter = 0;
const opened: ExpResDb[] = [];
function fresh(name = `test-${++counter}`) {
  const db = new ExpResDb(name);
  opened.push(db);
  return { db, name, repo: createRepo(db) };
}
afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close();
    await ExpResDb.delete(db.name);
  }
});

const grantFields = { name: 'DST Sample Grant', sponsor: 'Sample Agency', totalMinor: 10_000_000, utilisedBeforeMinor: 2_000_000, startDate: '2026-04-01', endDate: '2027-03-31' };
const tripFields = { name: 'SampleConf 2026', city: 'Lisbon', country: 'Portugal', startDate: '2026-11-10', endDate: '2026-11-14' };
const expenseFields = (extra: Partial<ExpenseFields> = {}): ExpenseFields => ({
  originalMinor: 245_050, originalCurrency: 'INR', inrMinor: 245_050, date: '2026-11-12', payee: 'Hotel Sample', paymentMode: 'bank', ...extra,
});
const file = (name: string, type: string, body = 'x') => new File([body], name, { type });

describe('REQ-CAP-11: local persistence', () => {
  it('REQ-CAP-11: grants, trips, expenses, payee memory and the last trip survive closing and reopening the database', async () => {
    const { db, name, repo } = fresh();
    const grant = await repo.createGrant(grantFields);
    const trip = await repo.createTrip(grant.id, tripFields);
    await repo.addExpense(trip.id, expenseFields({ categoryId: 'accommodation' }));
    db.close(); // "reload": a new connection to the same stored data

    const reopened = new ExpResDb(name);
    opened.push(reopened);
    const again = createRepo(reopened);
    expect((await again.listGrants()).map((g) => g.name)).toEqual(['DST Sample Grant']);
    expect(await again.lastTripId()).toBe(trip.id);
    expect((await again.payeeMemory()).get('hotel sample')).toBe('accommodation');
  });

  it('REQ-CAP-11: files are stored as Blobs, not text, and come back byte for byte', async () => {
    const { db, repo } = fresh();
    const grant = await repo.createGrant(grantFields);
    await repo.addGrantDocuments(grant.id, [file('sanction.pdf', 'application/pdf', 'PDF-BYTES')]);
    const [doc] = await db.grantDocs.toArray();
    const row = await db.blobs.get(doc!.blobKey);
    expect(row!.blob).toBeInstanceOf(Blob);
    expect(await (await repo.getBlob(doc!.blobKey))!.text()).toBe('PDF-BYTES');
    expect(doc!.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('REQ-CAP-11: unconfirmed Inbox items survive a reload', async () => {
    const { db, name, repo } = fresh();
    await repo.addInboxFiles([file('a.png', 'image/png')]);
    await repo.addInboxText('INR 100.00 spent at CAFE');
    db.close();
    const again = new ExpResDb(name);
    opened.push(again);
    expect(await again.inbox.count()).toBe(2);
  });

  it('REQ-CAP-11: a write that fails is reported as a StorageError with a message, never swallowed', async () => {
    const { db, repo } = fresh();
    await db.open();
    db.close(); // a closed database cannot accept the write
    await expect(repo.createGrant(grantFields)).rejects.toBeInstanceOf(StorageError);
    await expect(repo.createGrant(grantFields)).rejects.toThrow(/not saved/);
  });

  it('REQ-CAP-11: the database is versioned so a newer app can migrate older data', async () => {
    const { db } = fresh();
    await db.open();
    expect(db.verno).toBeGreaterThanOrEqual(1);
  });

  it('REQ-CAP-11: older stored grants missing rule fields load with defaults filled in', async () => {
    const { db, repo } = fresh();
    await db.grants.add({ id: 'old', name: 'Old', sponsor: '', currency: 'INR', totalMinor: 100, utilisedBeforeMinor: 0, startDate: '2026-01-01', endDate: '2026-12-31', createdAt: 'x', updatedAt: 'x', rules: { categories: { meals: { eligible: false } } } } as never);
    const g = await repo.getGrant('old');
    expect(g!.rules.travelBufferDays).toBe(2);
    expect(g!.rules.categories.meals).toEqual({ eligible: false, requiresProof: true });
    expect(g!.rules.categories.airfare).toEqual({ eligible: true, requiresProof: true });
  });
});

describe('REQ-SET-01: deleting a grant', () => {
  async function seeded() {
    const f = fresh();
    const grant = await f.repo.createGrant(grantFields);
    const t1 = await f.repo.createTrip(grant.id, tripFields);
    const t2 = await f.repo.createTrip(grant.id, { ...tripFields, name: 'Second' });
    for (let i = 0; i < 7; i++) await f.repo.addExpense(i < 4 ? t1.id : t2.id, expenseFields({ payee: `P${i}` }));
    await f.repo.addGrantDocuments(grant.id, [file('s.pdf', 'application/pdf')]);
    const other = await f.repo.createGrant({ ...grantFields, name: 'Other grant' });
    const otherTrip = await f.repo.createTrip(other.id, tripFields);
    await f.repo.addExpense(otherTrip.id, expenseFields());
    return { ...f, grant, other };
  }

  it('REQ-SET-01: reports what a delete would remove: 2 trips, 7 expenses and 1 document', async () => {
    const { repo, grant } = await seeded();
    expect(await repo.grantDeletionImpact(grant.id)).toEqual({ trips: 2, expenses: 7, documents: 1 });
  });

  it('REQ-SET-01: confirming removes the grant, its trips, expenses, documents and their files, and nothing else', async () => {
    const { db, repo, grant, other } = await seeded();
    const blobsBefore = await db.blobs.count();
    await repo.deleteGrant(grant.id);
    expect(await db.grants.count()).toBe(1);
    expect((await db.grants.toArray())[0]!.id).toBe(other.id);
    expect(await db.trips.count()).toBe(1);
    expect(await db.expenses.count()).toBe(1);
    expect(await db.grantDocs.count()).toBe(0);
    expect(await db.blobs.count()).toBe(blobsBefore - 1);
  });

  it('REQ-SET-01: editing the total changes the stored grant; the balance is computed from it', async () => {
    const { repo, grant } = await seeded();
    await repo.updateGrant(grant.id, { ...grantFields, totalMinor: 15_000_000 });
    expect((await repo.getGrant(grant.id))!.totalMinor).toBe(15_000_000);
  });
});

describe('REQ-SET-02: trips', () => {
  it('REQ-SET-02: deleting a trip removes its expenses and their proof files', async () => {
    const { db, repo } = fresh();
    const grant = await repo.createGrant(grantFields);
    const trip = await repo.createTrip(grant.id, tripFields);
    for (let i = 0; i < 5; i++) await repo.addExpense(trip.id, expenseFields({ payee: `P${i}` }));
    await repo.addInboxFiles([file('p.png', 'image/png')]);
    const [item] = await db.inbox.toArray();
    await repo.confirmInboxItem(item!.id, trip.id, expenseFields({ payee: 'With proof' }));
    expect(await repo.tripDeletionImpact(trip.id)).toEqual({ expenses: 6 });
    await repo.deleteTrip(trip.id);
    expect(await db.expenses.count()).toBe(0);
    expect(await db.blobs.count()).toBe(0);
    expect(await db.grants.count()).toBe(1);
  });

  it('REQ-SET-02: clearing the optional budget and rates on edit removes them', async () => {
    const { db, repo } = fresh();
    const grant = await repo.createGrant(grantFields);
    const trip = await repo.createTrip(grant.id, { ...tripFields, budgetMinor: 5_000_000, fxRatesMicro: { EUR: 95_000_000 } });
    await repo.updateTrip(trip.id, tripFields);
    const stored = await db.trips.get(trip.id);
    expect(stored!.budgetMinor).toBeUndefined();
    expect(stored!.fxRatesMicro).toBeUndefined();
  });
});

describe('REQ-SET-07: grant documents', () => {
  it('REQ-SET-07: adds a PDF and a JPG, skips a .docx with a message, and removes one with its file', async () => {
    const { db, repo } = fresh();
    const grant = await repo.createGrant(grantFields);
    const r = await repo.addGrantDocuments(grant.id, [file('a.pdf', 'application/pdf'), file('b.jpg', 'image/jpeg'), file('c.docx', 'application/msword')]);
    expect(r.added).toBe(2);
    expect(r.messages).toEqual(['"c.docx" was skipped: use PDF, JPG, PNG, WebP.']);
    const docs = await db.grantDocs.toArray();
    expect(docs.map((d) => d.name).sort()).toEqual(['a.pdf', 'b.jpg']);
    await repo.removeGrantDocument(docs[0]!.id);
    expect(await db.grantDocs.count()).toBe(1);
    expect(await db.blobs.count()).toBe(1);
  });

  it('REQ-SET-07: a file over 1 MB is stored but marked too large and left out of the claim pack', async () => {
    const { db, repo } = fresh();
    const grant = await repo.createGrant(grantFields);
    const r = await repo.addGrantDocuments(grant.id, [file('big.pdf', 'application/pdf', 'x'.repeat(1024 * 1024 + 1))]);
    expect(r.added).toBe(1);
    expect(r.messages[0]).toContain('Too large to include in a claim (max 1 MB)');
    expect((await db.grantDocs.toArray())[0]!.includeInPack).toBe(false);
  });
});

describe('REQ-CAP-04: Inbox', () => {
  it('REQ-CAP-04: confirming an image proof creates the expense with the proof attached and empties the Inbox item', async () => {
    const { db, repo } = fresh();
    const grant = await repo.createGrant(grantFields);
    const trip = await repo.createTrip(grant.id, tripFields);
    await repo.addInboxFiles([file('shot.png', 'image/png', 'PNG')]);
    const [item] = await db.inbox.toArray();
    await repo.setInboxProofType(item!.id, 'upi_screenshot');
    const e = await repo.confirmInboxItem(item!.id, trip.id, expenseFields({ payee: 'Ramesh Stores', categoryId: 'meals' }));
    expect(e).toMatchObject({ source: 'proof', inrStatus: 'pending', tripId: trip.id });
    expect(e.attachments).toHaveLength(1);
    expect(e.attachments[0]).toMatchObject({ kind: 'proof', proofType: 'upi_screenshot', mime: 'image/png' });
    expect(await db.inbox.count()).toBe(0);
    expect(await (await repo.getBlob(e.attachments[0]!.blobKey))!.text()).toBe('PNG');
  });

  it('REQ-CAP-04: confirming a text item stores only the scrubbed text as the proof', async () => {
    const { db, repo } = fresh();
    const grant = await repo.createGrant(grantFields);
    const trip = await repo.createTrip(grant.id, tripFields);
    const item = await repo.addInboxText(scrubReceiptText('INR 2,450.00 spent on card XX1234 at HOTEL SAMPLE on 12-Nov-26. Avl Lmt INR 85,000.00'));
    const e = await repo.confirmInboxItem(item.id, trip.id, expenseFields());
    const text = await (await repo.getBlob(e.attachments[0]!.blobKey))!.text();
    expect(text).toContain('HOTEL SAMPLE');
    expect(text).not.toContain('1234');
    expect(text).not.toContain('85,000');
    expect(e.attachments[0]).toMatchObject({ mime: 'text/plain', proofType: 'card_alert' });
    expect(await db.inbox.count()).toBe(0);
  });

  it('REQ-CAP-04: discarding deletes the item and its file for good', async () => {
    const { db, repo } = fresh();
    await repo.addInboxFiles([file('a.png', 'image/png')]);
    const [item] = await db.inbox.toArray();
    await repo.discardInboxItem(item!.id);
    expect(await db.inbox.count()).toBe(0);
    expect(await db.blobs.count()).toBe(0);
  });

  it('REQ-CAP-02: three files at once become three Inbox items in selection order; a PDF over 1 MB is flagged', async () => {
    let t = 0;
    const { db, repo } = (() => {
      const db = new ExpResDb(`test-${++counter}`);
      opened.push(db);
      return { db, repo: createRepo(db, { now: () => new Date(Date.UTC(2026, 10, 12, 10, 0, t++)).toISOString() }) };
    })();
    const r = await repo.addInboxFiles([file('1.png', 'image/png'), file('2.jpg', 'image/jpeg'), file('3.pdf', 'application/pdf', 'x'.repeat(1024 * 1024 + 5)), file('4.docx', 'application/msword')]);
    expect(r.added).toBe(3);
    expect(r.messages).toHaveLength(2);
    const items = await db.inbox.orderBy('receivedAt').toArray();
    expect(items.map((i) => i.name)).toEqual(['1.png', '2.jpg', '3.pdf']);
    expect(items.map((i) => !!i.tooLarge)).toEqual([false, false, true]);
  });
});

describe('REQ-CAP-06: editing and excluding expenses', () => {
  it('REQ-CAP-06: edit changes the amount, exclude flips the flag, delete removes the row and its files', async () => {
    const { db, repo } = fresh();
    const grant = await repo.createGrant(grantFields);
    const trip = await repo.createTrip(grant.id, tripFields);
    const e = await repo.addExpense(trip.id, expenseFields({ note: 'dinner', categoryId: 'meals' }));
    await repo.updateExpense(e.id, expenseFields({ originalMinor: 300_000, inrMinor: 300_000 }));
    const edited = (await db.expenses.get(e.id))!;
    expect(edited.inrMinor).toBe(300_000);
    expect(edited.note).toBeUndefined(); // cleared in the form
    await repo.setExcluded(e.id, true);
    expect((await db.expenses.get(e.id))!.excluded).toBe(true);
    await repo.deleteExpense(e.id);
    expect(await db.expenses.count()).toBe(0);
  });
});

describe('REQ-CAP-02: selection order', () => {
  it('REQ-CAP-02: files added in the same millisecond still keep their selection order', async () => {
    const db = new ExpResDb(`test-${++counter}`);
    opened.push(db);
    const repo = createRepo(db, { now: () => '2026-11-12T10:00:00.000Z' }); // a frozen clock: every stamp would tie
    await repo.addInboxFiles(['a', 'b', 'c', 'd', 'e'].map((n) => file(`${n}.png`, 'image/png')));
    expect((await db.inbox.orderBy('receivedAt').toArray()).map((i) => i.name)).toEqual(['a.png', 'b.png', 'c.png', 'd.png', 'e.png']);
  });
});
