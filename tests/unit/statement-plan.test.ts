import { describe, expect, it } from 'vitest';
import { applyPlan, draftId, emptyPlan, planCounts, validatePlan, type Plan } from '../../src/shared/statement-plan.ts';
import { proposeMatches } from '../../src/shared/reconcile.ts';
import type { StatementRow } from '../../src/shared/statement-map.ts';
import type { Expense } from '../../src/shared/types.ts';

const row = (hash: string, date: string, debitMinor: number, narration = `NARR ${hash}`): StatementRow => ({ line: 1, date, narration, debitMinor, rowHash: hash });
const expense = (id: string, over: Partial<Expense> = {}): Expense => ({
  id, tripId: 't', date: '2026-11-09', payee: `Payee ${id}`, originalMinor: 185_000, originalCurrency: 'INR', inrMinor: 185_000, inrStatus: 'pending', paymentMode: 'bank',
  source: 'proof', attachments: [], excluded: false, createdAt: `2026-11-09T00:00:0${id}Z`, updatedAt: '', ...over,
});
const saved = (id: string, r: StatementRow, over: Partial<Expense> = {}): Expense =>
  expense(id, { inrStatus: 'confirmed', inrMinor: r.debitMinor, statementRef: { date: r.date, narration: r.narration, debitMinor: r.debitMinor, rowHash: r.rowHash }, ...over });
const plan = (p: Partial<Plan>): Plan => ({ ...emptyPlan(), ...p });

describe('REQ-CSV-12: what the trip looks like once the draft is saved', () => {
  it('REQ-CSV-12: an empty draft changes nothing', () => {
    const e = [expense('1')];
    expect(applyPlan(e, emptyPlan(), 't')).toEqual(e);
    expect(planCounts(emptyPlan()).total).toBe(0);
  });

  it('REQ-CSV-12: a drafted match takes the bank amount and counts as confirmed, without touching the saved expense', () => {
    const e = expense('1');
    const r = row('r1', '2026-11-10', 185_500);
    const [after] = applyPlan([e], plan({ links: { '1': r } }), 't');
    expect(after).toMatchObject({ inrStatus: 'confirmed', inrMinor: 185_500, statementRef: { rowHash: 'r1' } });
    expect(e.inrStatus).toBe('pending');
  });

  it('REQ-CSV-12: taking back a saved match drafts it as pending again at the typed amount; taking back a drafted match is just not drafting it', () => {
    const r = row('r1', '2026-11-10', 185_500);
    const e = saved('1', r, { originalMinor: 185_000 });
    const [after] = applyPlan([e], plan({ unlinks: ['1'] }), 't');
    expect(after).toMatchObject({ inrStatus: 'pending', inrMinor: 185_000 });
    expect(after!.statementRef).toBeUndefined();
  });

  it('REQ-CSV-12: unlinking a saved match and linking the same expense to another debit in one draft gives the new debit', () => {
    const a = row('r1', '2026-11-10', 185_000);
    const b = row('r2', '2026-11-11', 185_000);
    const [after] = applyPlan([saved('1', a)], plan({ unlinks: ['1'], links: { '1': b } }), 't');
    expect(after!.statementRef!.rowHash).toBe('r2');
    expect(validatePlan([saved('1', a)], plan({ unlinks: ['1'], links: { '1': b } }))).toEqual([]);
  });

  it('REQ-CSV-12: drafted additions appear as confirmed statement expenses with the bank wording, and removals disappear', () => {
    const r = row('r5', '2026-11-12', 24_500_00, 'POS HOTEL SAMPLE');
    const stmtExpense = saved('9', row('r9', '2026-11-13', 500_00), { source: 'statement' });
    const result = applyPlan([stmtExpense], plan({ adds: { r5: { row: r, categoryId: 'accommodation' } }, removes: ['9'] }), 't');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: draftId('r5'), payee: 'POS HOTEL SAMPLE', source: 'statement', inrStatus: 'confirmed', categoryId: 'accommodation' });
  });

  it('REQ-CSV-12: the order of work does not matter: adding a debit first leaves the expense honestly unmatched, and removing the addition brings the proposal back', () => {
    const tracked = expense('1');
    const r = row('r1', '2026-11-10', 185_000);
    const proposal = (p: Plan) => proposeMatches(applyPlan([tracked], p, 't'), [r], new Set(applyPlan([tracked], p, 't').flatMap((e) => (e.statementRef ? [e.statementRef.rowHash] : [])))).automatic;
    expect(proposal(emptyPlan())).toHaveLength(1);
    expect(proposal(plan({ adds: { r1: { row: r } } }))).toHaveLength(0); // the debit is taken by the drafted addition
    expect(proposal(emptyPlan())).toHaveLength(1); // taken back
    expect(proposal(plan({ links: { '1': r } }))).toHaveLength(0); // answered
  });

  it('REQ-CSV-12: counts each kind of change', () => {
    const r = row('r1', '2026-11-10', 100);
    expect(planCounts(plan({ links: { a: r, b: r }, unlinks: ['c'], adds: { r1: { row: r } }, removes: ['d', 'e', 'f'] }))).toEqual({ matches: 2, adds: 1, unlinks: 1, removes: 3, total: 7 });
  });
});

describe('REQ-CSV-12: checking that a draft can be saved', () => {
  const r1 = row('r1', '2026-11-10', 185_000);
  it('REQ-CSV-12: a sound draft has no problems', () => {
    expect(validatePlan([expense('1')], plan({ links: { '1': r1 }, adds: { r2: { row: row('r2', '2026-11-11', 5) } } }))).toEqual([]);
  });
  it('REQ-CSV-12: a debit already used by another expense of the grant cannot be linked or added', () => {
    const taken = saved('2', r1);
    expect(validatePlan([expense('1'), taken], plan({ links: { '1': r1 } }))[0]).toMatch(/already used/);
    expect(validatePlan([taken], plan({ adds: { r1: { row: r1 } } }))[0]).toMatch(/already used/);
  });
  it('REQ-CSV-12: the same debit chosen twice in one draft is refused', () => {
    expect(validatePlan([expense('1'), expense('2')], plan({ links: { '1': r1, '2': r1 } }))[0]).toMatch(/chosen twice/);
    expect(validatePlan([expense('1')], plan({ links: { '1': r1 }, adds: { r1: { row: r1 } } }))[0]).toMatch(/chosen twice/);
  });
  it('REQ-CSV-12: an expense that is cash, excluded, already matched or gone cannot be matched', () => {
    for (const e of [expense('1', { paymentMode: 'cash' }), expense('1', { excluded: true }), saved('1', row('rx', '2026-11-10', 1))]) {
      expect(validatePlan([e], plan({ links: { '1': r1 } })).length, e.payee).toBeGreaterThan(0);
    }
    expect(validatePlan([], plan({ links: { '1': r1 } }))[0]).toMatch(/no longer exists/);
  });
  it('REQ-CSV-12: only statement-made expenses can be removed here, and only saved matches can be taken back', () => {
    expect(validatePlan([expense('1')], plan({ removes: ['1'] }))[0]).toMatch(/did not come from the statement/);
    expect(validatePlan([expense('1')], plan({ unlinks: ['1'] }))[0]).toMatch(/no longer there/);
  });
  it('REQ-CSV-12: removing an expense frees its debit for another one in the same draft', () => {
    const owner = saved('9', r1, { source: 'statement' });
    expect(validatePlan([owner, expense('1')], plan({ removes: ['9'], links: { '1': r1 } }))).toEqual([]);
  });
});
