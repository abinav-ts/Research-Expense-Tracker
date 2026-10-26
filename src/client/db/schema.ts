// REQ-CAP-11: all researcher data lives in IndexedDB (via Dexie). Files are Blobs, never base64.
import Dexie, { type Table } from 'dexie';
import { payeeKey } from '../../shared/categoriser.ts';
import type { Anchor } from '../../shared/learn.ts';
import type { StatementMapping } from '../../shared/statement-map.ts';
import type { CategoryId, Expense, Grant, GrantDocument, InboxItem, Trip } from '../../shared/types.ts';

/**
 * A stored file. Normally a Blob; in browsers that cannot keep Blobs in IndexedDB (some Safari modes) the same file is
 * kept as bytes plus its type, and turned back into a Blob when read (REQ-CAP-11).
 */
export interface BlobRow {
  id: string;
  blob?: Blob;
  bytes?: ArrayBuffer;
  type?: string;
}
export interface PayeeCategoryRow {
  payeeKey: string;
  categoryId: CategoryId;
  updatedAt: string;
}
/** A payee spelling the user has saved (REQ-CAP-16). */
export interface PayeeRow {
  key: string;
  name: string;
  count: number;
  updatedAt: string;
}
export interface AnchorRow extends Anchor {
  updatedAt: string;
}
/** A bank's CSV layout, remembered so the next statement from it needs one tap (REQ-CSV-02). Column positions only: no data. */
export interface BankProfileRow {
  key: string;
  mapping: StatementMapping;
  updatedAt: string;
}
/**
 * A claim that was sent (REQ-CLM-04, REQ-CLM-07). Kept so the links can be shown again. The two links are secrets of the
 * researcher's own; they live only on this device (and in the copies the researcher shares).
 */
export interface SubmissionRow {
  id: string;
  tripId: string;
  tripName: string;
  reviewToken: string;
  ownerToken: string;
  submittedAt: string;
  totalMinor: number;
  itemCount: number;
}
export interface MetaRow {
  key: string;
  value: string;
}

export class ExpResDb extends Dexie {
  grants!: Table<Grant, string>;
  trips!: Table<Trip, string>;
  expenses!: Table<Expense, string>;
  grantDocs!: Table<GrantDocument, string>;
  inbox!: Table<InboxItem, string>;
  blobs!: Table<BlobRow, string>;
  payeeCategories!: Table<PayeeCategoryRow, string>;
  meta!: Table<MetaRow, string>;
  payees!: Table<PayeeRow, string>;
  anchors!: Table<AnchorRow, string>;
  bankProfiles!: Table<BankProfileRow, string>;
  submissions!: Table<SubmissionRow, string>;

  constructor(name = 'expres') {
    super(name);
    // Version 1. Later schema changes add a new .version(n) with an upgrade function; never edit an old one.
    this.version(1).stores({
      grants: 'id, updatedAt',
      trips: 'id, grantId',
      expenses: 'id, tripId, date',
      grantDocs: 'id, grantId',
      inbox: 'id, receivedAt',
      blobs: 'id',
      payeeCategories: 'payeeKey',
      meta: 'key',
    });
    // Version 2 (REQ-CAP-16): remembered payee spellings and message formats. Existing data is kept;
    // payee spellings are filled in from the expenses already saved.
    this.version(2)
      .stores({ payees: 'key, count', anchors: 'id, field' })
      .upgrade(async (tx) => {
        const rows = new Map<string, PayeeRow>();
        for (const e of await tx.table<Expense>('expenses').toArray()) {
          const key = payeeKey(e.payee);
          if (!key) continue;
          const known = rows.get(key);
          rows.set(key, { key, name: e.payee, count: (known?.count ?? 0) + 1, updatedAt: e.updatedAt });
        }
        await tx.table<PayeeRow>('payees').bulkPut([...rows.values()]);
      });
    // Version 3 (REQ-CSV-02): remembered bank statement layouts.
    this.version(3).stores({ bankProfiles: 'key' });
    // Version 4 (REQ-CLM-04): claims that were submitted, with their links.
    this.version(4).stores({ submissions: 'id, tripId' });
  }
}
