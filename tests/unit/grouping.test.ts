import { describe, expect, it } from 'vitest';
import { applyFilters, groupByDay, tripTotals } from '../../src/shared/grouping.ts';
import type { CategoryId } from '../../src/shared/types.ts';

let n = 0;
const e = (date: string, inrMinor: number, extra: Partial<{ categoryId: CategoryId; inrStatus: 'pending' | 'confirmed'; excluded: boolean }> = {}) => ({
  date, inrMinor, inrStatus: 'pending' as const, excluded: false, createdAt: `2026-11-20T10:00:${String(n++).padStart(2, '0')}Z`, ...extra,
});

describe('REQ-CAP-06: expense list grouping and filters', () => {
  const list = [
    e('2026-11-10', 100_000, { categoryId: 'meals' }),
    e('2026-11-12', 250_000, { categoryId: 'airfare', inrStatus: 'confirmed' }),
    e('2026-11-12', 50_000),
    e('2026-11-12', 70_000, { excluded: true, categoryId: 'meals' }),
  ];

  it('REQ-CAP-06: groups by day, newest day first, with a day total that skips excluded items', () => {
    const groups = groupByDay(list);
    expect(groups.map((g) => g.date)).toEqual(['2026-11-12', '2026-11-10']);
    expect(groups[0]!.totalMinor).toBe(300_000);
    expect(groups[0]!.expenses).toHaveLength(3);
    expect(groups[1]!.totalMinor).toBe(100_000);
  });

  it('REQ-CAP-06: within a day the newest entry comes first', () => {
    const [first] = groupByDay(list)[0]!.expenses;
    expect(first!.inrMinor).toBe(70_000);
  });

  it('REQ-CAP-06: filters by category (including "none") and by status', () => {
    expect(applyFilters(list, { categoryId: 'meals' })).toHaveLength(2);
    expect(applyFilters(list, { categoryId: 'none' })).toHaveLength(1);
    expect(applyFilters(list, { status: 'confirmed' })).toHaveLength(1);
    expect(applyFilters(list, { categoryId: 'meals', status: 'pending' })).toHaveLength(2);
    expect(applyFilters(list, {})).toHaveLength(4);
  });

  it('REQ-CAP-06: trip totals cover the whole trip and are not changed by filters', () => {
    const totals = tripTotals(list);
    expect(totals).toEqual({ totalMinor: 400_000, confirmedMinor: 250_000, pendingMinor: 150_000 });
    expect(tripTotals(applyFilters(list, { status: 'confirmed' })).totalMinor).toBe(250_000); // filtered view differs...
    expect(tripTotals(list)).toEqual(totals); // ...but totals computed from the full list stay the same
  });
});

describe('REQ-CAP-06: flagged-only filter', () => {
  it('REQ-CAP-06: "flagged only" keeps just the expenses that have a flag', () => {
    const rows = [{ ...e('2026-11-10', 100), id: 'a' }, { ...e('2026-11-11', 200), id: 'b' }, { ...e('2026-11-12', 300), id: 'c' }];
    expect(applyFilters(rows, { flaggedOnly: true }, new Set(['b'])).map((r) => r.id)).toEqual(['b']);
    expect(applyFilters(rows, { flaggedOnly: true }).length).toBe(0);
    expect(applyFilters(rows, {}, new Set(['b'])).length).toBe(3);
  });
});
