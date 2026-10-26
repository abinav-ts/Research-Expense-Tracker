// REQ-CAP-11: all researcher data lives in IndexedDB (via Dexie). Files are Blobs, never base64.
import Dexie, { type Table } from 'dexie';
import { payeeKey } from '../../shared/categoriser.ts';
import type { Anchor } from '../../shared/learn.ts';
import type { CategoryId, Expense, Grant, GrantDocument, InboxItem, Trip } from '../../shared/types.ts';

export interface BlobRow {
  id: string;
  blob: Blob;
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
  }
}
