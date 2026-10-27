// REQ-CSV-12: the statement screen's choices are a draft ("plan") until the user presses Confirm. This module works out what
// the trip would look like once the plan is saved, and checks that the plan can be saved. Pure: no storage, no clock.
import { canBeMatched, pairFields, statementRefOf, unlinkFields } from './reconcile.ts';
import type { StatementRow } from './statement-map.ts';
import type { CategoryId, Expense } from './types.ts';

export interface PlanAdd {
  row: StatementRow;
  categoryId?: CategoryId;
}
export interface Plan {
  /** Tracked expense id → the debit chosen for it (a proposal accepted, a foreign debit picked, or a hand link). */
  links: Record<string, StatementRow>;
  /** Saved matches to take back: the expense ids. */
  unlinks: string[];
  /** Debits to add to the trip as expenses, by row fingerprint. */
  adds: Record<string, PlanAdd>;
  /** Expenses that came from the statement and are to be removed from the trip. */
  removes: string[];
}

export const emptyPlan = (): Plan => ({ links: {}, unlinks: [], adds: {}, removes: [] });

export interface PlanCounts {
  matches: number;
  adds: number;
  unlinks: number;
  removes: number;
  total: number;
}
export function planCounts(plan: Plan): PlanCounts {
  const matches = Object.keys(plan.links).length;
  const adds = Object.keys(plan.adds).length;
  return { matches, adds, unlinks: plan.unlinks.length, removes: plan.removes.length, total: matches + adds + plan.unlinks.length + plan.removes.length };
}

/** The id a drafted (not yet saved) expense has on screen. */
export const draftId = (rowHash: string): string => `draft:${rowHash}`;
export const isDraftId = (id: string): boolean => id.startsWith('draft:');

const MAX_PAYEE = 80;

/** What an added debit becomes (the same fields the repo saves). */
export function draftExpense(tripId: string, add: PlanAdd): Expense {
  const { row, categoryId } = add;
  return {
    id: draftId(row.rowHash), tripId, date: row.date, payee: row.narration.slice(0, MAX_PAYEE) || 'Bank debit', originalMinor: row.debitMinor, originalCurrency: 'INR',
    inrMinor: row.debitMinor, inrStatus: 'confirmed', paymentMode: 'bank', source: 'statement', statementRef: statementRefOf(row),
    ...(row.refNo && { reference: row.refNo }), ...(categoryId && { categoryId }), attachments: [], excluded: false, createdAt: '', updatedAt: '',
  };
}

/**
 * The trip's expenses as they will be once the plan is saved: removals gone, unlinked ones pending again, linked ones
 * confirmed at the bank's amount, added debits present. Order of work never matters because everything is derived from here.
 */
export function applyPlan(expenses: Expense[], plan: Plan, tripId: string): Expense[] {
  const removed = new Set(plan.removes);
  const unlinked = new Set(plan.unlinks);
  const out: Expense[] = [];
  for (const e of expenses) {
    if (removed.has(e.id)) continue;
    let next = e;
    if (unlinked.has(e.id) && e.statementRef) {
      const { statementRef: _gone, ...rest } = e;
      next = { ...rest, ...unlinkFields(e) };
    }
    const link = plan.links[e.id];
    if (link) next = { ...next, ...pairFields(link) };
    out.push(next);
  }
  for (const add of Object.values(plan.adds)) out.push(draftExpense(tripId, add));
  return out;
}

/**
 * Why a plan cannot be saved, in words; empty when it can. `grantExpenses` are the saved expenses of every trip of the grant,
 * because a statement row can only be used once across the whole grant.
 */
export function validatePlan(grantExpenses: Expense[], plan: Plan): string[] {
  const problems: string[] = [];
  const byId = new Map(grantExpenses.map((e) => [e.id, e]));
  const removed = new Set(plan.removes);
  const unlinked = new Set(plan.unlinks);

  for (const id of plan.removes) {
    const e = byId.get(id);
    if (!e) problems.push('An expense you chose to remove no longer exists.');
    else if (e.source !== 'statement') problems.push(`"${e.payee}" did not come from the statement, so it cannot be removed here.`);
  }
  for (const id of plan.unlinks) {
    const e = byId.get(id);
    if (!e || !e.statementRef) problems.push('A match you chose to take back is no longer there.');
  }

  const used = new Set(grantExpenses.filter((e) => e.statementRef && !removed.has(e.id) && !unlinked.has(e.id)).map((e) => e.statementRef!.rowHash));
  const claimedRows = new Set<string>();
  const claim = (row: StatementRow, who: string) => {
    if (used.has(row.rowHash)) problems.push(`The bank line for "${who}" is already used by another expense.`);
    else if (claimedRows.has(row.rowHash)) problems.push(`One bank line was chosen twice ("${who}").`);
    claimedRows.add(row.rowHash);
  };
  for (const [id, row] of Object.entries(plan.links)) {
    const e = byId.get(id);
    if (!e) problems.push('An expense you chose to match no longer exists.');
    else {
      const free = canBeMatched(e) || (unlinked.has(e.id) && e.paymentMode === 'bank' && !e.excluded);
      if (!free) problems.push(`"${e.payee}" can no longer be matched.`);
      claim(row, e.payee);
    }
  }
  for (const add of Object.values(plan.adds)) claim(add.row, add.row.narration.slice(0, MAX_PAYEE) || 'Bank debit');
  return problems;
}
