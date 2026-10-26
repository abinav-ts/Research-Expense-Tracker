import { describe, expect, it } from 'vitest';
import { applyMapping, guessMapping, parseStatementAmount, parseStatementDate, type StatementMapping } from '../../src/shared/statement-map.ts';
import { parseStatementText } from '../../src/shared/statement-parse.ts';

const load = (text: string) => {
  const r = parseStatementText(text);
  if (!r.ok) throw new Error(r.error);
  const g = guessMapping(r.statement.headers, r.statement.rows);
  return { statement: r.statement, g, applied: applyMapping(r.statement.rows, g.mapping as StatementMapping) };
};
const amount = (t: string, decimalComma = false) => parseStatementAmount(t, { decimalComma });

describe('REQ-CSV-09: files without a usable header row', () => {
  const DATA_ONLY = ['12/11/2026,UPI-SHOP A,R001,"1,200.50",,"98,799.50"', '13/11/2026,NEFT-SALARY,R002,,"50,000.00","1,48,799.50"', '14/11/2026,ATM WDL,R003,"5,000.00",,"1,43,799.50"'].join('\n');

  it('REQ-CSV-09: a file that is only transactions (no column names) is read: the columns are guessed from what is in them', () => {
    const { statement, g, applied } = load(DATA_ONLY);
    expect(statement.headerless).toBe(true);
    expect(statement.headers).toEqual(['Column 1', 'Column 2', 'Column 3', 'Column 4', 'Column 5', 'Column 6']);
    expect(g.mapping).toMatchObject({ date: 0, description: 1, reference: 2, debit: 3, credit: 4, balance: 5, dateFormat: 'dmy' });
    expect(applied.debits.map((d) => d.debitMinor)).toEqual([120_050, 500_000]);
    expect(applied.creditCount).toBe(1);
  });

  it('REQ-CSV-09: the heading lines above headerless data are left out, and the first data line is where reading starts', () => {
    const { statement } = load('Statement for account X\nPeriod 01/11/2026 to 30/11/2026\n' + DATA_ONLY);
    expect(statement.rows[0]!.cells[0]).toBe('12/11/2026');
    expect(statement.preambleLines).toBe(2);
  });

  it('REQ-CSV-09: a long reference number of digits is not mistaken for an amount column', () => {
    const { g } = load(['12/11/2026,UPI-SHOP,0000000101,"1,200.50","98,799.50"', '13/11/2026,UPI-CAFE,0000000102,"560.00","98,239.50"'].join('\n'));
    expect(g.mapping.reference).toBe(2);
    expect(g.mapping.balance).toBe(4);
  });

  it('REQ-CSV-09: unusual column names are read from the content: "Posting / Transaction Details / Out / In / Running"', () => {
    const { g, applied } = load(['Posting;Transaction Details;Out;In;Running', '12/11/2026;Shop A;1200.50;;98799.50', '13/11/2026;Salary;;50000.00;148799.50'].join('\n'));
    expect(g.mapping).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3, balance: 4 });
    expect(applied.debits).toHaveLength(1);
  });

  it('REQ-CSV-09: no rows of transactions at all gives a plain message', () => {
    const r = parseStatementText('Just some text\nwith,a,comma but no dates\nand more\n');
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toContain('Could not find the rows of transactions');
  });
});

describe('REQ-CSV-02: more ways banks name and lay out columns', () => {
  const guessed = (header: string, row: string) => load(`${header}\n${row}\n`).g.mapping;

  it('REQ-CSV-02: debit and credit named Withdrawals / Deposits, Paid out / Paid in, Debit Amount / Credit Amount, Dr / Cr amounts', () => {
    expect(guessed('Date,Details,Withdrawals,Deposits,Balance', '12/11/2026,Shop,10.00,,90.00')).toMatchObject({ debit: 2, credit: 3 });
    expect(guessed('Date,Description,Paid out,Paid in,Balance', '12/11/2026,Shop,10.00,,90.00')).toMatchObject({ debit: 2, credit: 3 });
    expect(guessed('Txn Date,Narrative,Debit Amount (INR),Credit Amount (INR),Balance (INR)', '12/11/2026,Shop,10.00,,90.00')).toMatchObject({ debit: 2, credit: 3, balance: 4 });
    expect(guessed('Date,Remarks,Dr Amount,Cr Amount,Bal', '12/11/2026,Shop,10.00,,90.00')).toMatchObject({ debit: 2, credit: 3 });
  });

  it('REQ-CSV-02: reference columns named Cheque No, Instrument No, UTR No, Transaction ID, Txn Ref are found, and a date column is never taken for one', () => {
    for (const name of ['Cheque No', 'Instrument No', 'UTR No', 'Transaction ID', 'Txn Ref No']) {
      expect(guessed(`Date,Narration,${name},Debit,Credit`, '12/11/2026,Shop,R1,10.00,'), name).toMatchObject({ reference: 2 });
    }
  });

  it('REQ-CSV-02: two date columns: the transaction date wins over the value date, wherever it sits', () => {
    expect(guessed('Value Date,Transaction Date,Narration,Debit,Credit', '13/11/2026,12/11/2026,Shop,10.00,')).toMatchObject({ date: 1 });
    expect(guessed('Date,Value Dt,Narration,Debit,Credit', '12/11/2026,13/11/2026,Shop,10.00,')).toMatchObject({ date: 0 });
  });

  it('REQ-CSV-02: a Type column with words (WITHDRAWAL / DEPOSIT / PAYMENT) gives the direction of a single amount column', () => {
    const { applied } = load(['Date,Details,Type,Amount', '12/11/2026,Shop,WITHDRAWAL,560.00', '13/11/2026,Pay,DEPOSIT,250.00', '14/11/2026,Card,Payment,100.00', '15/11/2026,Back,Refund,40.00'].join('\n'));
    expect(applied.debits.map((d) => d.debitMinor)).toEqual([56_000, 10_000]);
    expect(applied.creditCount).toBe(2);
  });

  it('REQ-CSV-02: header cells with line breaks, extra spaces and quotes are tidied, and the layout is still recognised', () => {
    const { statement, g } = load('"Txn\nDate" , "  Narration " ,"Withdrawal\nAmt." ,Deposit Amt.\n12/11/2026,Shop,10.00,\n');
    expect(statement.headers).toEqual(['Txn Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.']);
    expect(g.mapping).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3 });
  });

  it('REQ-CSV-02: account details with commas above the table do not confuse the delimiter or the header search', () => {
    const { statement, applied } = load(['Name, SAMPLE HOLDER, Branch, X', 'Account, 0000, IFSC, ABCD0000', 'Date,Narration,Debit,Credit', '12/11/2026,Shop,10.00,'].join('\n'));
    expect(statement.headers).toEqual(['Date', 'Narration', 'Debit', 'Credit']);
    expect(applied.debits).toHaveLength(1);
  });
});

describe('REQ-CSV-09: dates in every style seen in statements', () => {
  it('REQ-CSV-09: a leading weekday, a trailing time, an ISO "T" time and quotes are all ignored', () => {
    expect(parseStatementDate('Thu, 12 Nov 2026', 'dMonY')).toBe('2026-11-12');
    expect(parseStatementDate('Thursday 12-Nov-2026', 'dMonY')).toBe('2026-11-12');
    expect(parseStatementDate('12/11/2026 10:42:01 AM', 'dmy')).toBe('2026-11-12');
    expect(parseStatementDate('2026-11-12T10:42:01+05:30', 'ymd')).toBe('2026-11-12');
    expect(parseStatementDate('"12/11/2026"', 'dmy')).toBe('2026-11-12');
  });

  it('REQ-CSV-09: month first with a name ("Nov 12, 2026", "November 12th 2026") is its own style and is guessed from the column', () => {
    expect(parseStatementDate('Nov 12, 2026', 'monDY')).toBe('2026-11-12');
    expect(parseStatementDate('November 12th 2026', 'monDY')).toBe('2026-11-12');
    expect(parseStatementDate('Nov. 12 26', 'monDY')).toBe('2026-11-12');
    const { g, applied } = load('Date,Description,Amount\n"Nov 12, 2026",Shop,-10.00\n"Nov 13, 2026",Pay,20.00\n');
    expect(g.mapping.dateFormat).toBe('monDY');
    expect(applied.debits).toHaveLength(1);
  });

  it('REQ-CSV-09: month names with a dot or a ordinal and two-digit years read in the day-first named style', () => {
    expect(parseStatementDate('12th Nov. 26', 'dMonY')).toBe('2026-11-12');
    expect(parseStatementDate('1 Sept 2026', 'dMonY')).toBe('2026-09-01');
  });

  it('REQ-CSV-09: impossible dates (31 Feb, month 13, day 0) are not dates in any style', () => {
    for (const bad of ['31/02/2026', '12/13/2026x', '00/11/2026', '2026-13-01']) {
      expect(parseStatementDate(bad, 'dmy') ?? parseStatementDate(bad, 'ymd'), bad).toBeUndefined();
    }
  });
});

describe('REQ-CSV-09: amounts in every notation seen in statements', () => {
  const minor = (t: string, comma = false) => amount(t, comma)?.minor;

  it('REQ-CSV-09: currency words and symbols before or after the number are ignored (₹, Rs, Rs., INR, "rupees")', () => {
    for (const written of ['₹560.00', 'Rs 560.00', 'Rs.560.00', 'INR 560.00', '560.00 INR', '560.00 Rs', '560.00 ₹', 'inr560']) expect(minor(written), written).toBe(56_000);
  });

  it('REQ-CSV-09: a Unicode minus, an en dash, a trailing minus and brackets all mean "negative"', () => {
    for (const written of ['−560.00', '–560.00', '560.00−', '560.00-', '(560.00)']) expect(amount(written)?.negative, written).toBe(true);
  });

  it('REQ-CSV-09: Dr / Cr before or after, in any case, with or without a dot', () => {
    expect(amount('560.00 DR')).toMatchObject({ minor: 56_000, drcr: 'dr' });
    expect(amount('Dr. 560.00')).toMatchObject({ minor: 56_000, drcr: 'dr' });
    expect(amount('560.00cr')).toMatchObject({ minor: 56_000, drcr: 'cr' });
    expect(amount('CR 1,23,456.78')).toMatchObject({ minor: 12_345_678, drcr: 'cr' });
  });

  it('REQ-CSV-09: non-breaking and thin spaces are ordinary spaces', () => {
    expect(minor('₹ 560.00')).toBe(56_000);
    expect(minor('560.00 ')).toBe(56_000);
  });

  it('REQ-CSV-09: with a decimal comma: 1.234,56 · 1 234,56 · 1 234,56 · 560,5 · 0,07 read exactly; without it they are refused, never guessed', () => {
    expect(minor('1.234,56', true)).toBe(123_456);
    expect(minor('1 234,56', true)).toBe(123_456);
    expect(minor('1 234,56', true)).toBe(123_456);
    expect(minor('560,5', true)).toBe(56_050);
    expect(minor('0,07', true)).toBe(7);
    expect(amount('1.234,56', false)).toBeUndefined();
    expect(amount('5 600.00', false)).toBeUndefined(); // ambiguous: never guessed
  });

  it('REQ-CSV-09: a file written with a decimal comma is detected and read: ";" separated, dates with dots', () => {
    const { g, applied } = load(['Datum;Verwendungszweck;Betrag;Saldo', '12.11.2026;Shop A;-1.234,56;5.000,00', '13.11.2026;Gehalt;2.500,00;7.500,00'].join('\n'));
    expect(g.mapping.decimalComma).toBe(true);
    expect(applied.debits.map((d) => d.debitMinor)).toEqual([123_456]);
    expect(applied.creditCount).toBe(1);
  });

  it('REQ-CSV-09: not-an-amount stays "not an amount": words, doubled signs, letters inside, nothing after the sign', () => {
    for (const bad of ['abc', '--5', '5.5.5', '12a', '1,2,3', '₹', '-']) expect([undefined, null], bad).toContainEqual(amount(bad));
    expect(amount('₹')).toBeUndefined();
    expect(amount('abc')).toBeUndefined();
  });
});

describe('REQ-CSV-09: messy rows', () => {
  const HEAD = 'Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance\n';

  it('REQ-CSV-09: rows with fewer or more cells than the header, blank lines, and rows of only commas are tolerated', () => {
    const { applied } = load(HEAD + '12/11/2026,Short row,R1,10.00\n\n,,,,,\n13/11/2026,Long row,R2,5.00,,100.00,extra,more\n14/11/2026,Normal,R3,7.00,,50.00\n');
    expect(applied.debits.map((d) => d.debitMinor)).toEqual([1000, 500, 700]);
  });

  it('REQ-CSV-09: totals and footers in the middle of the file are listed and skipped, and every other row still loads', () => {
    const { applied } = load(HEAD + '12/11/2026,A,R1,10.00,,90.00\nPage total,,,10.00,,\n13/11/2026,B,R2,20.00,,70.00\nContinued on next page,,,,,\n14/11/2026,C,R3,30.00,,40.00\n');
    expect(applied.debits.map((d) => d.narration)).toEqual(['A', 'B', 'C']);
    expect(applied.problems).toHaveLength(2);
  });

  it('REQ-CSV-09: a row with a date but an unreadable amount is reported with its line, not dropped silently', () => {
    const { applied } = load(HEAD + '12/11/2026,A,R1,ten rupees,,90.00\n13/11/2026,B,R2,20.00,,70.00\n');
    expect(applied.problems).toEqual([{ line: 2, reason: 'the amount could not be read' }]);
    expect(applied.debits).toHaveLength(1);
  });

  it('REQ-CSV-09: a very long narration is cut to 300 characters so storage stays bounded', () => {
    const { applied } = load(HEAD + `12/11/2026,${'X'.repeat(1000)},R1,10.00,,90.00\n`);
    expect(applied.debits[0]!.narration).toHaveLength(300);
  });

  it('REQ-CSV-09: Windows line endings, old Mac line endings and a missing final newline all read the same', () => {
    const rows = ['12/11/2026,A,R1,10.00,,90.00', '13/11/2026,B,R2,20.00,,70.00'];
    for (const eol of ['\n', '\r\n', '\r']) {
      expect(load(HEAD.replace(/\n/, eol) + rows.join(eol)).applied.debits, JSON.stringify(eol)).toHaveLength(2);
    }
  });

  it('REQ-CSV-09: a statement that holds only credits loads, with no debits and a credit count (the screen can say so)', () => {
    const { applied } = load(HEAD + '12/11/2026,Salary,R1,,5000.00,5000.00\n');
    expect(applied.debits).toEqual([]);
    expect(applied.creditCount).toBe(1);
  });

  it('REQ-CSV-09: the same statement read twice gives identical rows and fingerprints (nothing depends on the clock or on order of calls)', () => {
    const text = HEAD + '12/11/2026,A,R1,10.00,,90.00\n12/11/2026,A,R1,10.00,,80.00\n';
    expect(load(text).applied.debits).toEqual(load(text).applied.debits);
  });
});
