// REQ-CAP-07: warn when an expense looks like one already saved under the same grant. Pure.
import { currencyExponent } from './currency.ts';
import { formatDateLabel } from './dates.ts';
import { formatInr, formatMinor } from './money.ts';
import { normaliseWords } from './text-match.ts';
import type { Expense } from './types.ts';

export interface DuplicateCandidate {
  /** Set when editing an existing expense, so it is not compared with itself. */
  id?: string;
  payee: string;
  date: string;
  originalMinor: number;
  originalCurrency: string;
  reference?: string;
  /** SHA-256 of each proof file or message the expense carries. */
  proofHashes: string[];
}

export type DuplicateReason = 'reference' | 'proof' | 'details';
export interface DuplicateMatch {
  expense: Expense;
  reason: DuplicateReason;
}

const REASON_TEXT: Record<DuplicateReason, string> = {
  reference: 'the same reference number',
  proof: 'the same file or message',
  details: 'the same amount, date and payee',
};

/** Every saved expense the candidate duplicates, with the strongest reason for each (reference, then proof, then details). */
export function findDuplicates(candidate: DuplicateCandidate, existing: Expense[]): DuplicateMatch[] {
  const reference = candidate.reference?.trim().toLowerCase();
  const payee = normaliseWords(candidate.payee);
  const hashes = new Set(candidate.proofHashes.filter(Boolean));
  const matches: DuplicateMatch[] = [];
  for (const expense of existing) {
    if (expense.id === candidate.id) continue;
    let reason: DuplicateReason | undefined;
    if (reference && expense.reference?.trim().toLowerCase() === reference) reason = 'reference';
    else if (expense.attachments.some((a) => a.sha256 && hashes.has(a.sha256))) reason = 'proof';
    else if (
      payee && normaliseWords(expense.payee) === payee && expense.date === candidate.date &&
      expense.originalMinor === candidate.originalMinor && expense.originalCurrency === candidate.originalCurrency
    ) reason = 'details';
    if (reason) matches.push({ expense, reason });
  }
  return matches;
}

/** "Looks like a duplicate of Blossom Book House ₹560.00 on 22 Aug 2026 (the same reference number)" */
export function duplicateMessage(match: DuplicateMatch): string {
  const e = match.expense;
  const amount = e.originalCurrency === 'INR' ? formatInr(e.inrMinor) : formatMinor(e.originalMinor, e.originalCurrency, currencyExponent(e.originalCurrency));
  return `Looks like a duplicate of ${e.payee} ${amount} on ${formatDateLabel(e.date)} (${REASON_TEXT[match.reason]})${e.excluded ? ', which is excluded from the claim' : ''}`;
}
