import { describe, expect, it } from 'vitest';
import { buildClaimDraft, compareItems } from '../../src/shared/claim-draft.ts';
import { defaultRules } from '../../src/shared/grant.ts';
import { evaluate, flagsByItem, hasBlockingFlags, RULE_LABELS } from '../../src/shared/rules/evaluate.ts';
import type { CategoryId, ClaimDraft, ClaimItem, Expense, Grant, GrantRules, Trip } from '../../src/shared/types.ts';

const rules = (patch: (r: GrantRules) => void = () => undefined): GrantRules => {
  const r = defaultRules();
  patch(r);
  return r;
};
const grant = (extra: Partial<Grant> = {}): Grant => ({
  id: 'g', name: 'G', sponsor: '', currency: 'INR', totalMinor: 10_000_000, utilisedBeforeMinor: 2_000_000, startDate: '2026-04-01', endDate: '2027-03-31',
  rules: rules(), createdAt: 'x', updatedAt: 'x', ...extra,
});
const trip: Trip = { id: 't', grantId: 'g', name: 'T', city: 'C', country: 'X', startDate: '2026-11-10', endDate: '2026-11-14', createdAt: 'x', updatedAt: 'x' };

let n = 0;
/** A clean item: confirmed, bank-paid, categorised, with a proof, inside the trip dates. */
const item = (extra: Partial<ClaimItem> = {}): ClaimItem => ({
  id: `i${++n}`, date: '2026-11-12', description: 'Shop', amountMinor: 100_000, originalMinor: 100_000, originalCurrency: 'INR', categoryId: 'meals',
  attachmentIds: ['a'], paymentMode: 'bank', inrStatus: 'confirmed', ...extra,
});
const draft = (items: ClaimItem[], g: Grant = grant()): ClaimDraft => ({ grant: g, trip, items, grantDocIds: [] });
const run = (items: ClaimItem[], g: Grant = grant(), otherSpendMinor = 0) => evaluate(draft(items, g), { otherSpendMinor });
const ids = (flags: ReturnType<typeof run>) => flags.map((f) => `${f.itemId}:${f.ruleId}`);

describe('REQ-RULE-01: evaluate() is pure and deterministic', () => {
  it('REQ-RULE-01: a clean draft gives no flags', () => {
    expect(run([item(), item({ categoryId: 'airfare' })])).toEqual([]);
  });

  it('REQ-RULE-01: the same input twice gives equal lists in the same order, and the draft is not changed', () => {
    const d = draft([item({ categoryId: undefined }), item({ attachmentIds: [] }), item({ inrStatus: 'pending' })]);
    const before = structuredClone(d);
    const first = evaluate(d, { otherSpendMinor: 0 });
    expect(evaluate(d, { otherSpendMinor: 0 })).toEqual(first);
    expect(d).toEqual(before);
    expect(first.length).toBeGreaterThan(2);
  });

  it('REQ-RULE-01: flags come out by item order, then by rule order, whatever order the flags were found in', () => {
    const a = item({ id: 'a', date: '2026-11-11', categoryId: undefined, inrStatus: 'pending' }); // UNCATEGORISED + UNVERIFIED
    const b = item({ id: 'b', date: '2026-11-12', attachmentIds: [] }); // MISSING_PROOF
    expect(ids(run([a, b]))).toEqual(['a:UNCATEGORISED', 'a:UNVERIFIED_AMOUNT', 'b:MISSING_PROOF']);
  });

  it('REQ-RULE-01: buildClaimDraft orders items by date then creation, leaves out excluded expenses, and carries what the rules read', () => {
    const e = (id: string, date: string, createdAt: string, extra: Partial<Expense> = {}): Expense => ({
      id, tripId: 't', date, payee: id, originalMinor: 100, originalCurrency: 'INR', inrMinor: 100, inrStatus: 'pending', paymentMode: 'bank',
      source: 'manual', attachments: [], excluded: false, createdAt, updatedAt: createdAt, ...extra,
    });
    const built = buildClaimDraft(grant(), trip, [
      e('late', '2026-11-13', '1'), e('second', '2026-11-12', '2'), e('first', '2026-11-12', '1', { categoryId: 'meals', justification: 'why', reference: 'R' }), e('gone', '2026-11-11', '0', { excluded: true }),
    ]);
    expect(built.items.map((i) => i.id)).toEqual(['first', 'second', 'late']);
    expect(built.items[0]).toMatchObject({ categoryId: 'meals', justification: 'why', reference: 'R', description: 'first', amountMinor: 100, paymentMode: 'bank', inrStatus: 'pending' });
    expect(compareItems({ date: '2026-01-01', id: 'a' }, { date: '2026-01-01', id: 'b' })).toBe(-1);
  });
});

describe('REQ-RULE-03: OVER_CATEGORY_CAP', () => {
  const capped = grant({ rules: rules((r) => { r.categories.local_transport.capPerTripMinor = 300_000; }) });
  const cab = (amountMinor: number) => item({ categoryId: 'local_transport', amountMinor });

  it('REQ-RULE-03: only the item that crosses the cap is flagged, saying how far over', () => {
    const [a, b, c] = [cab(100_000), cab(150_000), cab(100_000)];
    const flags = run([a, b, c], capped);
    expect(ids(flags)).toEqual([`${c.id}:OVER_CATEGORY_CAP`]);
    expect(flags[0]!.severity).toBe('warn');
    expect(flags[0]!.message).toBe('Local transport is ₹500.00 over its cap of ₹3,000.00 for this trip.');
  });

  it('REQ-RULE-03: a total of exactly the cap is fine, and a category without a cap is never flagged', () => {
    expect(run([cab(100_000), cab(200_000)], capped)).toEqual([]);
    expect(run([item({ amountMinor: 9_000_000 })], capped.rules && grant({ totalMinor: 99_000_000 }))).toEqual([]);
  });

  it('REQ-RULE-03: two categories over their caps each get their own flag', () => {
    const g = grant({ rules: rules((r) => { r.categories.local_transport.capPerTripMinor = 100; r.categories.meals.capPerTripMinor = 100; }) });
    const flags = run([item({ categoryId: 'local_transport', amountMinor: 200 }), item({ categoryId: 'meals', amountMinor: 200 })], g);
    expect(flags.map((f) => f.ruleId)).toEqual(['OVER_CATEGORY_CAP', 'OVER_CATEGORY_CAP']);
  });

  it('REQ-RULE-03: pending and confirmed amounts both count', () => {
    const flags = run([cab(200_000), { ...cab(200_000), inrStatus: 'pending' }], capped);
    expect(flags.some((f) => f.ruleId === 'OVER_CATEGORY_CAP')).toBe(true);
  });
});

describe('REQ-RULE-04: OVER_GRANT_BALANCE', () => {
  it('REQ-RULE-04: with ₹50,000 available only the third item (running ₹55,000) is flagged, as an error, ₹5,000 over', () => {
    const g = grant({ totalMinor: 10_000_000, utilisedBeforeMinor: 2_000_000 }); // ₹80,000 after the utilised part; other trips ₹30,000 → ₹50,000
    const [a, b, c] = [item({ amountMinor: 2_000_000 }), item({ amountMinor: 2_500_000 }), item({ amountMinor: 1_000_000 })];
    const flags = run([a, b, c], g, 3_000_000);
    expect(ids(flags)).toEqual([`${c.id}:OVER_GRANT_BALANCE`]);
    expect(flags[0]!.severity).toBe('error');
    expect(flags[0]!.message).toContain('₹5,000.00 over');
    expect(flags[0]!.message).toContain('₹50,000.00 available');
  });

  it('REQ-RULE-04: a claim exactly equal to what is available is fine', () => {
    expect(run([item({ amountMinor: 5_000_000 })], grant(), 3_000_000)).toEqual([]);
  });

  it('REQ-RULE-04: a grant that is already overspent flags the first item, once', () => {
    const flags = run([item({ amountMinor: 100 }), item({ amountMinor: 100 })], grant(), 9_000_000);
    expect(flags.filter((f) => f.ruleId === 'OVER_GRANT_BALANCE')).toHaveLength(1);
    expect(flags.find((f) => f.ruleId === 'OVER_GRANT_BALANCE')!.message).toContain('₹0.00 available');
  });
});

describe('REQ-RULE-05, REQ-RULE-06, REQ-RULE-12: category rules', () => {
  it('REQ-RULE-05: every item in a category marked not eligible gets an error naming it; other categories and uncategorised items do not', () => {
    const g = grant({ rules: rules((r) => { r.categories.meals.eligible = false; }) });
    const meals = [item({ categoryId: 'meals' }), item({ categoryId: 'meals' })];
    const flags = run([...meals, item({ categoryId: 'airfare' })], g);
    expect(ids(flags)).toEqual(meals.map((m) => `${m.id}:CATEGORY_NOT_ELIGIBLE`));
    expect(flags[0]!).toMatchObject({ severity: 'error', message: 'Meals is not an eligible category for this grant.' });
  });

  it('REQ-RULE-06: a category that requires proof warns without an attachment and is quiet with one or when proof is not required', () => {
    const none = item({ attachmentIds: [] });
    expect(run([none]).map((f) => [f.ruleId, f.severity])).toEqual([['MISSING_PROOF', 'warn']]);
    expect(run([item({ attachmentIds: ['a'] })])).toEqual([]);
    const relaxed = grant({ rules: rules((r) => { r.categories.meals.requiresProof = false; }) });
    expect(run([none], relaxed)).toEqual([]);
  });

  it('REQ-RULE-06: an item with no category is only flagged as uncategorised, not for missing proof', () => {
    expect(run([item({ categoryId: undefined, attachmentIds: [] })]).map((f) => f.ruleId)).toEqual(['UNCATEGORISED']);
  });

  it('REQ-RULE-12: an item with no category is an error asking for one; any category clears it', () => {
    const flags = run([item({ categoryId: undefined }), item({ categoryId: 'other' as CategoryId })]);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ ruleId: 'UNCATEGORISED', severity: 'error', message: 'Choose a category for this expense.' });
  });
});

describe('REQ-RULE-08, REQ-RULE-11, REQ-RULE-13: amounts and payment mode', () => {
  const eur = (extra: Partial<ClaimItem> = {}) => item({ originalCurrency: 'EUR', originalMinor: 8900, inrStatus: 'pending', ...extra });

  it('REQ-RULE-08: a pending foreign amount with no rate is an error; with a rate, or once matched to the statement, it is not', () => {
    expect(run([eur()]).map((f) => f.ruleId)).toContain('FOREIGN_CURRENCY_NO_RATE');
    expect(run([eur({ estimatedRateMicro: 95_000_000 })]).map((f) => f.ruleId)).not.toContain('FOREIGN_CURRENCY_NO_RATE');
    expect(run([eur({ inrStatus: 'confirmed' })]).map((f) => f.ruleId)).not.toContain('FOREIGN_CURRENCY_NO_RATE');
  });

  it('REQ-RULE-11: a pending bank-paid item is an UNVERIFIED_AMOUNT error and blocks; matched to a statement row it is clear', () => {
    const flags = run([item({ inrStatus: 'pending' })]);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ ruleId: 'UNVERIFIED_AMOUNT', severity: 'error' });
    expect(hasBlockingFlags(flags)).toBe(true);
    expect(run([item({ inrStatus: 'confirmed', statementRef: { date: '2026-11-12', narration: 'x', debitMinor: 100_000, rowHash: 'h' } })])).toEqual([]);
  });

  it('REQ-RULE-11: a cash item is not an unverified-amount error (cash has its own rule)', () => {
    const ruleIds = run([item({ paymentMode: 'cash', inrStatus: 'pending' })]).map((f) => f.ruleId);
    expect(ruleIds).not.toContain('UNVERIFIED_AMOUNT');
    expect(ruleIds).toEqual(['CASH_NOT_IN_STATEMENT']);
  });

  it('REQ-RULE-13: a cash item warns that a justification is needed; with one the flag stays and quotes it as justified', () => {
    const [plain] = run([item({ paymentMode: 'cash', inrStatus: 'pending' })]);
    expect(plain).toMatchObject({ severity: 'warn', message: 'Paid in cash, so there is no statement line. Add a justification.' });
    const [justified] = run([item({ paymentMode: 'cash', inrStatus: 'pending', justification: 'Auto-rickshaw, no receipt' })]);
    expect(justified!.message).toBe('Paid in cash, so there is no statement line. Justified: “Auto-rickshaw, no receipt”');
  });
});

describe('REQ-RULE-09: severity and justification', () => {
  it('REQ-RULE-09: only errors block; warnings and a clean draft do not', () => {
    expect(hasBlockingFlags(run([item({ attachmentIds: [] })]))).toBe(false); // a warning
    expect(hasBlockingFlags(run([item({ categoryId: undefined })]))).toBe(true); // an error
    expect(hasBlockingFlags([])).toBe(false);
  });

  it('REQ-RULE-09: a justification never clears a flag: it only explains it', () => {
    const flags = run([item({ inrStatus: 'pending', justification: 'It is fine, honestly' })]);
    expect(flags.map((f) => f.ruleId)).toEqual(['UNVERIFIED_AMOUNT']);
    expect(hasBlockingFlags(flags)).toBe(true);
  });

  it('REQ-RULE-09: flagsByItem groups the list for the screens, and every rule has a short label for its chip', () => {
    const a = item({ categoryId: undefined, attachmentIds: [] });
    const grouped = flagsByItem(run([a, item()]));
    expect(grouped.get(a.id)!.map((f) => f.ruleId)).toEqual(['UNCATEGORISED']);
    for (const f of run([item({ categoryId: undefined }), item({ date: '2026-12-31' }), item({ inrStatus: 'pending' })])) expect(RULE_LABELS[f.ruleId]).toBeTruthy();
  });
});
