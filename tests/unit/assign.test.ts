import { describe, expect, it } from 'vitest';
import { assignSelection, selectionText, tokenize } from '../../src/shared/assign.ts';

const UNKNOWN = 'Alert 2399 INR XYZ MART 25/10/26 thanks';

describe('REQ-CAP-15: tap to assign text to a field', () => {
  it('REQ-CAP-15: splits a message into words, keeping punctuation attached', () => {
    expect(tokenize('Rs.2,399.00 spent@ SHOP  on 25OCT26').map((t) => t.text)).toEqual(['Rs.2,399.00', 'spent@', 'SHOP', 'on', '25OCT26']);
    expect(tokenize('  \n ')).toEqual([]);
  });

  it('REQ-CAP-15: the selection is joined in reading order, however it was tapped', () => {
    const tokens = tokenize(UNKNOWN);
    expect(selectionText(tokens, new Set([4, 3]))).toBe('XYZ MART');
    expect(selectionText(tokens, new Set([3, 4, 2]))).toBe('INR XYZ MART');
  });

  it('REQ-CAP-15: "XYZ MART" tapped and assigned to Payee sets the payee', () => {
    const r = assignSelection('payee', 'XYZ MART');
    expect(r).toMatchObject({ ok: true, patch: { payee: 'XYZ MART' } });
  });

  it('REQ-CAP-15: a payee loses stray punctuation at its edges ("@ SHOP ONE.")', () => {
    expect(assignSelection('payee', '@ SHOP ONE.')).toMatchObject({ patch: { payee: 'SHOP ONE' } });
  });

  it('REQ-CAP-15: "2399" sets the amount; "Rs.2,399.00" and "INR 2399" also set the currency', () => {
    expect(assignSelection('amount', '2399')).toMatchObject({ ok: true, patch: { amountText: '2399' } });
    expect(assignSelection('amount', 'Rs.2,399.00')).toMatchObject({ ok: true, patch: { amountText: '2399', currency: 'INR' } });
    expect(assignSelection('amount', 'INR 2399')).toMatchObject({ ok: true, patch: { amountText: '2399', currency: 'INR' } });
    expect(assignSelection('amount', 'USD 45.50')).toMatchObject({ ok: true, patch: { amountText: '45.5', currency: 'USD' } });
    expect(assignSelection('amount', 'JPY 12,000')).toMatchObject({ ok: true, patch: { amountText: '12000', currency: 'JPY' } });
  });

  it('REQ-CAP-15: a date in any supported style sets the date', () => {
    for (const written of ['25OCT26', '25/10/26', '25 Oct 2026', '25th Oct 2026', '2026-10-25']) {
      expect(assignSelection('date', written), written).toMatchObject({ ok: true, patch: { date: '2026-10-25' } });
    }
  });

  it('REQ-CAP-15: a reference is kept as typed, trimmed of punctuation', () => {
    expect(assignSelection('reference', 'Ref: 34567.')).toMatchObject({ patch: { reference: 'Ref: 34567' } });
    expect(assignSelection('reference', '34567')).toMatchObject({ patch: { reference: '34567' } });
  });

  it('REQ-CAP-15: a selection that cannot be read as the chosen field gives a message and changes nothing', () => {
    expect(assignSelection('amount', 'hello')).toEqual({ ok: false, error: '"hello" does not look like an amount.' });
    expect(assignSelection('amount', '0')).toMatchObject({ ok: false });
    expect(assignSelection('amount', '1.234')).toMatchObject({ ok: false });
    expect(assignSelection('date', 'hello')).toEqual({ ok: false, error: '"hello" does not look like a date.' });
    expect(assignSelection('date', '31/02/26')).toMatchObject({ ok: false });
    expect(assignSelection('payee', '   ')).toEqual({ ok: false, error: 'Tap some words first.' });
    expect(assignSelection('payee', '@ .')).toMatchObject({ ok: false });
  });
});
