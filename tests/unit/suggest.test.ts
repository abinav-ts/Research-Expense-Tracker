import { describe, expect, it } from 'vitest';
import { suggestFields } from '../../src/shared/suggest.ts';
import { editDistance, normaliseWords, similarity } from '../../src/shared/text-match.ts';

// A made-up till receipt, with the kinds of mistakes OCR makes on a photographed print. Nothing here is a real merchant.
const RECEIPT = [
  '*** ** *** *** * ** * * * **',
  'oko soR EK Ack RAR RRR AR AAR EE RE',
  'Sample Book House',
  'No. 12/3, Church Street,',
  'Opposite Garden,',
  'Phone: 9876543210',
  'TAX INVOICE',
  'Invoice No : AB-26-XYZ-47612',
  'Date : 22-hugust-2026(21:11) T#6',
  'Cashier : demo',
  'BK 0001234 490100 SOME BOOK TITLE',
  '0% 1 INR 560.00 0.00% 560.00*',
  'Tot: 1 560.00',
  'Grand Total : TE60.00',
  'Grand Total : 560.00',
  'CASH 560.00',
  'GST # 29ABCDE0205L1Z1',
].join('\n');

describe('REQ-CAP-15: suggested values for each field', () => {
  it('REQ-CAP-15: on a noisy receipt the amount, date, payee and reference each have the right first suggestion', () => {
    const s = suggestFields(RECEIPT);
    expect(s.amount[0]!.label).toBe('₹560.00');
    expect(s.date.map((d) => d.patch.date)).toContain('2026-08-22');
    expect(s.payee[0]!.label).toBe('Sample Book House');
    expect(s.reference[0]!.label).toBe('AB-26-XYZ-47612');
  });

  it('REQ-CAP-15: a value on several lines beats a garbled one: 560.00 four times wins over a lone 60.00, and a number glued to letters is ignored', () => {
    const s = suggestFields(RECEIPT);
    expect(s.amount.map((a) => a.patch.amountText)).not.toContain('60');
    expect(s.amount[0]!.patch).toEqual({ amountText: '560', currency: 'INR' });
  });

  it('REQ-CAP-15: numbers on tax, rate and discount lines rank below the total', () => {
    const s = suggestFields('Subtotal 1000.00\nGST 5% 50.00\nDiscount 20.00\nGrand Total 1030.00\n');
    expect(s.amount[0]!.label).toBe('₹1,030.00');
    expect(s.amount[0]!.hint).toBe('near "total"');
  });

  it('REQ-CAP-15: percentages, dates, phone numbers, quantities and plain digit runs are not amounts', () => {
    const s = suggestFields('Qty 3\nGST 18%\n12.11.2026\nPhone 9876543210\nOrder 4455667788\nVisit www.example.com 12\n');
    expect(s.amount).toEqual([]);
  });

  it('REQ-CAP-15: a currency marker makes an integer an amount, and a foreign marker sets the currency', () => {
    expect(suggestFields('Rs 2399 spent at SHOP').amount[0]!.patch).toEqual({ amountText: '2399', currency: 'INR' });
    const eur = suggestFields('Conference registration\nTotal: EUR 180.00\n').amount[0]!;
    expect(eur.patch).toEqual({ amountText: '180', currency: 'EUR' });
    expect(eur.label).toBe('EUR 180.00');
  });

  it('REQ-CAP-15: dates inside the trip window come first; without a window the one next to "date" leads', () => {
    const text = 'Invoice date: 22 Aug 2026\nDelivery on 12 Nov 2026\n';
    expect(suggestFields(text, { window: { start: '2026-11-08', end: '2026-11-16' } }).date.map((d) => d.patch.date)).toEqual(['2026-11-12', '2026-08-22']);
    expect(suggestFields(text, { window: { start: '2026-11-08', end: '2026-11-16' } }).date[0]!.hint).toBe('in the trip dates');
    expect(suggestFields(text).date[0]!.patch.date).toBe('2026-08-22');
  });

  it('REQ-CAP-15: a misread day gives two guesses, marked as guesses so the form never prefills them', () => {
    const s = suggestFields('Date: 72-bugust-2026\n');
    expect(s.date.map((d) => d.patch.date).sort()).toEqual(['2026-08-12', '2026-08-22']);
    expect(s.date.every((d) => d.hint === 'read with a guess' && d.guess === true)).toBe(true);
    expect(suggestFields('Date: 22-hugust-2026\n').date[0]!.guess).toBeUndefined(); // a clean reading with a fuzzy month is not a guess
  });

  it('REQ-CAP-15: a lone unlabelled number is not offered beside a total that is printed on several lines', () => {
    const noisy = 'Tot: 1 560.00\nGrand Total : 560.00\nCASH 560.00\n0% 1 INR 560.00 0.00% 560.00\nCode 7,560.00\nref 960.00\n';
    expect(suggestFields(noisy).amount.map((a) => a.label)).toEqual(['₹560.00']);
    // but with a small spread of scores the second reading stays available
    expect(suggestFields('Subtotal 1000.00\nGrand Total 1050.00\n').amount.map((a) => a.label)).toEqual(['₹1,050.00', '₹1,000.00']);
  });

  it('REQ-CAP-15: decoration rows, junk, address, contact and heading lines are never suggested as the payee', () => {
    const payees = suggestFields(RECEIPT).payee.map((p) => p.label);
    for (const bad of ['oko soR EK Ack RAR RRR AR AAR EE RE', 'No. 12/3, Church Street', 'Opposite Garden', 'TAX INVOICE', 'Phone: 9876543210']) expect(payees).not.toContain(bad);
    expect(payees[0]).toBe('Sample Book House');
  });

  it('REQ-CAP-15: at most three suggestions per field, and nothing found means empty lists', () => {
    const many = Array.from({ length: 8 }, (_, i) => `Total ${100 + i}.00`).join('\n');
    expect(suggestFields(many).amount).toHaveLength(3);
    expect(suggestFields('hello there')).toEqual({ amount: [], date: [], payee: [], reference: [] });
    expect(suggestFields('')).toEqual({ amount: [], date: [], payee: [], reference: [] });
  });

  it('REQ-CAP-15: the references come from Invoice no, Bill no, Receipt no, Txn, Ref and UTR labels and must contain a digit', () => {
    expect(suggestFields('Bill No: 77881\n').reference[0]!.label).toBe('77881');
    expect(suggestFields('UPI transaction ID\n123456789012\n').reference[0]!.label).toBe('123456789012');
    expect(suggestFields('Invoice no: ABCDEF\n').reference).toEqual([]);
    expect(suggestFields('Ref 34567').reference[0]!.label).toBe('34567');
  });

  it('REQ-CAP-15: a pasted bank SMS gets its amount, date, payee and reference as the first suggestions', () => {
    const s = suggestFields('Rs 2399 spent@ ABDUSROLLS on 25OCT26 12:59 Ref 34567');
    expect([s.amount[0]!.label, s.date[0]!.patch.date, s.payee[0]!.label, s.reference[0]!.label]).toEqual(['₹2,399.00', '2026-10-25', 'ABDUSROLLS', '34567']);
  });

  it('REQ-CAP-15: card digits and balances scrubbed earlier mean they can never be suggested', () => {
    const s = suggestFields('INR 2,450.00 spent on card XXXX at HOTEL SAMPLE on 12-Nov-26.');
    expect(JSON.stringify(s)).not.toMatch(/1234|85,000/);
  });
});

describe('REQ-CAP-16: payee spelling memory', () => {
  it('REQ-CAP-16: a line OCR misread ("Sample Bock Rouse") brings back the spelling the user saved, labelled "Used before", first', () => {
    const text = 'Sample Bock Rouse\nTAX INVOICE\nGrand Total 560.00\n';
    const s = suggestFields(text, { knownPayees: ['Sample Book House', 'Other Shop'] });
    expect(s.payee[0]).toMatchObject({ label: 'Sample Book House', hint: 'used before' });
    expect(s.payee.map((p) => p.label)).toContain('Sample Bock Rouse');
    expect(s.payee.map((p) => p.label)).not.toContain('Other Shop');
  });

  it('REQ-CAP-16: a remembered payee that is not on the page is not suggested', () => {
    expect(suggestFields('Totally Different Cafe\n', { knownPayees: ['Sample Book House'] }).payee.map((p) => p.label)).not.toContain('Sample Book House');
  });
});

describe('text matching helpers', () => {
  it('REQ-CAP-16: similarity ignores case and punctuation and counts edits', () => {
    expect(normaliseWords('  Sample,  Book-House! ')).toBe('sample book house');
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(similarity('SAMPLE BOOK HOUSE', 'sample book house.')).toBe(1);
    expect(similarity('Sample Bock Rouse', 'Sample Book House')).toBeGreaterThan(0.8);
    expect(similarity('Cafe', 'Hotel')).toBeLessThan(0.5);
    expect(similarity('', '')).toBe(0);
  });
});
