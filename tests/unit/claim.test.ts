import { describe, expect, it } from 'vitest';
import { sampleView } from '../../src/server/claims/sample.ts';
import {
  blockingItems, buildClaimPayload, categoryTotals, claimPayloadSchema, DECLARATION_TEXT, isTokenShape, outcomeOf, reviewTotals, type PreparedFile,
} from '../../src/shared/claim.ts';
import { buildClaimDraft } from '../../src/shared/claim-draft.ts';
import { evaluateTrip } from '../../src/shared/rules/evaluate-trip.ts';
import type { Expense, Grant, Trip } from '../../src/shared/types.ts';

const grant: Grant = {
  id: 'g', name: 'DST Grant', sponsor: 'Agency', currency: 'INR', totalMinor: 10_000_000, utilisedBeforeMinor: 2_000_000, startDate: '2026-04-01', endDate: '2027-03-31',
  rules: { travelBufferDays: 2, categories: Object.fromEntries(['registration', 'airfare', 'rail_bus', 'local_transport', 'accommodation', 'meals', 'visa_insurance', 'other'].map((c) => [c, { eligible: true, requiresProof: false }])) as Grant['rules']['categories'] },
  createdAt: '', updatedAt: '',
};
const trip: Trip = { id: 't', grantId: 'g', name: 'SampleConf', city: 'Lisbon', country: 'Portugal', startDate: '2026-11-10', endDate: '2026-11-14', createdAt: '', updatedAt: '' };
const expense = (id: string, over: Partial<Expense> = {}): Expense => ({
  id, tripId: 't', date: '2026-11-11', payee: `Payee ${id}`, categoryId: 'meals', originalMinor: 50_000, originalCurrency: 'INR', inrMinor: 50_000, inrStatus: 'confirmed', paymentMode: 'bank',
  statementRef: { date: '2026-11-11', narration: `NARR ${id}`, debitMinor: 50_000, refNo: `R${id}`, rowHash: `h${id}` },
  source: 'manual', attachments: [], excluded: false, createdAt: `2026-11-11T00:00:0${id}Z`, updatedAt: '', ...over,
});
const file = (id: string): PreparedFile => ({ meta: { id, name: `${id}.jpg`, mime: 'image/jpeg', kind: 'proof', proofType: 'invoice' }, bytes: new Blob(['x']) });

function build(expenses: Expense[], files: PreparedFile[] = [], skipped: string[] = [], others: Expense[] = []) {
  const draft = buildClaimDraft(grant, trip, expenses);
  const { flags } = evaluateTrip(grant, trip, [...expenses, ...others]);
  return buildClaimPayload({
    draft, flags, grantExpenses: [...expenses, ...others], claimant: { name: ' Asha ', email: 'asha@example.org ', employeeId: ' ' }, idempotencyKey: 'key-0123456789abcdef', preparedAt: '2026-11-16T10:00:00Z', files, skippedAttachmentIds: skipped,
  });
}

describe('REQ-CLM-01, REQ-CLM-08: building the claim', () => {
  it('REQ-CLM-08: each item carries the statement debit as its amount and the statement fields only', () => {
    const p = build([expense('1', { originalMinor: 8_900, originalCurrency: 'EUR', inrMinor: 861_234, statementRef: { date: '2026-11-12', narration: 'POS FX', debitMinor: 861_234, rowHash: 'x' } })]);
    expect(p.items[0]).toMatchObject({ amountMinor: 861_234, originalMinor: 8_900, originalCurrency: 'EUR', statementRef: { debitMinor: 861_234 } });
    expect(Object.keys(p.items[0]!.statementRef!).sort()).toEqual(['date', 'debitMinor', 'narration', 'rowHash']);
  });

  it('REQ-CLM-01: excluded expenses are absent, items are in date order, and totals add up to the claim total', () => {
    const p = build([expense('3', { date: '2026-11-13' }), expense('1', { date: '2026-11-11' }), expense('2', { excluded: true })]);
    expect(p.items.map((i) => i.id)).toEqual(['1', '3']);
    expect(p.position.thisClaimMinor).toBe(100_000);
    expect(categoryTotals(p.items).reduce((s, c) => s + c.totalMinor, 0)).toBe(p.position.thisClaimMinor);
  });

  it('REQ-CLM-01: the grant position counts other trips and what was used before, and what is left follows', () => {
    const other = expense('9', { tripId: 'other', inrMinor: 300_000 });
    const p = build([expense('1')], [], [], [other]);
    expect(p.position).toEqual({ sanctionedMinor: 10_000_000, usedBeforeMinor: 2_000_000, otherTripsMinor: 300_000, thisClaimMinor: 50_000, leftMinor: 7_650_000 });
  });

  it('REQ-CLM-03: name and email are trimmed; a blank employee ID is left out', () => {
    const p = build([expense('1')]);
    expect(p.claimant).toEqual({ name: 'Asha', email: 'asha@example.org' });
    expect(p.declaration).toBe(DECLARATION_TEXT);
  });

  it('REQ-CLM-04: only files that could be sent are listed on an item; skipped ones are counted for the reviewer', () => {
    const e = expense('1', { attachments: [{ id: 'a1', kind: 'proof', mime: 'image/jpeg', name: 'a.jpg', sizeBytes: 1, sha256: 's', blobKey: 'k' }, { id: 'a2', kind: 'proof', mime: 'application/pdf', name: 'big.pdf', sizeBytes: 2_000_000, sha256: 's', blobKey: 'k' }] });
    const p = build([e], [file('a1')], ['a2']);
    expect(p.items[0]).toMatchObject({ fileIds: ['a1'], missingProofs: 1 });
    expect(p.files.map((f) => f.id)).toEqual(['a1']);
    expect(claimPayloadSchema.safeParse(p).success).toBe(true);
  });

  it('REQ-CLM-04: a built claim passes the same check the server makes, and the sample claim does too', () => {
    expect(claimPayloadSchema.safeParse(build([expense('1'), expense('2')])).success).toBe(true);
    expect(claimPayloadSchema.safeParse(sampleView().payload).success).toBe(true);
  });

  it('REQ-RULE-09, REQ-CLM-04: an unmatched bank item is listed as blocking and the server check refuses it', () => {
    const e = expense('1', { inrStatus: 'pending' });
    delete e.statementRef;
    const p = build([e]);
    const draft = buildClaimDraft(grant, trip, [e]);
    const { flags } = evaluateTrip(grant, trip, [e]);
    expect(blockingItems(draft, flags).map((b) => b.itemId)).toEqual(['1']);
    expect(claimPayloadSchema.safeParse(p).success).toBe(false);
  });

  it('REQ-CLM-01: category totals use the category order and put "No category" last', () => {
    const t = categoryTotals([{ categoryId: 'meals', amountMinor: 100 }, { amountMinor: 50 }, { categoryId: 'airfare', amountMinor: 200 }, { categoryId: 'meals', amountMinor: 1 }]);
    expect(t.map((c) => [c.label, c.count, c.totalMinor])).toEqual([['Airfare', 1, 200], ['Meals', 2, 101], ['No category', 1, 50]]);
  });
});

describe('REQ-REV-02, REQ-REV-03, REQ-REV-05: review maths', () => {
  const ids = ['a', 'b', 'c'];
  it.each([
    [['approve', 'approve', 'approve'], 'approved'],
    [['reject', 'reject', 'reject'], 'rejected'],
    [['approve', 'reject', 'approve'], 'partially_approved'],
  ] as const)('REQ-REV-03: %j gives %s', (decisions, status) => {
    expect(outcomeOf(ids, ids.map((itemId, n) => ({ itemId, decision: decisions[n]! })))).toEqual({ ok: true, status });
  });
  it('REQ-REV-03: a query or a missing decision stops the finish and names the items', () => {
    expect(outcomeOf(ids, [{ itemId: 'a', decision: 'approve' }, { itemId: 'b', decision: 'query' }])).toEqual({ ok: false, undecided: ['b', 'c'] });
  });
  it('REQ-REV-05: approved, rejected and open totals add up to the claim total after every choice', () => {
    const items = [{ id: 'a', amountMinor: 100 }, { id: 'b', amountMinor: 250 }, { id: 'c', amountMinor: 7 }];
    expect(reviewTotals(items, [{ itemId: 'a', decision: 'approve' }, { itemId: 'b', decision: 'query' }])).toEqual({ approvedMinor: 100, rejectedMinor: 0, openMinor: 257 });
    expect(reviewTotals(items, [{ itemId: 'a', decision: 'approve' }, { itemId: 'b', decision: 'reject' }, { itemId: 'c', decision: 'reject' }])).toEqual({ approvedMinor: 100, rejectedMinor: 257, openMinor: 0 });
  });
});

describe('REQ-REV-07: link tokens', () => {
  it('REQ-REV-07: only 43 URL-safe characters (256 bits) or the sample word are link-shaped', () => {
    expect(isTokenShape('A'.repeat(43))).toBe(true);
    expect(isTokenShape('sample')).toBe(true);
    for (const bad of ['', 'A'.repeat(42), 'A'.repeat(44), `${'A'.repeat(42)}=`, `${'A'.repeat(42)}/`, '../..', 'Sample']) expect(isTokenShape(bad), bad).toBe(false);
  });
});
