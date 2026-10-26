import { describe, expect, it } from 'vitest';
import { canBeMatched, pairFields, proposeMatches, statementRefOf, unlinkFields } from '../../src/shared/reconcile.ts';
import type { StatementRow } from '../../src/shared/statement-map.ts';
import type { Expense } from '../../src/shared/types.ts';

let n = 0;
const expense = (extra: Partial<Expense> = {}): Expense => ({
  id: `e${++n}`, tripId: 't', date: '2026-11-11', payee: 'Shop', originalMinor: 120_000, originalCurrency: 'INR', inrMinor: 120_000, inrStatus: 'pending',
  paymentMode: 'bank', source: 'manual', attachments: [], excluded: false, createdAt: `2026-11-11T10:00:${String(n).padStart(2, '0')}Z`, updatedAt: 'x', ...extra,
});
let line = 10;
const row = (date: string, debitMinor: number, extra: Partial<StatementRow> = {}): StatementRow => ({
  line: ++line, date, narration: `ROW ${line}`, debitMinor, rowHash: `h${line}`, ...extra,
});
const eur = (extra: Partial<Expense> = {}) => expense({ originalCurrency: 'EUR', originalMinor: 8900, inrMinor: 845_500, estimatedRateMicro: 95_000_000, ...extra });

describe('REQ-CSV-08: proposing pairs', () => {
  it('REQ-CSV-08: an INR expense of ₹1,200.00 on 11 Nov and debits of ₹1,200.00 on 12 Nov and 20 Nov: only the 12 Nov row is proposed', () => {
    const e = expense();
    const near = row('2026-11-12', 120_000);
    const far = row('2026-11-20', 120_000);
    const m = proposeMatches([e], [far, near]);
    expect(m.automatic).toEqual([{ expenseId: e.id, row: near, reason: 'same amount, 1 day apart' }]);
    expect(m.unpaired).toEqual([]);
  });

  it('REQ-CSV-08: the window is ±2 days (3 days apart is not proposed) and the amount must be exactly equal', () => {
    const e = expense({ date: '2026-11-11' });
    expect(proposeMatches([e], [row('2026-11-09', 120_000)]).automatic).toHaveLength(1); // 2 days before
    expect(proposeMatches([e], [row('2026-11-13', 120_000)]).automatic).toHaveLength(1); // 2 days after
    expect(proposeMatches([e], [row('2026-11-14', 120_000)]).automatic).toHaveLength(0);
    expect(proposeMatches([e], [row('2026-11-11', 120_001)]).automatic).toHaveLength(0);
    expect(proposeMatches([e], [row('2026-11-11', 120_000)]).automatic[0]!.reason).toBe('same amount, the same day');
  });

  it('REQ-CSV-08: two expenses with the same amount and date and one matching row give exactly one pair, the older expense', () => {
    const first = expense();
    const second = expense();
    const r = row('2026-11-11', 120_000);
    const m = proposeMatches([second, first], [r]);
    expect(m.automatic).toHaveLength(1);
    expect(m.automatic[0]!.expenseId).toBe(first.id);
    expect(m.unpaired.map((x) => x.id)).toEqual([second.id]);
  });

  it('REQ-CSV-08: pairs are decided together: the closest date wins, not whoever is checked first', () => {
    const early = expense({ date: '2026-11-10', createdAt: 'a' });
    const late = expense({ date: '2026-11-12', createdAt: 'b' });
    const r = row('2026-11-12', 120_000); // the same day as `late`, two days from `early`
    const m = proposeMatches([early, late], [r]);
    expect(m.automatic.map((p) => p.expenseId)).toEqual([late.id]);
  });

  it('REQ-CSV-08: every expense gets its own row when there are enough, and the same input always gives the same pairs', () => {
    const a = expense();
    const b = expense();
    const rows = [row('2026-11-11', 120_000), row('2026-11-12', 120_000)];
    const first = proposeMatches([a, b], rows);
    expect(first.automatic).toHaveLength(2);
    expect(new Set(first.automatic.map((p) => p.row.rowHash)).size).toBe(2);
    expect(proposeMatches([b, a], [...rows].reverse())).toEqual(first);
  });

  it('REQ-CSV-08: a €89.00 expense estimated at ₹8,455.00 is offered a ₹8,612.34 debit inside the window, never automatically', () => {
    const e = eur({ date: '2026-11-12' });
    const debit = row('2026-11-14', 861_234);
    const m = proposeMatches([e], [debit]);
    expect(m.automatic).toEqual([]);
    expect(m.foreign).toEqual([{ expenseId: e.id, candidates: [{ row: debit, reason: '₹157.34 more than your estimate, 2 days apart' }] }]);
    expect(m.unpaired.map((x) => x.id)).toEqual([e.id]); // still waiting until the user chooses
  });

  it('REQ-CSV-08: a foreign expense only sees debits within ±15% and ±5 days, sorted by closeness, at most five', () => {
    const e = eur({ date: '2026-11-12' });
    const rows = [
      row('2026-11-12', 845_500), // exact
      row('2026-11-13', 900_000), // +6.4%
      row('2026-11-12', 960_000), // +13.5%
      row('2026-11-12', 1_000_000), // +18%: outside the band
      row('2026-11-20', 845_500), // 8 days: outside
      row('2026-11-12', 800_000), row('2026-11-12', 850_000), row('2026-11-12', 830_000), row('2026-11-12', 870_000),
    ];
    const [choice] = proposeMatches([e], rows).foreign;
    expect(choice!.candidates).toHaveLength(5);
    expect(choice!.candidates[0]!.row.debitMinor).toBe(845_500);
    expect(choice!.candidates[0]!.reason).toBe('exactly your estimate, the same day');
    const amounts = choice!.candidates.map((c) => Math.abs(c.row.debitMinor - 845_500));
    expect([...amounts].sort((x, y) => x - y)).toEqual(amounts);
    expect(choice!.candidates.some((c) => c.row.debitMinor === 1_000_000)).toBe(false);
  });

  it('REQ-CSV-08: a row taken by an INR pair is not offered to a foreign expense', () => {
    const inr = expense({ inrMinor: 845_500, originalMinor: 845_500 });
    const shared = row('2026-11-11', 845_500);
    const m = proposeMatches([inr, eur()], [shared]);
    expect(m.automatic).toHaveLength(1);
    expect(m.foreign).toEqual([]);
  });

  it('REQ-CSV-08: cash, excluded and already-confirmed expenses are never matched; rows already used elsewhere are skipped', () => {
    const r = row('2026-11-11', 120_000);
    expect(proposeMatches([expense({ paymentMode: 'cash' }), expense({ excluded: true }), expense({ inrStatus: 'confirmed' })], [r])).toEqual({ automatic: [], foreign: [], unpaired: [] });
    expect(canBeMatched(expense())).toBe(true);
    expect(proposeMatches([expense()], [r], new Set([r.rowHash])).automatic).toEqual([]);
  });

  it('REQ-CSV-08: unmatched expenses and unmatched rows both stay visible: an expense with no debit is listed as unpaired', () => {
    const lonely = expense({ date: '2026-11-11', inrMinor: 777_700, originalMinor: 777_700 });
    expect(proposeMatches([lonely], [row('2026-11-11', 1)]).unpaired.map((e) => e.id)).toEqual([lonely.id]);
  });
});

describe('REQ-CSV-08: pairing and unlinking', () => {
  it('REQ-CSV-08: pairing sets the statement amount, confirms the expense, and keeps only the statement fields it may keep', () => {
    const r = row('2026-11-14', 861_234, { narration: 'POS LISBON', refNo: 'R109' });
    expect(pairFields(r)).toEqual({
      inrMinor: 861_234, inrStatus: 'confirmed',
      statementRef: { date: '2026-11-14', narration: 'POS LISBON', debitMinor: 861_234, refNo: 'R109', rowHash: r.rowHash },
    });
    expect(Object.keys(statementRefOf(row('2026-11-14', 1))).sort()).toEqual(['date', 'debitMinor', 'narration', 'rowHash']);
  });

  it('REQ-CSV-08: the balance moves by the difference when a foreign estimate becomes the real debit (₹8,455.00 → ₹8,612.34 is +₹157.34)', () => {
    expect(pairFields(row('2026-11-14', 861_234)).inrMinor - eur().inrMinor).toBe(15_734);
  });

  it('REQ-CSV-08: unlinking returns an INR expense to what was typed and a foreign one to its estimate, pending again', () => {
    expect(unlinkFields(expense({ originalMinor: 120_000, inrMinor: 120_050, inrStatus: 'confirmed' }))).toEqual({ inrMinor: 120_000, inrStatus: 'pending' });
    expect(unlinkFields(eur({ inrMinor: 861_234, inrStatus: 'confirmed' }))).toEqual({ inrMinor: 845_500, inrStatus: 'pending' });
  });

  it('REQ-CSV-08: unlinking a foreign expense that has no rate keeps its amount rather than inventing one', () => {
    expect(unlinkFields(eur({ inrMinor: 861_234, inrStatus: 'confirmed', estimatedRateMicro: undefined as unknown as number }))).toEqual({ inrMinor: 861_234, inrStatus: 'pending' });
  });
});
