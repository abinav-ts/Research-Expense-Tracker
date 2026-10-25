import { describe, expect, it } from 'vitest';
import { parseReceiptText, scrubReceiptText } from '../../src/shared/receipt-parser.ts';

// All samples are synthetic.
const CARD_SMS = 'INR 2,450.00 spent on card XX1234 at HOTEL SAMPLE on 12-Nov-26. Avl Lmt INR 85,000.00';
const UPI = 'Payment successful\nPaid to RAMESH STORES\n₹1,200\n12 Nov 2026, 10:42 am\nUPI transaction ID 123456789012';

describe('REQ-CAP-13: paste or share SMS/notification text', () => {
  it('REQ-CAP-13: the card SMS prefills amount ₹2,450.00, date 2026-11-12 and payee HOTEL SAMPLE', () => {
    expect(parseReceiptText(scrubReceiptText(CARD_SMS))).toEqual({ amountMinor: 245_000, currency: 'INR', date: '2026-11-12', payee: 'HOTEL SAMPLE' });
  });

  it('REQ-CAP-13: card digits and the available limit are scrubbed before anything is stored', () => {
    const scrubbed = scrubReceiptText(CARD_SMS);
    expect(scrubbed).not.toContain('1234');
    expect(scrubbed).not.toContain('85,000');
    expect(scrubbed).not.toMatch(/avl/i);
    expect(scrubbed).toContain('HOTEL SAMPLE');
  });

  it('REQ-CAP-13: even unscrubbed, an "Avl Lmt" figure is never taken as the amount', () => {
    expect(parseReceiptText(CARD_SMS).amountMinor).toBe(245_000);
  });

  it('REQ-CAP-13: a UPI-style receipt gives amount, date, payee and reference', () => {
    expect(parseReceiptText(UPI)).toEqual({ amountMinor: 120_000, currency: 'INR', date: '2026-11-12', payee: 'RAMESH STORES', reference: '123456789012' });
  });

  it('REQ-CAP-13: text the parser cannot read gives an empty result', () => {
    expect(parseReceiptText('hello, see you at the venue tomorrow')).toEqual({});
    expect(parseReceiptText('')).toEqual({});
  });

  it('REQ-CAP-13: with two amounts the one next to spent/paid/debited wins', () => {
    expect(parseReceiptText('Rs 20.00 fee. Rs 500.00 debited from your account on 02/11/2026').amountMinor).toBe(50_000);
    expect(parseReceiptText('You paid Rs.750.50 to CAFE SAMPLE. Cashback Rs 10').amountMinor).toBe(75_050);
  });

  it('REQ-CAP-13: with two amounts and no clear winner the field stays empty', () => {
    expect(parseReceiptText('Rs 20.00 and Rs 30.00 noted').amountMinor).toBeUndefined();
  });

  it('REQ-CAP-13: reads a foreign-currency card alert with the right minor units', () => {
    const r = parseReceiptText(scrubReceiptText('USD 45.00 spent on card XX9876 at AMAZON on 02-Nov-26'));
    expect(r).toMatchObject({ amountMinor: 4500, currency: 'USD', date: '2026-11-02', payee: 'AMAZON' });
    expect(parseReceiptText('JPY 12,000 spent at SHOP ONE on 03-Nov-26')).toMatchObject({ amountMinor: 12_000, currency: 'JPY' });
  });

  it('REQ-CAP-13: understands common date styles, day first, and rejects impossible dates', () => {
    expect(parseReceiptText('Rs 10 paid on 2026-11-12').date).toBe('2026-11-12');
    expect(parseReceiptText('Rs 10 paid on 05/11/2026').date).toBe('2026-11-05');
    expect(parseReceiptText('Rs 10 paid on 12 November 2026').date).toBe('2026-11-12');
    expect(parseReceiptText('Rs 10 paid on 31-Feb-26').date).toBeUndefined();
  });
});
