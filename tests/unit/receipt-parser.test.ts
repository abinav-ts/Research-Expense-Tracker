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

describe('REQ-CAP-13: bank SMS formats beyond the first samples', () => {
  const OWNER_SMS = 'Rs 2399 spent@ ABDUSROLLS on 25OCT26 12:59 Bal Rs.123456 Ref 34567'; // a real-style SMS pasted by the owner

  it('REQ-CAP-13: "Rs 2399 spent@ ABDUSROLLS on 25OCT26 12:59 Bal Rs.123456 Ref 34567" gives amount, date, payee and reference', () => {
    expect(parseReceiptText(scrubReceiptText(OWNER_SMS))).toEqual({
      amountMinor: 239_900, currency: 'INR', date: '2026-10-25', payee: 'ABDUSROLLS', reference: '34567',
    });
  });

  it('REQ-CAP-13: the account balance in that SMS (Bal Rs.123456) is removed before saving and never taken as the amount', () => {
    const scrubbed = scrubReceiptText(OWNER_SMS);
    expect(scrubbed).not.toContain('123456');
    expect(scrubbed).not.toMatch(/\bbal\b/i);
    expect(parseReceiptText(OWNER_SMS).amountMinor).toBe(239_900);
  });

  it('REQ-CAP-13: balance wordings Bal, Balance, Avl Bal, Available balance and Avl Lmt are all scrubbed', () => {
    for (const text of ['Bal: Rs 5,000.50', 'Balance INR 77,000', 'Avl Bal Rs.1,23,456.00 CR', 'Available balance 99999', 'Avl Lmt INR 85,000.00']) {
      expect(scrubReceiptText(`Rs 10 spent at X on 01-Jan-26. ${text}`), text).not.toMatch(/\d{4,}/);
    }
  });

  it('REQ-CAP-13: the merchant may follow "at", "@", or "spent@" with or without a space', () => {
    expect(parseReceiptText('Rs 100 spent at SHOP ONE on 01-Nov-26').payee).toBe('SHOP ONE');
    expect(parseReceiptText('Rs 100 spent @ SHOP TWO on 01-Nov-26').payee).toBe('SHOP TWO');
    expect(parseReceiptText('Rs 100 spent@SHOP THREE on 01-Nov-26').payee).toBe('SHOP THREE');
    expect(parseReceiptText('Rs 100 spent@ SHOP FOUR Ref 98765').payee).toBe('SHOP FOUR');
  });

  it('REQ-CAP-13: dates may be written 25OCT26, 25-OCT-26, 25 Oct 2026, 25Oct2026, Oct 25, 2026 or 25.10.26', () => {
    for (const written of ['25OCT26', '25-OCT-26', '25 Oct 2026', '25Oct2026', 'Oct 25, 2026', '25.10.26', '25/10/2026', '2026-10-25']) {
      expect(parseReceiptText(`Rs 10 spent at X on ${written} 12:59`).date, written).toBe('2026-10-25');
    }
  });

  it('REQ-CAP-13: ordinary words are not mistaken for dates ("5 Marketing 2026") or references ("refund")', () => {
    expect(parseReceiptText('Rs 10 spent at X, 5 Marketing 2026').date).toBeUndefined();
    expect(parseReceiptText('Rs 10 paid, refund pending').reference).toBeUndefined();
    expect(parseReceiptText('Rs 10 paid. Ref ABCDEF').reference).toBeUndefined(); // no digit: not a reference number
  });

  it('REQ-CAP-13: amounts written Rs2399, Rs.2,399.00, INR 2399 and ₹2399 all read as 239900 paise', () => {
    for (const written of ['Rs2399', 'Rs.2,399.00', 'INR 2399', '₹2399', 'Rs. 2399/-']) {
      expect(parseReceiptText(`${written} spent at SHOP on 01-Nov-26`).amountMinor, written).toBe(239_900);
    }
  });
});
