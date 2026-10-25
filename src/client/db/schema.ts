// REQ-CAP-11: all researcher data lives in IndexedDB (via Dexie). Files are Blobs, never base64.
import Dexie, { type Table } from 'dexie';
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
  }
}
