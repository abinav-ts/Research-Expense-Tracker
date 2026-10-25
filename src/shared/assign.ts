// REQ-CAP-15: turn words the user tapped into a value for one form field. Pure, so every format a bank invents
// can still be entered with a few taps.
import { currencyExponent } from './currency.ts';
import { findDateInText } from './dates.ts';
import { minorToText, parseAmount } from './money.ts';
import type { ExpenseFormInput } from './expense-form.ts';

export type AssignField = 'amount' | 'date' | 'payee' | 'reference';
export const ASSIGN_LABELS: Record<AssignField, string> = { amount: 'Amount', date: 'Date', payee: 'Payee', reference: 'Reference' };

export interface Token {
  /** Position in the token list (reading order). */
  index: number;
  text: string;
}

/** Splits text into tappable words. Whitespace separates words; punctuation stays attached ("spent@", "Rs.2,399.00"). */
export function tokenize(text: string): Token[] {
  return text.split(/\s+/).filter(Boolean).map((word, index) => ({ index, text: word }));
}

/** The selected words joined in reading order, whatever order they were tapped in. */
export function selectionText(tokens: Token[], selected: ReadonlySet<number>): string {
  return tokens.filter((t) => selected.has(t.index)).map((t) => t.text).join(' ');
}

export type AssignResult = { ok: true; patch: Partial<ExpenseFormInput>; message: string } | { ok: false; error: string };

const CURRENCY_MARKER = /(₹|\bRs\.?|\b(?:INR|USD|EUR|GBP|JPY|AUD|CAD|CHF|SGD|AED|CNY|KRW|SEK|NOK|DKK|NZD|THB|MYR|HKD|ZAR))/i;
const trimEdges = (s: string) => s.replace(/^[\s.,:;@#\-/()[\]]+|[\s.,:;@#\-/()[\]]+$/g, '');

export function assignSelection(field: AssignField, selection: string): AssignResult {
  const text = selection.trim();
  if (!text) return { ok: false, error: 'Tap some words first.' };

  if (field === 'amount') {
    const marker = CURRENCY_MARKER.exec(text);
    const code = marker ? (/^(₹|rs)/i.test(marker[1]!) ? 'INR' : marker[1]!.toUpperCase()) : undefined;
    const number = /[0-9][0-9,]*(?:\.[0-9]+)?/.exec(text.replace(CURRENCY_MARKER, ' '));
    const parsed = number ? parseAmount(number[0].replace(/[.,]+$/, ''), currencyExponent(code ?? 'INR')) : undefined;
    if (!parsed) return { ok: false, error: `"${text}" does not look like an amount.` };
    if (!parsed.ok) return { ok: false, error: `"${text}": ${parsed.error}.` };
    const patch: Partial<ExpenseFormInput> = { amountText: minorToText(parsed.value, currencyExponent(code ?? 'INR')) };
    if (code) patch.currency = code;
    return { ok: true, patch, message: `Amount set to ${patch.amountText}${code ? ` ${code}` : ''}.` };
  }

  if (field === 'date') {
    const date = findDateInText(text);
    return date ? { ok: true, patch: { date }, message: `Date set to ${date}.` } : { ok: false, error: `"${text}" does not look like a date.` };
  }

  const value = trimEdges(text).slice(0, field === 'payee' ? 80 : 60);
  if (!value) return { ok: false, error: `Nothing usable in "${text}".` };
  return field === 'payee'
    ? { ok: true, patch: { payee: value }, message: `Payee set to ${value}.` }
    : { ok: true, patch: { reference: value }, message: `Reference set to ${value}.` };
}
