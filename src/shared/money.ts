// REQ-NFR-04: all money is an integer in minor units (paise for INR). No floating-point arithmetic on amounts.
// FX estimates are integer micro-rates (INR per 1 unit of foreign currency × 1,000,000), rounded half-up.

const MICRO = 1_000_000n;

function assertMinor(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer of minor units, got ${value}`);
}

/** Convert an original-currency amount to INR paise: originalMinor × rateMicro / 1e6, rounded half-up. */
export function fxToInrMinor(originalMinor: number, rateMicro: number): number {
  assertMinor(originalMinor, 'originalMinor');
  assertMinor(rateMicro, 'rateMicro');
  if (originalMinor < 0 || rateMicro < 0) throw new RangeError('amounts and rates must not be negative');
  // BigInt keeps the product exact even when it exceeds 2^53.
  const product = BigInt(originalMinor) * BigInt(rateMicro);
  return Number((product + MICRO / 2n) / MICRO);
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
