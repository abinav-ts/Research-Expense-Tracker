import { currencyExponent, isCurrencyCode } from './currency.ts';
import { isValidDate } from './dates.ts';
import type { FieldErrors } from './grant.ts';
import { parseAmount, parseDecimal } from './money.ts';

export interface TripFormInput {
  name: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  budgetText: string;
  /** "Default rates": one row per currency, rate = INR per 1 unit, typed (e.g. "95.50"). */
  rates: { currency: string; rateText: string }[];
}
export interface TripFields {
  name: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  budgetMinor?: number;
  fxRatesMicro?: Record<string, number>;
}
export type TripFormResult =
  | { ok: true; value: TripFields; warnings: string[] }
  | { ok: false; errors: FieldErrors<Exclude<keyof TripFormInput, 'rates'> | 'rates'> };

export const RATE_DECIMALS = 6;

/** Parses a typed INR rate ("95.5") into an integer micro-rate (95500000). */
export function parseRateMicro(text: string) {
  const r = parseDecimal(text, RATE_DECIMALS);
  if (r.ok && r.value === 0) return { ok: false, error: 'Enter a rate greater than 0' } as const;
  return r;
}

export function validateTripForm(input: TripFormInput, grant?: { startDate: string; endDate: string }): TripFormResult {
  const errors: FieldErrors<Exclude<keyof TripFormInput, 'rates'> | 'rates'> = {};
  const name = input.name.trim();
  const city = input.city.trim();
  const country = input.country.trim();
  if (!name) errors.name = 'Enter the conference name';
  if (!city) errors.city = 'Enter the city';
  if (!country) errors.country = 'Enter the country';
  if (!isValidDate(input.startDate)) errors.startDate = 'Enter a start date';
  if (!isValidDate(input.endDate)) errors.endDate = 'Enter an end date';
  else if (isValidDate(input.startDate) && input.endDate < input.startDate) errors.endDate = 'End date must be on or after the start date';

  let budgetMinor: number | undefined;
  if (input.budgetText.trim()) {
    const b = parseAmount(input.budgetText);
    if (!b.ok) errors.budgetText = b.error;
    else budgetMinor = b.value;
  }

  const fxRatesMicro: Record<string, number> = {};
  for (const row of input.rates) {
    if (!row.currency.trim() && !row.rateText.trim()) continue;
    const code = row.currency.trim().toUpperCase();
    const rate = parseRateMicro(row.rateText);
    if (!isCurrencyCode(code) || code === 'INR') errors.rates = 'Use a 3-letter currency code other than INR';
    else if (!rate.ok) errors.rates = `${code}: ${rate.error}`;
    else fxRatesMicro[code] = rate.value;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  const warnings: string[] = [];
  if (grant && (input.startDate < grant.startDate || input.endDate > grant.endDate)) {
    warnings.push("These dates fall outside the grant's period.");
  }
  const value: TripFields = { name, city, country, startDate: input.startDate, endDate: input.endDate };
  if (budgetMinor !== undefined) value.budgetMinor = budgetMinor;
  if (Object.keys(fxRatesMicro).length) value.fxRatesMicro = fxRatesMicro;
  return { ok: true, value, warnings };
}

/** For prefilling the rate form from stored micro-rates: 95500000 → "95.5". */
export function microToText(micro: number): string {
  const whole = Math.trunc(micro / 1_000_000);
  const frac = String(micro % 1_000_000).padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}

export { currencyExponent };
