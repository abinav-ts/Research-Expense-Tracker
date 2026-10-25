import { describe, expect, it } from 'vitest';
import { formatInr, fxToInrMinor, minorToText, parseAmount } from '../../src/shared/money.ts';

describe('REQ-NFR-04: integer money arithmetic', () => {
  it('REQ-NFR-04: converts foreign minor units with an integer micro-rate', () => {
    // €89.00 at an estimated ₹95.50 per EUR → ₹8,499.50
    expect(fxToInrMinor(8900, 95_500_000)).toBe(849_950);
  });

  it('REQ-NFR-04: rounds half-up (0.5 paise rounds to 1, not to even)', () => {
    expect(fxToInrMinor(1, 500_000)).toBe(1);
    expect(fxToInrMinor(3, 500_000)).toBe(2);
    expect(fxToInrMinor(1, 499_999)).toBe(0);
  });

  it('REQ-NFR-04: avoids the floating-point error that 0.1 + 0.2 style maths causes', () => {
    // 1,000,000.07 × 3 in floats drifts; in integers it is exact.
    expect(fxToInrMinor(100_000_007, 3_000_000)).toBe(300_000_021);
  });

  it('REQ-NFR-04: stays exact when the intermediate product exceeds 2^53', () => {
    const result = fxToInrMinor(9_000_000_000_000, 99_999_999);
    expect(result).toBe(899_999_991_000_000);
  });

  it('REQ-NFR-04: rejects non-integer or negative inputs instead of rounding silently', () => {
    expect(() => fxToInrMinor(10.5, 1_000_000)).toThrow(RangeError);
    expect(() => fxToInrMinor(100, 95.5)).toThrow(RangeError);
    expect(() => fxToInrMinor(-100, 1_000_000)).toThrow(RangeError);
    expect(() => fxToInrMinor(Number.NaN, 1_000_000)).toThrow(RangeError);
  });

  it('REQ-NFR-04: formats paise with Indian digit grouping at the UI edge', () => {
    expect(formatInr(12_345_600)).toBe('₹1,23,456.00');
    expect(formatInr(0)).toBe('₹0.00');
    expect(formatInr(5)).toBe('₹0.05');
    expect(formatInr(99_999)).toBe('₹999.99');
    expect(formatInr(100_000)).toBe('₹1,000.00');
    expect(formatInr(10_000_000_000)).toBe('₹10,00,00,000.00');
  });

  it('REQ-NFR-04: formats an overspent (negative) balance with a leading minus', () => {
    expect(formatInr(-123_456)).toBe('-₹1,234.56');
  });

  it('REQ-NFR-04: refuses to format a fractional paise value', () => {
    expect(() => formatInr(12.5)).toThrow(RangeError);
  });
});

describe('REQ-CAP-01: money input', () => {
  it('REQ-CAP-01: accepts 2,450.50, 2450.5, ₹ 1,200 and Indian grouping 1,00,000.50', () => {
    expect(parseAmount('2,450.50')).toEqual({ ok: true, value: 245050 });
    expect(parseAmount('2450.5')).toEqual({ ok: true, value: 245050 });
    expect(parseAmount('₹ 1,200')).toEqual({ ok: true, value: 120000 });
    expect(parseAmount('1,00,000.50')).toEqual({ ok: true, value: 10000050 });
    expect(parseAmount('Rs. 99')).toEqual({ ok: true, value: 9900 });
  });

  it('REQ-CAP-01: rejects 0, -5, abc, empty and misplaced commas with a message', () => {
    for (const bad of ['0', '0.00', '-5', 'abc', '', '12,34', '1,2,3', '1..5']) {
      const r = parseAmount(bad);
      expect(r.ok, bad).toBe(false);
    }
    expect(parseAmount('0')).toEqual({ ok: false, error: 'Enter an amount greater than 0' });
  });

  it('REQ-CAP-01: rejects more decimals than the currency allows', () => {
    expect(parseAmount('1.234')).toEqual({ ok: false, error: 'At most 2 decimal places' });
    expect(parseAmount('12000.5', 0)).toEqual({ ok: false, error: 'This currency has no decimals' });
    expect(parseAmount('1.234', 3)).toEqual({ ok: true, value: 1234 });
  });
});

describe('REQ-CAP-01: amounts back to editable text', () => {
  it('REQ-CAP-01: minor units become plain editable text and parse back to the same value', () => {
    expect(minorToText(245_050)).toBe('2450.5');
    expect(minorToText(120_000)).toBe('1200');
    expect(minorToText(5)).toBe('0.05');
    expect(minorToText(12_000, 0)).toBe('12000');
    expect(minorToText(1234, 3)).toBe('1.234');
    for (const minor of [1, 99, 100, 245_050, 10_000_050]) {
      expect(parseAmount(minorToText(minor))).toEqual({ ok: true, value: minor });
    }
  });
});
