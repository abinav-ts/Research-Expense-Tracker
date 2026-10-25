import { describe, expect, it } from 'vitest';
import { currencyExponent } from '../../src/shared/currency.ts';
import { validateExpenseForm, type ExpenseFormInput } from '../../src/shared/expense-form.ts';
import { formatMinor, fxToInrMinor } from '../../src/shared/money.ts';

const base: ExpenseFormInput = {
  amountText: '89', currency: 'EUR', rateText: '95', date: '2026-11-12', payee: 'Hotel Sample',
  categoryId: '', paymentMode: 'bank', note: '', reference: '',
};

describe('REQ-SET-06: foreign-currency expense with estimated rate', () => {
  it('REQ-SET-06: €89.00 at 1 EUR = ₹95.00 is 845500 paise and pending', () => {
    expect(fxToInrMinor(8900, 95_000_000, 2)).toBe(845_500);
    const r = validateExpenseForm(base, '2026-11-20');
    expect(r.ok && r.value.inrMinor).toBe(845_500);
    expect(r.ok && r.value.originalMinor).toBe(8900);
    expect(r.ok && r.value.estimatedRateMicro).toBe(95_000_000);
  });

  it('REQ-SET-06: ¥12,000 at ₹0.63 (630000 micro) is 756000 paise; JPY has no minor unit', () => {
    expect(currencyExponent('JPY')).toBe(0);
    expect(fxToInrMinor(12_000, 630_000, 0)).toBe(756_000);
    const r = validateExpenseForm({ ...base, amountText: '12,000', currency: 'jpy', rateText: '0.63' }, '2026-11-20');
    expect(r.ok && r.value.inrMinor).toBe(756_000);
    expect(r.ok && r.value.originalCurrency).toBe('JPY');
  });

  it('REQ-SET-06: rounds half-up on the paise (95.5 → 96, 95.4 → 95)', () => {
    expect(fxToInrMinor(1, 95_500_000, 2)).toBe(96);
    expect(fxToInrMinor(1, 95_400_000, 2)).toBe(95);
  });

  it('REQ-SET-06: three-decimal currencies use their own exponent', () => {
    expect(currencyExponent('KWD')).toBe(3);
    expect(fxToInrMinor(1_000, 270_000_000, 3)).toBe(27_000); // 1.000 KWD at ₹270
  });

  it('REQ-SET-06: an INR expense asks for no rate and stays equal to the typed amount', () => {
    const r = validateExpenseForm({ ...base, currency: 'INR', amountText: '2,450.50', rateText: '' }, '2026-11-20');
    expect(r.ok && r.value.inrMinor).toBe(245_050);
    expect(r.ok && r.value.estimatedRateMicro).toBeUndefined();
  });

  it('REQ-SET-06: a non-INR expense with no rate is blocked with "Enter an estimated INR rate"', () => {
    const r = validateExpenseForm({ ...base, rateText: '' }, '2026-11-20');
    expect(r).toEqual({ ok: false, errors: { rateText: 'Enter an estimated INR rate' } });
  });

  it('REQ-SET-06: shows the original amount in its own currency format', () => {
    expect(formatMinor(8900, 'eur', 2)).toBe('EUR 89.00');
    expect(formatMinor(12_000, 'JPY', 0)).toBe('JPY 12,000');
  });
});
