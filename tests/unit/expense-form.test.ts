import { describe, expect, it } from 'vitest';
import { validateExpenseForm, type ExpenseFormInput } from '../../src/shared/expense-form.ts';

const form: ExpenseFormInput = {
  amountText: '2,450.50', currency: 'INR', rateText: '', date: '2026-11-12', payee: 'Hotel Sample',
  categoryId: '', paymentMode: 'bank', note: '', reference: '',
};

describe('REQ-CAP-01: manual add expense', () => {
  it('REQ-CAP-01: INR ₹2,450.50 saves originalMinor = inrMinor = 245050 (category optional)', () => {
    const r = validateExpenseForm(form, '2026-11-20');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({ originalMinor: 245050, inrMinor: 245050, originalCurrency: 'INR', paymentMode: 'bank', payee: 'Hotel Sample' });
      expect(r.value.categoryId).toBeUndefined();
    }
  });

  it('REQ-CAP-01: amount, date and payee are required, each with an inline message', () => {
    const r = validateExpenseForm({ ...form, amountText: '', date: '', payee: '  ' }, '2026-11-20');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['amountText', 'date', 'payee']);
  });

  it('REQ-CAP-01: rejects 0, -5 and abc', () => {
    for (const amountText of ['0', '-5', 'abc']) expect(validateExpenseForm({ ...form, amountText }, '2026-11-20').ok).toBe(false);
  });

  it('REQ-CAP-01: a payee over 80 characters and an unknown category are rejected', () => {
    expect(validateExpenseForm({ ...form, payee: 'x'.repeat(81) }, '2026-11-20').ok).toBe(false);
    expect(validateExpenseForm({ ...form, categoryId: 'gifts' }, '2026-11-20').ok).toBe(false);
  });

  it('REQ-CAP-01: a date after today saves with a non-blocking warning', () => {
    const r = validateExpenseForm({ ...form, date: '2026-12-01' }, '2026-11-20');
    expect(r.ok && r.warnings).toEqual(['This date is in the future.']);
  });

  it('REQ-CAP-01: keeps optional note, reference, category and cash mode', () => {
    const r = validateExpenseForm({ ...form, note: ' dinner ', reference: 'UTR123456', categoryId: 'meals', paymentMode: 'cash' }, '2026-11-20');
    expect(r.ok && r.value).toMatchObject({ note: 'dinner', reference: 'UTR123456', categoryId: 'meals', paymentMode: 'cash' });
  });
});
