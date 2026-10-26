import { describe, expect, it } from 'vitest';
import { assignSelection } from '../../src/shared/assign.ts';

describe('REQ-CAP-16: reading a captured phrase as a field value', () => {
  it('REQ-CAP-16: a payee loses stray punctuation at its edges', () => {
    expect(assignSelection('payee', 'XYZ MART')).toMatchObject({ ok: true, patch: { payee: 'XYZ MART' } });
    expect(assignSelection('payee', '@ SHOP ONE.')).toMatchObject({ patch: { payee: 'SHOP ONE' } });
  });

  it('REQ-CAP-16: "2399" sets the amount; "Rs.2,399.00" and "INR 2399" also set the currency', () => {
    expect(assignSelection('amount', '2399')).toMatchObject({ ok: true, patch: { amountText: '2399' } });
    expect(assignSelection('amount', 'Rs.2,399.00')).toMatchObject({ ok: true, patch: { amountText: '2399', currency: 'INR' } });
    expect(assignSelection('amount', 'INR 2399')).toMatchObject({ ok: true, patch: { amountText: '2399', currency: 'INR' } });
    expect(assignSelection('amount', 'USD 45.50')).toMatchObject({ ok: true, patch: { amountText: '45.5', currency: 'USD' } });
    expect(assignSelection('amount', 'JPY 12,000')).toMatchObject({ ok: true, patch: { amountText: '12000', currency: 'JPY' } });
  });

  it('REQ-CAP-16: a date in any supported style sets the date', () => {
    for (const written of ['25OCT26', '25/10/26', '25 Oct 2026', '25th Oct 2026', '2026-10-25']) {
      expect(assignSelection('date', written), written).toMatchObject({ ok: true, patch: { date: '2026-10-25' } });
    }
  });

  it('REQ-CAP-16: a reference is kept as written, trimmed of punctuation', () => {
    expect(assignSelection('reference', 'Ref: 34567.')).toMatchObject({ patch: { reference: 'Ref: 34567' } });
  });

  it('REQ-CAP-16: a phrase that cannot be read as the field gives a message instead of a value', () => {
    expect(assignSelection('amount', 'hello')).toEqual({ ok: false, error: '"hello" does not look like an amount.' });
    expect(assignSelection('amount', '0')).toMatchObject({ ok: false });
    expect(assignSelection('date', 'hello')).toEqual({ ok: false, error: '"hello" does not look like a date.' });
    expect(assignSelection('date', '31/02/26')).toMatchObject({ ok: false });
    expect(assignSelection('payee', '   ')).toEqual({ ok: false, error: 'Tap some words first.' });
  });
});
