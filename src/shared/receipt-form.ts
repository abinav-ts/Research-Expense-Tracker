// Turns what the parser found into form values (REQ-CAP-05, REQ-CAP-13). Only fields it found are returned.
import { currencyExponent } from './currency.ts';
import type { ExpenseFormInput } from './expense-form.ts';
import { minorToText } from './money.ts';
import type { ParsedReceipt } from './receipt-parser.ts';

export function formValuesFromReceipt(parsed: ParsedReceipt): Partial<ExpenseFormInput> {
  const values: Partial<ExpenseFormInput> = {};
  if (parsed.amountMinor !== undefined) {
    const currency = parsed.currency ?? 'INR';
    values.amountText = minorToText(parsed.amountMinor, currencyExponent(currency));
    values.currency = currency;
  }
  if (parsed.date) values.date = parsed.date;
  if (parsed.payee) values.payee = parsed.payee;
  if (parsed.reference) values.reference = parsed.reference;
  return values;
}
