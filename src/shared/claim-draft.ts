// REQ-RULE-01, REQ-CSV-05: turns a trip's expenses into the one ClaimDraft that the rules, the preview, the PDF and the
// submission all share (principle 4). Pure.
import type { ClaimDraft, ClaimItem, Expense, Grant, Trip } from './types.ts';

/** Date, then creation order, so every list built from a draft has one fixed order. */
export function compareItems(a: { date: string; createdAt?: string; id: string }, b: { date: string; createdAt?: string; id: string }): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ca = a.createdAt ?? '';
  const cb = b.createdAt ?? '';
  if (ca !== cb) return ca < cb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Excluded expenses are not part of a claim. */
export function buildClaimDraft(grant: Grant, trip: Trip, expenses: Expense[], grantDocIds: string[] = []): ClaimDraft {
  const items = [...expenses]
    .filter((e) => !e.excluded)
    .sort(compareItems)
    .map((e): ClaimItem => ({
      id: e.id,
      date: e.date,
      description: e.payee,
      amountMinor: e.inrMinor,
      originalMinor: e.originalMinor,
      originalCurrency: e.originalCurrency,
      attachmentIds: e.attachments.map((a) => a.id),
      paymentMode: e.paymentMode,
      inrStatus: e.inrStatus,
      ...(e.categoryId && { categoryId: e.categoryId }),
      ...(e.reference && { reference: e.reference }),
      ...(e.statementRef && { statementRef: e.statementRef }),
      ...(e.justification && { justification: e.justification }),
      ...(e.estimatedRateMicro !== undefined && { estimatedRateMicro: e.estimatedRateMicro }),
    }));
  return { grant, trip, items, grantDocIds };
}
