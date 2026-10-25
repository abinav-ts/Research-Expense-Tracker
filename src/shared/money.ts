// REQ-NFR-04: all money is an integer in minor units (paise for INR). No floating-point arithmetic on amounts.
// FX estimates are integer micro-rates (INR per 1 unit of foreign currency × 1,000,000), rounded half-up.

export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

function assertMinor(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer of minor units, got ${value}`);
}

/**
 * Convert an original-currency amount (in its minor units, `exponent` decimals: 2 for EUR, 0 for JPY) to INR paise:
 * originalMinor ÷ 10^exponent × rateMicro ÷ 1e6 × 100, rounded half-up.
 */
export function fxToInrMinor(originalMinor: number, rateMicro: number, exponent = 2): number {
  assertMinor(originalMinor, 'originalMinor');
  assertMinor(rateMicro, 'rateMicro');
  if (originalMinor < 0 || rateMicro < 0) throw new RangeError('amounts and rates must not be negative');
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 6) throw new RangeError('exponent must be 0..6');
  // BigInt keeps the product exact even when it exceeds 2^53.
  const numerator = BigInt(originalMinor) * BigInt(rateMicro) * 100n;
  const denominator = 10n ** BigInt(exponent) * 1_000_000n;
  return Number((numerator + denominator / 2n) / denominator);
}

/** Format paise for display with Indian digit grouping: 12345600 → "₹1,23,456.00". UI edge only. */
export function formatInr(paise: number): string {
  assertMinor(paise, 'paise');
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = String(Math.trunc(abs / 100));
  const fraction = String(abs % 100).padStart(2, '0');
  const lastThree = rupees.slice(-3);
  const rest = rupees.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}` : lastThree;
  return `${sign}₹${grouped}.${fraction}`;
}

/** Format minor units of any currency for display: (8900, 'EUR') → "EUR 89.00", (12000, 'JPY') → "JPY 12,000". */
export function formatMinor(minor: number, currency: string, exponent: number): string {
  assertMinor(minor, 'minor');
  const abs = Math.abs(minor);
  const scale = 10 ** exponent;
  const whole = String(Math.trunc(abs / scale)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = exponent > 0 ? `.${String(abs % scale).padStart(exponent, '0')}` : '';
  return `${minor < 0 ? '-' : ''}${currency.toUpperCase()} ${whole}${fraction}`;
}

const COMMAS_OK = /^\d{1,3}(,\d{3})+(\.\d*)?$|^\d{1,2}(,\d{2})*,\d{3}(\.\d*)?$/; // 1,234,567 or 12,34,567

/**
 * Parse a typed non-negative decimal into an integer scaled by 10^decimals ("95.5", 6 → 95500000).
 * Accepts a leading ₹ / Rs / INR, spaces, and Western or Indian comma grouping.
 */
export function parseDecimal(text: string, decimals: number): ParseResult {
  const cleaned = text.trim().replace(/^(₹|rs\.?|inr)\s*/i, '').replace(/\s+/g, '');
  const bad: ParseResult = { ok: false, error: 'Enter a valid number' };
  if (!cleaned) return bad;
  if (cleaned.includes(',') && !COMMAS_OK.test(cleaned)) return bad;
  const plain = cleaned.replaceAll(',', '');
  const m = /^(\d+)(?:\.(\d*))?$/.exec(plain);
  if (!m) return bad;
  const fraction = m[2] ?? '';
  if (fraction.length > decimals) {
    return { ok: false, error: decimals === 0 ? 'This currency has no decimals' : `At most ${decimals} decimal places`};
  }
  const value = Number(m[1] + fraction.padEnd(decimals, '0'));
  return Number.isSafeInteger(value) ? { ok: true, value } : { ok: false, error: 'That number is too large' };
}

/** Like parseDecimal, but the amount must be greater than zero. */
export function parseAmount(text: string, decimals = 2): ParseResult {
  const r = parseDecimal(text, decimals);
  return r.ok && r.value === 0 ? { ok: false, error: 'Enter an amount greater than 0' } : r;
}

/** Minor units back to editable text without grouping: (245050, 2) → "2450.5"; (12000, 0) → "12000". */
export function minorToText(minor: number, exponent = 2): string {
  assertMinor(minor, 'minor');
  const scale = 10 ** exponent;
  const whole = Math.trunc(Math.abs(minor) / scale);
  const frac = String(Math.abs(minor) % scale).padStart(exponent, '0').replace(/0+$/, '');
  return `${minor < 0 ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}
