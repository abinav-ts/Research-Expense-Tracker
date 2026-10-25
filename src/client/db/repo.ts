// Every read/write of researcher data goes through here. Writes that fail (quota, blocked DB) become a StorageError
// with a message the UI shows; nothing fails silently (REQ-CAP-11).
import { payeeKey } from '../../shared/categoriser.ts';
import { checkFile, TOO_LARGE_NOTE } from '../../shared/files.ts';
import { defaultRules, normaliseRules } from '../../shared/grant.ts';
import type { ExpenseFields } from '../../shared/expense-form.ts';
import type { GrantFields } from '../../shared/grant.ts';
import type { TripFields } from '../../shared/trip.ts';
import type { Attachment, CategoryId, Expense, Grant, GrantDocument, InboxItem, ProofType, Trip } from '../../shared/types.ts';
import { sha256Hex } from '../lib/hash.ts';
import type { ExpResDb } from './schema.ts';

export class StorageError extends Error {
  constructor(message = 'Could not save to this device. Free up space or try again; your last change was not saved.') {
    super(message);
    this.name = 'StorageError';
  }
}

export interface RepoOptions {
  newId?: () => string;
  now?: () => string;
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
  const allTables = [db.grants, db.trips, db.expenses, db.grantDocs, db.inbox, db.blobs, db.payeeCategories, db.meta];

  async function putBlob(blob: Blob): Promise<string> {
    const id = newId();
    await db.blobs.put({ id, blob });
    return id;
  }

  async function rememberPayee(payee: string, categoryId: CategoryId | undefined): Promise<void> {
    const key = payeeKey(payee);
    if (key && categoryId) await db.payeeCategories.put({ payeeKey: key, categoryId, updatedAt: now() });
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
        await write(async () => {
          const blobKey = await putBlob(file);
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
      let created!: Expense;
      await write(() =>
        db.transaction('rw', allTables, async () => {
          const attachments: Attachment[] = [];
          for (const [i, p] of proofs.entries()) {
            attachments.push({ id: newId(), kind: 'proof', proofType: p.proofType, mime: p.file.type, name: p.file.name, sizeBytes: p.file.size, sha256: hashes[i]!, blobKey: await putBlob(p.file) });
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
        await rememberPayee(fields.payee, fields.categoryId);
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
      return (await db.blobs.get(key))?.blob;
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
        await write(async () => {
          const blobKey = await putBlob(file);
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
    async confirmInboxItem(itemId: string, tripId: string, fields: ExpenseFields): Promise<Expense> {
      const item = await db.inbox.get(itemId);
      if (!item) throw new StorageError('That Inbox item no longer exists.');
      const proofType: ProofType = item.proofType ?? (item.kind === 'text' ? 'card_alert' : 'other');
      // Hash before opening the transaction: IndexedDB transactions close if we await non-IndexedDB work inside.
      const textBlob = item.kind === 'text' ? new Blob([item.text ?? ''], { type: 'text/plain' }) : undefined;
      const textHash = textBlob ? await sha256Hex(textBlob) : '';

      let created!: Expense;
      await write(() =>
        db.transaction('rw', allTables, async () => {
          let attachment: Attachment;
          if (item.kind === 'file' && item.blobKey) {
            attachment = { id: newId(), kind: 'proof', proofType, mime: item.mime ?? 'application/octet-stream', name: item.name ?? 'proof', sizeBytes: item.sizeBytes ?? 0, sha256: item.sha256 ?? '', blobKey: item.blobKey };
          } else {
            attachment = { id: newId(), kind: 'proof', proofType, mime: 'text/plain', name: 'message.txt', sizeBytes: textBlob!.size, sha256: textHash, blobKey: await putBlob(textBlob!) };
          }
          const stamp = now();
          created = { id: newId(), tripId, ...fields, inrStatus: 'pending', source: 'proof', attachments: [attachment], excluded: false, createdAt: stamp, updatedAt: stamp };
          await db.expenses.add(created);
          await rememberPayee(fields.payee, fields.categoryId);
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
    async lastTripId(): Promise<string | undefined> {
      return (await db.meta.get('lastTripId'))?.value;
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;
