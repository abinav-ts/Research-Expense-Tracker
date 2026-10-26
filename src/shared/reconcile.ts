// REQ-CSV-08: pair tracked expenses with bank-statement debits. Pure and deterministic. The statement debit is the amount
// the grant authority accepts (SPEC principle 7), so a pair replaces the expense's amount with the debit.
import { currencyExponent } from './currency.ts';
import { daysBetween } from './dates.ts';
import { formatInr, fxToInrMinor } from './money.ts';
import type { StatementRow } from './statement-map.ts';
import type { Expense, StatementRef } from './types.ts';

export const INR_DAYS = 2; // an INR expense and its debit are at most 2 days apart
export const FOREIGN_DAYS = 5; // a foreign card spend can post a few days later
export const FOREIGN_BAND = 0.15; // and its rupee amount lands within 15 % of the estimate
const MAX_CANDIDATES = 5;

export interface Proposal {
  expenseId: string;
  row: StatementRow;
  reason: string;
}
export interface Candidate {
  row: StatementRow;
  reason: string;
}
export interface ForeignChoice {
  expenseId: string;
  candidates: Candidate[];
}
export interface Matches {
  /** INR expenses with a debit of exactly the same amount within 2 days: proposed automatically (still confirmed by the user). */
  automatic: Proposal[];
  /** Foreign expenses: debits near the estimate, to choose from. Never confirmed automatically. */
  foreign: ForeignChoice[];
  /** Expenses still waiting for a debit (including those with no proposal), oldest first. */
  unpaired: Expense[];
}

/** A tracked expense that can be matched: bank-paid, still pending, in the claim. Cash has no statement line. */
export const canBeMatched = (e: Expense): boolean => !e.excluded && e.paymentMode === 'bank' && e.inrStatus === 'pending';

const days = (n: number) => (n === 0 ? 'the same day' : `${n} ${n === 1 ? 'day' : 'days'} apart`);

/**
 * `rows` are the statement's debits; `taken` holds fingerprints of rows already used by an expense of the grant.
 * Pairs are decided together, not one by one: every candidate pair is ranked (smallest date gap, then the expense
 * created first, then the earlier statement line) and taken greedily, so two identical expenses and one matching debit
 * give exactly one pair, and always the same one.
 */
export function proposeMatches(expenses: Expense[], rows: StatementRow[], taken: ReadonlySet<string> = new Set()): Matches {
  const open = expenses.filter(canBeMatched);
  const free = rows.filter((r) => !taken.has(r.rowHash));

  const exact: { expense: Expense; row: StatementRow; gap: number }[] = [];
  for (const expense of open.filter((e) => e.originalCurrency === 'INR')) {
    for (const row of free) {
      const gap = Math.abs(daysBetween(expense.date, row.date));
      if (row.debitMinor === expense.inrMinor && gap <= INR_DAYS) exact.push({ expense, row, gap });
    }
  }
  exact.sort((a, b) => a.gap - b.gap || (a.expense.createdAt < b.expense.createdAt ? -1 : a.expense.createdAt > b.expense.createdAt ? 1 : 0) || a.row.line - b.row.line);
  const usedExpenses = new Set<string>();
  const usedRows = new Set<string>();
  const automatic: Proposal[] = [];
  for (const { expense, row, gap } of exact) {
    if (usedExpenses.has(expense.id) || usedRows.has(row.rowHash)) continue;
    usedExpenses.add(expense.id);
    usedRows.add(row.rowHash);
    automatic.push({ expenseId: expense.id, row, reason: `same amount, ${days(gap)}` });
  }

  const foreign: ForeignChoice[] = [];
  for (const expense of open.filter((e) => e.originalCurrency !== 'INR')) {
    const estimate = expense.inrMinor;
    const candidates = free
      .filter((r) => !usedRows.has(r.rowHash))
      .map((row) => ({ row, gap: Math.abs(daysBetween(expense.date, row.date)), diff: row.debitMinor - estimate }))
      .filter((c) => estimate > 0 && Math.abs(c.diff) / estimate <= FOREIGN_BAND && c.gap <= FOREIGN_DAYS)
      .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff) || a.gap - b.gap || a.row.line - b.row.line)
      .slice(0, MAX_CANDIDATES)
      .map((c): Candidate => ({
        row: c.row,
        reason: `${c.diff === 0 ? 'exactly your estimate' : `${formatInr(Math.abs(c.diff))} ${c.diff > 0 ? 'more' : 'less'} than your estimate`}, ${days(c.gap)}`,
      }));
    if (candidates.length) foreign.push({ expenseId: expense.id, candidates });
  }

  const unpaired = open.filter((e) => !usedExpenses.has(e.id)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { automatic, foreign, unpaired };
}

export function statementRefOf(row: StatementRow): StatementRef {
  return { date: row.date, narration: row.narration, debitMinor: row.debitMinor, ...(row.refNo && { refNo: row.refNo }), rowHash: row.rowHash };
}

/** What changes on an expense when it is paired: the statement debit becomes its amount and it is confirmed. */
export function pairFields(row: StatementRow): Pick<Expense, 'inrMinor' | 'inrStatus' | 'statementRef'> {
  return { inrMinor: row.debitMinor, inrStatus: 'confirmed', statementRef: statementRefOf(row) };
}

/** Unlinking returns the expense to pending at its own amount: the estimate for a foreign one, what was typed for an INR one. */
export function unlinkFields(expense: Expense): { inrMinor: number; inrStatus: 'pending' } {
  const inrMinor =
    expense.originalCurrency === 'INR'
      ? expense.originalMinor
      : expense.estimatedRateMicro !== undefined
        ? fxToInrMinor(expense.originalMinor, expense.estimatedRateMicro, currencyExponent(expense.originalCurrency))
        : expense.inrMinor; // no rate to go back to: keep the amount
  return { inrMinor, inrStatus: 'pending' };
}
