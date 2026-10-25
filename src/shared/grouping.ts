// REQ-CAP-06: group a trip's expenses by day, filter them, and total them.
import type { CategoryId, Expense } from './types.ts';

export interface ExpenseFilters {
  categoryId?: CategoryId | 'none';
  status?: 'pending' | 'confirmed';
}
export interface DayGroup<E> {
  date: string;
  expenses: E[];
  /** Sum of non-excluded expenses that day. */
  totalMinor: number;
}
type Row = Pick<Expense, 'date' | 'inrMinor' | 'inrStatus' | 'excluded' | 'categoryId' | 'createdAt'>;

export function applyFilters<E extends Row>(expenses: E[], f: ExpenseFilters): E[] {
  return expenses.filter((e) => {
    if (f.categoryId === 'none' ? e.categoryId !== undefined : f.categoryId && e.categoryId !== f.categoryId) return false;
    if (f.status && e.inrStatus !== f.status) return false;
    return true;
  });
}

/** Newest day first; within a day, newest entry first. */
export function groupByDay<E extends Row>(expenses: E[]): DayGroup<E>[] {
  const byDay = new Map<string, E[]>();
  for (const e of expenses) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, list]) => ({
      date,
      expenses: [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      totalMinor: list.reduce((sum, e) => sum + (e.excluded ? 0 : e.inrMinor), 0),
    }));
}

/** Whole-trip totals; never affected by filters. */
export function tripTotals(expenses: Pick<Expense, 'inrMinor' | 'inrStatus' | 'excluded'>[]) {
  let confirmedMinor = 0;
  let pendingMinor = 0;
  for (const e of expenses) {
    if (e.excluded) continue;
    if (e.inrStatus === 'confirmed') confirmedMinor += e.inrMinor;
    else pendingMinor += e.inrMinor;
  }
  return { totalMinor: confirmedMinor + pendingMinor, confirmedMinor, pendingMinor };
}
