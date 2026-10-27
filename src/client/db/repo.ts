// Every read/write of researcher data goes through here. Writes that fail (quota, blocked DB) become a StorageError
// with a message the UI shows; nothing fails silently (REQ-CAP-11).
import { payeeKey } from '../../shared/categoriser.ts';
import { learnAnchors, type Anchor } from '../../shared/learn.ts';
import { pairFields, statementRefOf, unlinkFields, canBeMatched } from '../../shared/reconcile.ts';
import type { StatementMapping, StatementRow } from '../../shared/statement-map.ts';
import { checkFile, TOO_LARGE_NOTE } from '../../shared/files.ts';
import { defaultRules, normaliseRules } from '../../shared/grant.ts';
import type { ExpenseFields } from '../../shared/expense-form.ts';
import type { GrantFields } from '../../shared/grant.ts';
import type { TripFields } from '../../shared/trip.ts';
import type { Attachment, CategoryId, Expense, Grant, GrantDocument, InboxItem, ProofType, Trip } from '../../shared/types.ts';
import { sha256Hex } from '../lib/hash.ts';
import type { BlobRow, ExpResDb, SubmissionRow } from './schema.ts';

export class StorageError extends Error {
  constructor(message = 'Could not save to this device. Free up space or try again; your last change was not saved.') {
    super(message);
    this.name = 'StorageError';
  }
}

export interface RepoOptions {
  newId?: () => string;
  now?: () => string;
  /** 'auto' (default) uses Blobs when this browser can store them; 'bytes' always stores bytes (for tests). */
  blobStorage?: 'auto' | 'bytes';
}

/** Can this browser keep a Blob in IndexedDB? Asked once; Safari in some modes says no. */
let blobSupport: Promise<boolean> | undefined;
function browserStoresBlobs(): Promise<boolean> {
  blobSupport ??= (async () => {
    const name = 'expres-blob-probe';
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(name, 1);
        open.onupgradeneeded = () => open.result.createObjectStore('b');
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('b', 'readwrite');
          tx.objectStore('b').put(new Blob(['x']), 'k');
          tx.oncomplete = () => resolve();
          tx.onerror = tx.onabort = () => reject(tx.error);
        });
        return true;
      } finally {
        db.close();
        indexedDB.deleteDatabase(name);
      }
    } catch {
      return false;
    }
  })();
  return blobSupport;
}
export interface DeletionImpact {
  trips: number;
  expenses: number;
  documents: number;
}
export interface ImportResult {
  added: number;
  messages: string[];
}

export function createRepo(db: ExpResDb, options: RepoOptions = {}) {
  const newId = options.newId ?? (() => crypto.randomUUID());
  // Timestamps always increase, so items added in one import keep their selection order even within one millisecond.
  const clock = options.now ?? (() => new Date().toISOString());
  let lastStamp = 0;
  const now = () => {
    const t = Math.max(Date.parse(clock()), lastStamp + 1);
    lastStamp = t;
    return new Date(t).toISOString();
  };

  /** Runs a write; any storage failure is reported as a StorageError. */
  async function write<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof StorageError) throw error;
      console.error(error);
      throw new StorageError();
    }
  }
  const allTables = [db.grants, db.trips, db.expenses, db.grantDocs, db.inbox, db.blobs, db.payeeCategories, db.meta, db.payees, db.anchors, db.bankProfiles, db.submissions];

  /**
   * Decides how a file is stored. Call this BEFORE opening a database transaction: reading a file's bytes is not
   * database work, and a transaction would close while waiting for it.
   */
  async function blobPayload(blob: Blob): Promise<Pick<BlobRow, 'blob' | 'bytes' | 'type'>> {
    if (options.blobStorage !== 'bytes' && (await browserStoresBlobs())) return { blob };
    return { bytes: await blob.arrayBuffer(), type: blob.type };
  }
  async function putBlob(payload: Pick<BlobRow, 'blob' | 'bytes' | 'type'>): Promise<string> {
    const id = newId();
    await db.blobs.put({ id, ...payload });
    return id;
  }

  /** Remembers the payee's spelling (REQ-CAP-16) and, when a category was chosen, the category (REQ-CAP-14). */
  async function rememberPayee(payee: string, categoryId: CategoryId | undefined, bump = true): Promise<void> {
    const key = payeeKey(payee);
    if (!key) return;
    const known = await db.payees.get(key);
    await db.payees.put({ key, name: payee.trim(), count: (known?.count ?? 0) + (bump ? 1 : 0), updatedAt: now() });
    if (categoryId) await db.payeeCategories.put({ payeeKey: key, categoryId, updatedAt: now() });
  }

  /** Stores the words around the confirmed values of a text (never the values themselves). */
  async function learnFormat(text: string | undefined, fields: ExpenseFields): Promise<void> {
    if (!text) return;
    const drafts = learnAnchors(text, {
      payee: fields.payee,
      ...(fields.reference && { reference: fields.reference }),
      amountMinor: fields.originalMinor,
      currency: fields.originalCurrency,
      date: fields.date,
    });
    for (const d of drafts) {
      const id = `${d.field}|${d.before.join(' ')}|${d.after ?? ''}`;
      const known = await db.anchors.get(id);
      await db.anchors.put({ ...d, id, count: (known?.count ?? 0) + 1, updatedAt: now() });
    }
  }

  /** Fingerprints of statement rows already used by any expense of the grant this trip belongs to. */
  async function usedHashes(tripId: string): Promise<Set<string>> {
    const trip = await db.trips.get(tripId);
    if (!trip) return new Set();
    const tripIds = (await db.trips.where('grantId').equals(trip.grantId).primaryKeys()) as string[];
    const expenses = await db.expenses.where('tripId').anyOf(tripIds).toArray();
    return new Set(expenses.flatMap((e) => (e.statementRef ? [e.statementRef.rowHash] : [])));
  }

  async function tripExpenseBlobKeys(tripIds: string[]): Promise<{ expenseIds: string[]; blobKeys: string[] }> {
    const expenses = await db.expenses.where('tripId').anyOf(tripIds).toArray();
    return { expenseIds: expenses.map((e) => e.id), blobKeys: expenses.flatMap((e) => e.attachments.map((a) => a.blobKey)) };
  }

  return {
    // ---- grants (REQ-SET-01) ----
    async createGrant(fields: GrantFields): Promise<Grant> {
      const stamp = now();
      const grant: Grant = { id: newId(), currency: 'INR', rules: defaultRules(), createdAt: stamp, updatedAt: stamp, ...fields };
      await write(() => db.grants.add(grant));
      return grant;
    },
    async updateGrant(id: string, fields: GrantFields): Promise<void> {
      await write(async () => {
        if ((await db.grants.update(id, { ...fields, updatedAt: now() })) === 0) throw new Error('grant not found');
      });
    },
    /** Older stored grants get missing rule fields filled with defaults on load (REQ-SET-03). */
    async getGrant(id: string): Promise<Grant | undefined> {
      const g = await db.grants.get(id);
      return g && { ...g, rules: normaliseRules(g.rules) };
    },
    async listGrants(): Promise<Grant[]> {
      const grants = await db.grants.orderBy('updatedAt').reverse().toArray();
      return grants.map((g) => ({ ...g, rules: normaliseRules(g.rules) }));
    },
    async grantDeletionImpact(id: string): Promise<DeletionImpact> {
      const trips = await db.trips.where('grantId').equals(id).toArray();
      const expenses = trips.length ? await db.expenses.where('tripId').anyOf(trips.map((t) => t.id)).count() : 0;
      return { trips: trips.length, expenses, documents: await db.grantDocs.where('grantId').equals(id).count() };
    },
    async deleteGrant(id: string): Promise<void> {
      await write(() =>
        db.transaction('rw', allTables, async () => {
          const tripIds = (await db.trips.where('grantId').equals(id).primaryKeys()) as string[];
          const { expenseIds, blobKeys } = await tripExpenseBlobKeys(tripIds);
          const docs = await db.grantDocs.where('grantId').equals(id).toArray();
          await db.blobs.bulkDelete([...blobKeys, ...docs.map((d) => d.blobKey)]);
          await db.grantDocs.bulkDelete(docs.map((d) => d.id));
          await db.expenses.bulkDelete(expenseIds);
          await db.trips.bulkDelete(tripIds);
          await db.grants.delete(id);
        }),
      );
    },

    // ---- grant documents (REQ-SET-07): stored only, never read ----
    async addGrantDocuments(grantId: string, files: File[]): Promise<ImportResult> {
      const result: ImportResult = { added: 0, messages: [] };
      for (const file of files) {
        const check = checkFile(file);
        if (!check.ok) {
          result.messages.push(check.message);
          continue;
        }
        const sha256 = await sha256Hex(file);
        const payload = await blobPayload(file);
        await write(async () => {
          const blobKey = await putBlob(payload);
          const doc: GrantDocument = { id: newId(), grantId, name: file.name, mime: check.mime, sizeBytes: file.size, sha256, blobKey, includeInPack: !check.overLimit };
          await db.grantDocs.add(doc);
        });
        result.added += 1;
        if (check.overLimit) result.messages.push(`"${file.name}": ${TOO_LARGE_NOTE}`);
      }
      return result;
    },
    async removeGrantDocument(id: string): Promise<void> {
      await write(async () => {
        const doc = await db.grantDocs.get(id);
        if (!doc) return;
        await db.transaction('rw', [db.grantDocs, db.blobs], async () => {
          await db.blobs.delete(doc.blobKey);
          await db.grantDocs.delete(id);
        });
      });
    },

    // ---- trips (REQ-SET-02) ----
    async createTrip(grantId: string, fields: TripFields): Promise<Trip> {
      const stamp = now();
      const trip: Trip = { id: newId(), grantId, createdAt: stamp, updatedAt: stamp, ...fields };
      await write(async () => {
        await db.trips.add(trip);
        await db.meta.put({ key: 'lastTripId', value: trip.id });
      });
      return trip;
    },
    async updateTrip(id: string, fields: TripFields): Promise<void> {
      await write(async () => {
        const existing = await db.trips.get(id);
        if (!existing) throw new Error('trip not found');
        const { budgetMinor: _b, fxRatesMicro: _f, ...rest } = existing; // optional fields cleared in the form must go away
        await db.trips.put({ ...rest, ...fields, updatedAt: now() });
      });
    },
    async tripDeletionImpact(id: string): Promise<{ expenses: number }> {
      return { expenses: await db.expenses.where('tripId').equals(id).count() };
    },
    async deleteTrip(id: string): Promise<void> {
      await write(() =>
        db.transaction('rw', allTables, async () => {
          const { expenseIds, blobKeys } = await tripExpenseBlobKeys([id]);
          await db.blobs.bulkDelete(blobKeys);
          await db.expenses.bulkDelete(expenseIds);
          await db.trips.delete(id);
        }),
      );
    },

    // ---- expenses (REQ-CAP-01, REQ-CAP-06) ----
    async addExpense(tripId: string, fields: ExpenseFields, extra: { source?: Expense['source']; attachments?: Attachment[] } = {}): Promise<Expense> {
      const stamp = now();
      const expense: Expense = {
        id: newId(), tripId, ...fields, inrStatus: 'pending', source: extra.source ?? 'manual',
        attachments: extra.attachments ?? [], excluded: false, createdAt: stamp, updatedAt: stamp,
      };
      await write(async () => {
        await db.expenses.add(expense);
        await rememberPayee(fields.payee, fields.categoryId);
        await db.meta.put({ key: 'lastTripId', value: tripId });
      });
      return expense;
    },
    /** Adds an expense together with proof files (used by demo data and later by supporting documents). */
    async addExpenseWithProofs(tripId: string, fields: ExpenseFields, proofs: { file: File; proofType: ProofType }[], source: Expense['source'] = 'proof'): Promise<Expense> {
      const hashes = await Promise.all(proofs.map((p) => sha256Hex(p.file)));
      const payloads = await Promise.all(proofs.map((p) => blobPayload(p.file)));
      let created!: Expense;
      await write(() =>
        db.transaction('rw', allTables, async () => {
          const attachments: Attachment[] = [];
          for (const [i, p] of proofs.entries()) {
            attachments.push({ id: newId(), kind: 'proof', proofType: p.proofType, mime: p.file.type, name: p.file.name, sizeBytes: p.file.size, sha256: hashes[i]!, blobKey: await putBlob(payloads[i]!) });
          }
          const stamp = now();
          created = { id: newId(), tripId, ...fields, inrStatus: 'pending', source, attachments, excluded: false, createdAt: stamp, updatedAt: stamp };
          await db.expenses.add(created);
          await rememberPayee(fields.payee, fields.categoryId);
          await db.meta.put({ key: 'lastTripId', value: tripId });
        }),
      );
      return created;
    },
    async updateExpense(id: string, fields: ExpenseFields): Promise<void> {
      await write(async () => {
        const existing = await db.expenses.get(id);
        if (!existing) throw new Error('expense not found');
        const { note: _n, reference: _r, categoryId: _c, estimatedRateMicro: _e, ...rest } = existing;
        await db.expenses.put({ ...rest, ...fields, updatedAt: now() });
        await rememberPayee(fields.payee, fields.categoryId, false);
      });
    },
    /** REQ-RULE-09: why a flagged item is fine. Up to 500 characters; empty removes it. A justification explains a flag, it never clears it. */
    async setJustification(id: string, text: string): Promise<void> {
      const value = text.trim().replace(/\s+/g, ' ').slice(0, 500);
      await write(async () => {
        const existing = await db.expenses.get(id);
        if (!existing) return;
        const { justification: _old, ...rest } = existing;
        await db.expenses.put({ ...rest, ...(value && { justification: value }), updatedAt: now() });
      });
    },
    async setExcluded(id: string, excluded: boolean): Promise<void> {
      await write(async () => void (await db.expenses.update(id, { excluded, updatedAt: now() })));
    },
    async deleteExpense(id: string): Promise<void> {
      await write(async () => {
        const e = await db.expenses.get(id);
        if (!e) return;
        await db.transaction('rw', [db.expenses, db.blobs], async () => {
          await db.blobs.bulkDelete(e.attachments.map((a) => a.blobKey));
          await db.expenses.delete(id);
        });
      });
    },
    async getBlob(key: string): Promise<Blob | undefined> {
      const row = await db.blobs.get(key);
      return row?.blob ?? (row?.bytes ? new Blob([row.bytes], { type: row.type ?? '' }) : undefined);
    },

    // ---- Inbox (REQ-CAP-02, -04, -13) ----
    async addInboxFiles(files: File[]): Promise<ImportResult> {
      const result: ImportResult = { added: 0, messages: [] };
      for (const file of files) {
        const check = checkFile(file);
        if (!check.ok) {
          result.messages.push(check.message);
          continue;
        }
        const sha256 = await sha256Hex(file);
        // Over-limit images are shrunk later (REQ-CAP-10); only PDFs are flagged now (REQ-CAP-02).
        const tooLarge = check.isPdf && check.overLimit;
        const payload = await blobPayload(file);
        await write(async () => {
          const blobKey = await putBlob(payload);
          const item: InboxItem = { id: newId(), kind: 'file', receivedAt: now(), blobKey, name: file.name, mime: check.mime, sizeBytes: file.size, sha256, tooLarge };
          await db.inbox.add(item);
        });
        result.added += 1;
        if (tooLarge) result.messages.push(`"${file.name}": ${TOO_LARGE_NOTE}`);
      }
      return result;
    },
    /** `scrubbedText` must already have card digits and available-limit text removed (scrubReceiptText). */
    async addInboxText(scrubbedText: string, proofType: ProofType = 'card_alert'): Promise<InboxItem> {
      const item: InboxItem = { id: newId(), kind: 'text', receivedAt: now(), text: scrubbedText, proofType };
      await write(() => db.inbox.add(item));
      return item;
    },
    async setInboxProofType(id: string, proofType: ProofType): Promise<void> {
      await write(async () => void (await db.inbox.update(id, { proofType })));
    },
    async discardInboxItem(id: string): Promise<void> {
      await write(async () => {
        const item = await db.inbox.get(id);
        if (!item) return;
        await db.transaction('rw', [db.inbox, db.blobs], async () => {
          if (item.blobKey) await db.blobs.delete(item.blobKey);
          await db.inbox.delete(id);
        });
      });
    },
    /** Confirming creates the Expense with the proof attached and removes the Inbox item. */
    /** `learnText`: the text the form was filled from (pasted SMS or text read from the image), used only to learn its layout. */
    async confirmInboxItem(itemId: string, tripId: string, fields: ExpenseFields, learnText?: string): Promise<Expense> {
      const item = await db.inbox.get(itemId);
      if (!item) throw new StorageError('That proof is no longer in the list.');
      const proofType: ProofType = item.proofType ?? (item.kind === 'text' ? 'card_alert' : 'other');
      // Hash before opening the transaction: IndexedDB transactions close if we await non-IndexedDB work inside.
      const textBlob = item.kind === 'text' ? new Blob([item.text ?? ''], { type: 'text/plain' }) : undefined;
      const textHash = textBlob ? await sha256Hex(textBlob) : '';
      const textPayload = textBlob ? await blobPayload(textBlob) : undefined;

      let created!: Expense;
      await write(() =>
        db.transaction('rw', allTables, async () => {
          let attachment: Attachment;
          if (item.kind === 'file' && item.blobKey) {
            attachment = { id: newId(), kind: 'proof', proofType, mime: item.mime ?? 'application/octet-stream', name: item.name ?? 'proof', sizeBytes: item.sizeBytes ?? 0, sha256: item.sha256 ?? '', blobKey: item.blobKey };
          } else {
            attachment = { id: newId(), kind: 'proof', proofType, mime: 'text/plain', name: 'message.txt', sizeBytes: textBlob!.size, sha256: textHash, blobKey: await putBlob(textPayload!) };
          }
          const stamp = now();
          created = { id: newId(), tripId, ...fields, inrStatus: 'pending', source: 'proof', attachments: [attachment], excluded: false, createdAt: stamp, updatedAt: stamp };
          await db.expenses.add(created);
          await rememberPayee(fields.payee, fields.categoryId);
          await learnFormat(learnText ?? (item.kind === 'text' ? item.text : undefined), fields);
          await db.meta.put({ key: 'lastTripId', value: tripId });
          await db.inbox.delete(itemId); // a file's blob now belongs to the expense
        }),
      );
      return created;
    },

    // ---- memory (REQ-CAP-14) and defaults ----
    async payeeMemory(): Promise<Map<string, CategoryId>> {
      return new Map((await db.payeeCategories.toArray()).map((r) => [r.payeeKey, r.categoryId]));
    },
    /** Payee spellings the user has saved, most-used first (REQ-CAP-16). */
    async knownPayees(): Promise<string[]> {
      return (await db.payees.orderBy('count').reverse().limit(300).toArray()).map((p) => p.name);
    },
    // ---- bank statement (REQ-CSV-02, -05, -08) ----
    async getBankProfile(key: string): Promise<StatementMapping | undefined> {
      return (await db.bankProfiles.get(key))?.mapping;
    },
    async saveBankProfile(key: string, mapping: StatementMapping): Promise<void> {
      await write(async () => void (await db.bankProfiles.put({ key, mapping, updatedAt: now() })));
    },
    /** Pairs a tracked expense with a statement debit: the debit becomes its amount and it is confirmed (REQ-CSV-08). */
    async confirmStatementPair(expenseId: string, row: StatementRow): Promise<void> {
      await write(() =>
        db.transaction('rw', [db.expenses, db.trips], async () => {
          const expense = await db.expenses.get(expenseId);
          if (!expense || !canBeMatched(expense)) throw new StorageError('That expense can no longer be matched.');
          if ((await usedHashes(expense.tripId)).has(row.rowHash)) throw new StorageError('That statement line is already used by another expense.');
          await db.expenses.put({ ...expense, ...pairFields(row), updatedAt: now() });
        }),
      );
    },
    /** Frees the debit and returns the expense to pending at its own amount. */
    async unlinkStatementPair(expenseId: string): Promise<void> {
      await write(async () => {
        const expense = await db.expenses.get(expenseId);
        if (!expense?.statementRef) return;
        const { statementRef: _gone, ...rest } = expense;
        await db.expenses.put({ ...rest, ...unlinkFields(expense), updatedAt: now() });
      });
    },
    /**
     * Ticked rows become expenses of the trip (source "statement", confirmed, bank-paid). A row already used by an expense of
     * the same grant is skipped, so adding the same file twice adds nothing (REQ-CSV-05). Their narrations are not added to
     * the payee list: they are the bank's wording, not the user's.
     */
    async addStatementExpenses(tripId: string, items: { row: StatementRow; categoryId?: CategoryId }[]): Promise<{ added: number; skipped: number }> {
      let added = 0;
      await write(() =>
        db.transaction('rw', [db.expenses, db.trips, db.meta], async () => {
          const used = await usedHashes(tripId);
          for (const { row, categoryId } of items) {
            if (used.has(row.rowHash)) continue;
            used.add(row.rowHash);
            const stamp = now();
            await db.expenses.add({
              id: newId(), tripId, date: row.date, payee: row.narration.slice(0, 80) || 'Bank debit', originalMinor: row.debitMinor, originalCurrency: 'INR',
              inrMinor: row.debitMinor, inrStatus: 'confirmed', paymentMode: 'bank', source: 'statement', statementRef: statementRefOf(row),
              ...(row.refNo && { reference: row.refNo }), ...(categoryId && { categoryId }), attachments: [], excluded: false, createdAt: stamp, updatedAt: stamp,
            });
            added += 1;
          }
          await db.meta.put({ key: 'lastTripId', value: tripId });
        }),
      );
      return { added, skipped: items.length - added };
    },

    /** Every remembered payee with its remembered category, A to Z (REQ-CAP-17). */
    async listPayees(): Promise<{ key: string; name: string; count: number; categoryId?: CategoryId }[]> {
      const [payees, categories] = await Promise.all([db.payees.toArray(), db.payeeCategories.toArray()]);
      const byKey = new Map(categories.map((c) => [c.payeeKey, c.categoryId]));
      return payees
        .map((p) => ({ key: p.key, name: p.name, count: p.count, ...(byKey.has(p.key) && { categoryId: byKey.get(p.key)! }) }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    },
    /**
     * Corrects what ExpRes remembers about a payee: the spelling it suggests, with its remembered category. If the new
     * spelling is already remembered the two are merged. Saved expenses are not changed.
     */
    async renamePayee(key: string, newName: string): Promise<void> {
      const name = newName.trim().replace(/\s+/g, ' ');
      const newKey = payeeKey(name);
      if (!newKey) throw new StorageError('Enter a name for this payee.');
      await write(() =>
        db.transaction('rw', [db.payees, db.payeeCategories], async () => {
          const old = await db.payees.get(key);
          if (!old) return;
          const target = newKey === key ? undefined : await db.payees.get(newKey);
          await db.payees.put({ key: newKey, name, count: (target?.count ?? 0) + old.count, updatedAt: now() });
          if (newKey !== key) {
            await db.payees.delete(key);
            const category = await db.payeeCategories.get(key);
            if (category) {
              await db.payeeCategories.delete(key);
              if (!(await db.payeeCategories.get(newKey))) await db.payeeCategories.put({ ...category, payeeKey: newKey });
            }
          }
        }),
      );
    },
    /** Forgets one payee (spelling and category). Saved expenses are not changed. */
    async removePayee(key: string): Promise<void> {
      await write(() =>
        db.transaction('rw', [db.payees, db.payeeCategories], async () => {
          await db.payees.delete(key);
          await db.payeeCategories.delete(key);
        }),
      );
    },
    async anchors(): Promise<Anchor[]> {
      return db.anchors.toArray();
    },
    async learningCounts(): Promise<{ payees: number; formats: number; categories: number }> {
      return { payees: await db.payees.count(), formats: await db.anchors.count(), categories: await db.payeeCategories.count() };
    },
    /** "Forget what ExpRes has learned": spellings, message formats and payee categories. Saved expenses are untouched. */
    async clearLearning(): Promise<void> {
      await write(() => db.transaction('rw', [db.payees, db.anchors, db.payeeCategories], async () => {
        await db.payees.clear();
        await db.anchors.clear();
        await db.payeeCategories.clear();
      }));
    },
    // ---- claims (REQ-CLM-03, REQ-CLM-04, REQ-CLM-07) ----
    /** The claimant's details from the last claim, so the next one starts filled in. */
    async getClaimant(): Promise<{ name: string; email: string; employeeId: string }> {
      const raw = (await db.meta.get('claimant'))?.value;
      try {
        const v = raw ? (JSON.parse(raw) as Partial<Record<'name' | 'email' | 'employeeId', string>>) : {};
        return { name: v.name ?? '', email: v.email ?? '', employeeId: v.employeeId ?? '' };
      } catch {
        return { name: '', email: '', employeeId: '' };
      }
    },
    async saveClaimant(c: { name: string; email: string; employeeId: string }): Promise<void> {
      await write(async () => void (await db.meta.put({ key: 'claimant', value: JSON.stringify(c) })));
    },
    async saveSubmission(row: SubmissionRow): Promise<void> {
      await write(async () => void (await db.submissions.put(row)));
    },
    async listSubmissions(tripId: string): Promise<SubmissionRow[]> {
      return (await db.submissions.where('tripId').equals(tripId).toArray()).sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
    },
    async lastTripId(): Promise<string | undefined> {
      return (await db.meta.get('lastTripId'))?.value;
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;
