// REQ-CAP-01, REQ-SET-06: validate the expense form and compute the INR amount with integer maths.
import { currencyExponent, isCurrencyCode } from './currency.ts';
import { isValidDate } from './dates.ts';
import type { FieldErrors } from './grant.ts';
import { fxToInrMinor, parseAmount } from './money.ts';
import { parseRateMicro } from './trip.ts';
import { CATEGORY_IDS, type CategoryId } from './types.ts';

export interface ExpenseFormInput {
  amountText: string;
  currency: string;
  rateText: string;
  date: string;
  payee: string;
  categoryId: string;
  paymentMode: 'bank' | 'cash';
  note: string;
  reference: string;
}
export interface ExpenseFields {
  originalMinor: number;
  originalCurrency: string;
  inrMinor: number;
  estimatedRateMicro?: number;
  date: string;
  payee: string;
  categoryId?: CategoryId;
  paymentMode: 'bank' | 'cash';
  note?: string;
  reference?: string;
}
export type ExpenseFormResult =
  | { ok: true; value: ExpenseFields; warnings: string[] }
  | { ok: false; errors: FieldErrors<keyof ExpenseFormInput> };

export function validateExpenseForm(input: ExpenseFormInput, today: string): ExpenseFormResult {
  const errors: FieldErrors<keyof ExpenseFormInput> = {};
  const currency = (input.currency.trim() || 'INR').toUpperCase();
  const isInr = currency === 'INR';

  if (!isCurrencyCode(currency)) errors.currency = 'Use a 3-letter currency code';
  const exponent = currencyExponent(currency);
  const amount = parseAmount(input.amountText, exponent);
  if (!amount.ok) errors.amountText = amount.error;

  let rateMicro: number | undefined;
  if (!isInr && !errors.currency) {
    const rate = parseRateMicro(input.rateText);
    if (!input.rateText.trim()) errors.rateText = 'Enter an estimated INR rate';
    else if (!rate.ok) errors.rateText = rate.error;
    else rateMicro = rate.value;
  }

  if (!isValidDate(input.date)) errors.date = 'Enter a date';
  const payee = input.payee.trim();
  if (!payee) errors.payee = 'Enter who was paid';
  else if (payee.length > 80) errors.payee = 'At most 80 characters';
  if (input.categoryId && !(CATEGORY_IDS as readonly string[]).includes(input.categoryId)) errors.categoryId = 'Choose a category from the list';

  if (Object.keys(errors).length || !amount.ok) return { ok: false, errors };

  const value: ExpenseFields = {
    originalMinor: amount.value,
    originalCurrency: currency,
    inrMinor: isInr ? amount.value : fxToInrMinor(amount.value, rateMicro!, exponent),
    date: input.date,
    payee,
    paymentMode: input.paymentMode,
  };
  if (rateMicro !== undefined) value.estimatedRateMicro = rateMicro;
  if (input.categoryId) value.categoryId = input.categoryId as CategoryId;
  if (input.note.trim()) value.note = input.note.trim();
  if (input.reference.trim()) value.reference = input.reference.trim();

  const warnings: string[] = [];
  if (input.date > today) warnings.push('This date is in the future.');
  return { ok: true, value, warnings };
}
