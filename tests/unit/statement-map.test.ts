import { describe, expect, it } from 'vitest';
import { applyMapping, guessDateFormat, guessMapping, missingParts, parseStatementAmount, parseStatementDate, profileKey, type StatementMapping } from '../../src/shared/statement-map.ts';
import { parseStatementText } from '../../src/shared/statement-parse.ts';

// Synthetic statements in the styles banks use. None is a real bank's file or data.
const LAYOUT_A = [
  'Statement of Account', 'Account No: 000', '',
  'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
  '12/11/26,UPI-SHOP A,R001,12/11/26,"1,200.50",,"98,799.50"', '13/11/26,NEFT-SALARY,R002,13/11/26,,"50,000.00","1,48,799.50"',
].join('\n');
const LAYOUT_B = [
  'S No.,Value Date,Transaction Date,Cheque Number,Transaction Remarks,Withdrawal Amount (INR ),Deposit Amount (INR ),Balance (INR )',
  '1,12/11/2026,13/11/2026,,UPI/SHOP B/123,"560.00",0.00,"1,000.00"', '2,14/11/2026,14/11/2026,,REFUND,0.00,"100.00","1,100.00"',
].join('\n');
const LAYOUT_C = [
  'Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance',
  '12 Nov 2026,12 Nov 2026,CARD SHOP C,R9,"2,000.00",,"5,000.00"', '15 Nov 2026,15 Nov 2026,INTEREST,R10,,3.00,"5,003.00"',
].join('\n');
const LAYOUT_SIGNED = ['Date;Description;Amount;Balance', '2026-11-12;Shop D;-560.00;1000.00', '2026-11-13;Pay in;250.00;1250.00'].join('\n');
const LAYOUT_DRCR = ['Date,Details,Amount,Dr/Cr,Balance', '12-11-2026,Shop E,560.00,Dr,1000.00', '13-11-2026,Pay in,250.00,Cr,1250.00'].join('\n');

const guess = (text: string) => {
  const r = parseStatementText(text);
  if (!r.ok) throw new Error(r.error);
  const g = guessMapping(r.statement.headers, r.statement.rows);
  return { headers: r.statement.headers, g, applied: applyMapping(r.statement.rows, g.mapping as StatementMapping) };
};

describe('REQ-CSV-02: column mapping', () => {
  it('REQ-CSV-02: "Date / Narration / Chq./Ref.No. / Withdrawal Amt. / Deposit Amt. / Closing Balance" maps date, description, reference, debit, credit and balance', () => {
    const { g } = guess(LAYOUT_A);
    expect(g.mapping).toEqual({ date: 0, description: 1, reference: 2, debit: 4, credit: 5, balance: 6, dateFormat: 'dmy' });
    expect(g.missing).toEqual([]);
  });

  it('REQ-CSV-02: a second layout (Transaction Date beats Value Date; amounts in "(INR )" columns) maps correctly', () => {
    const { g, applied } = guess(LAYOUT_B);
    expect(g.mapping).toMatchObject({ date: 2, description: 4, debit: 5, credit: 6, balance: 7, reference: 3, dateFormat: 'dmy' });
    expect(applied.debits.map((d) => [d.date, d.debitMinor])).toEqual([['2026-11-13', 56_000]]);
    expect(applied.creditCount).toBe(1);
  });

  it('REQ-CSV-02: a third layout with the month written out maps the Description and Debit columns and reads "12 Nov 2026"', () => {
    const { g, applied } = guess(LAYOUT_C);
    expect(g.mapping).toMatchObject({ date: 0, description: 2, debit: 4, credit: 5, dateFormat: 'dMonY' });
    expect(applied.debits).toMatchObject([{ date: '2026-11-12', narration: 'CARD SHOP C', debitMinor: 200_000, refNo: 'R9' }]);
  });

  it('REQ-CSV-02: one signed Amount column maps as an amount: negative is money out', () => {
    const { g, applied } = guess(LAYOUT_SIGNED);
    expect(g.mapping).toMatchObject({ date: 0, description: 1, amount: 2, balance: 3, dateFormat: 'ymd' });
    expect(applied.debits.map((d) => d.debitMinor)).toEqual([56_000]);
    expect(applied.creditCount).toBe(1);
  });

  it('REQ-CSV-02: an Amount column with a separate Dr/Cr column maps both and reads the direction from it', () => {
    const { g, applied } = guess(LAYOUT_DRCR);
    expect(g.mapping).toMatchObject({ date: 0, description: 1, amount: 2, drcr: 3, balance: 4 });
    expect(applied.debits.map((d) => [d.narration, d.debitMinor])).toEqual([['Shop E', 56_000]]);
    expect(applied.creditCount).toBe(1);
  });

  it('REQ-CSV-02: the balance column is never read as an amount, even when it is the only number in a row', () => {
    const { applied } = guess(LAYOUT_A);
    expect(applied.debits.map((d) => d.debitMinor)).toEqual([120_050]); // not 98,799.50
  });

  it('REQ-CSV-02: the layout is named by its header row, so the next statement from the same bank finds the same mapping', () => {
    expect(profileKey(guess(LAYOUT_A).headers)).toBe(profileKey(guess(LAYOUT_A.replace('12/11/26', '20/11/26')).headers));
    expect(profileKey(guess(LAYOUT_A).headers)).not.toBe(profileKey(guess(LAYOUT_B).headers));
    expect(profileKey(['Date ', 'NARRATION'])).toBe(profileKey(['date', 'Narration']));
  });

  it('REQ-CSV-02: an incomplete mapping says what is missing, in words', () => {
    expect(missingParts({ dateFormat: 'dmy' } as Partial<StatementMapping>)).toEqual(['the date column', 'the description (narration) column', 'the debit (withdrawal) column or an amount column']);
    expect(missingParts({ date: 0, description: 1, debit: 2 })).toEqual([]);
    expect(missingParts({ date: 0, description: 1, amount: 2 })).toEqual([]);
  });

  it('REQ-CSV-02: day-first is chosen when a first number exceeds 12, month-first when a second does, and ISO and month names are recognised', () => {
    expect(guessDateFormat(['12/11/2026', '25/11/2026'])).toBe('dmy');
    expect(guessDateFormat(['11/12/2026', '11/25/2026'])).toBe('mdy');
    expect(guessDateFormat(['01/02/2026', '03/04/2026'])).toBe('dmy'); // ambiguous: day first, as in India
    expect(guessDateFormat(['2026-11-12'])).toBe('ymd');
    expect(guessDateFormat(['12-Nov-2026', '3 Dec 2026'])).toBe('dMonY');
  });

  it('REQ-CSV-02: dates are read in the chosen style, with any separator, a 2- or 4-digit year, and a trailing time', () => {
    expect(parseStatementDate('12/11/2026', 'dmy')).toBe('2026-11-12');
    expect(parseStatementDate('12-11-26', 'dmy')).toBe('2026-11-12');
    expect(parseStatementDate('12.11.2026 10:42:01', 'dmy')).toBe('2026-11-12');
    expect(parseStatementDate('11/12/2026', 'mdy')).toBe('2026-11-12');
    expect(parseStatementDate('2026-11-12', 'ymd')).toBe('2026-11-12');
    expect(parseStatementDate('12-Nov-2026', 'dMonY')).toBe('2026-11-12');
    expect(parseStatementDate('12 November 26', 'dMonY')).toBe('2026-11-12');
    expect(parseStatementDate('31/02/2026', 'dmy')).toBeUndefined();
    expect(parseStatementDate('hello', 'dmy')).toBeUndefined();
    expect(parseStatementDate('12/11/2026', 'ymd')).toBeUndefined();
  });
});

describe('REQ-CSV-09: amounts as banks write them', () => {
  const minor = (text: string) => parseStatementAmount(text)?.minor;
  it('REQ-CSV-09: 1,23,456.78 · 1,234.56 · ₹ 560.00 · Rs.560 · 560.00 Dr · (560.00) · -560.00 · 560.00- all read as exact paise', () => {
    expect(minor('1,23,456.78')).toBe(12_345_678);
    expect(minor('1,234.56')).toBe(123_456);
    expect(minor('₹ 560.00')).toBe(56_000);
    expect(minor('Rs.560')).toBe(56_000);
    expect(minor('INR 560.5')).toBe(56_050);
    expect(minor('560.00 Dr')).toBe(56_000);
    expect(minor('(560.00)')).toBe(56_000);
    expect(minor('-560.00')).toBe(56_000);
    expect(minor('560.00-')).toBe(56_000);
  });

  it('REQ-CSV-09: the sign and the Dr/Cr marker are reported with the number', () => {
    expect(parseStatementAmount('(560.00)')).toEqual({ minor: 56_000, negative: true });
    expect(parseStatementAmount('-560.00')).toEqual({ minor: 56_000, negative: true });
    expect(parseStatementAmount('560.00 Dr')).toEqual({ minor: 56_000, negative: false, drcr: 'dr' });
    expect(parseStatementAmount('Cr 560.00')).toEqual({ minor: 56_000, negative: false, drcr: 'cr' });
    expect(parseStatementAmount('560.00')).toEqual({ minor: 56_000, negative: false });
  });

  it('REQ-CSV-09: blank cells, dashes and "nil" mean "no amount here"; words and malformed numbers are "not an amount"', () => {
    for (const none of ['', '  ', '-', '--', 'NIL', 'n/a']) expect(parseStatementAmount(none), none).toBeNull();
    for (const bad of ['abc', '12,34', '1.234', '1..5']) expect(parseStatementAmount(bad), bad).toBeUndefined();
  });

  it('REQ-CSV-09: no floating-point error: ₹0.10 + ₹0.20 style amounts stay exact', () => {
    expect(minor('0.10')! + minor('0.20')!).toBe(30);
    expect(minor('4,999,999.99')).toBe(499_999_999);
  });

  it('REQ-CSV-09: a zero debit is not a transaction', () => {
    const { applied } = guess(LAYOUT_B);
    expect(applied.debits.every((d) => d.debitMinor > 0)).toBe(true);
  });
});
