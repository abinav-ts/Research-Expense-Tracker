import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyMapping, guessMapping, type StatementMapping } from '../../src/shared/statement-map.ts';
import { MAX_STATEMENT_BYTES, parseStatementText } from '../../src/shared/statement-parse.ts';

const sample = readFileSync(join(import.meta.dirname, '../../fixtures/sample-statement.csv'), 'utf8');
const parsed = (text: string) => {
  const r = parseStatementText(text);
  if (!r.ok) throw new Error(r.error);
  return r.statement;
};
const read = (text: string) => {
  const s = parsed(text);
  const g = guessMapping(s.headers, s.rows);
  return { s, g, applied: applyMapping(s.rows, g.mapping as StatementMapping) };
};

describe('REQ-CSV-01: reading a CSV on the device', () => {
  it('REQ-CSV-01: the sample statement is read in well under a second', () => {
    const t0 = performance.now();
    const { applied } = read(sample);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(applied.debits.length).toBeGreaterThan(10);
  });

  it('REQ-CSV-01: a byte-order mark at the start does not spoil the first column name', () => {
    expect(parsed('﻿' + 'Date,Narration,Withdrawal Amt.,Deposit Amt.\n01/11/26,x,5.00,\n').headers[0]).toBe('Date');
  });

  it('REQ-CSV-01: a file over 5 MB is refused with a message, and nothing is parsed', () => {
    const r = parseStatementText('Date,Narration,Debit\n' + '01/11/26,x,1.00\n'.repeat(Math.ceil(MAX_STATEMENT_BYTES / 15) + 1));
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toContain('larger than 5 MB');
  });

  it('REQ-CSV-01: a file with more than 50,000 lines is refused', () => {
    const r = parseStatementText('Date,Narration,Debit\n' + '1,x,1\n'.repeat(50_001));
    expect(!r.ok && r.error).toContain('50,000 lines');
  });

  it('REQ-CSV-01: a file that is not text (a picture or PDF renamed .csv) is refused', () => {
    const r = parseStatementText('%PDF-1.4\u0000\u0001\u0002 binary \u0000');
    expect(!r.ok && r.error).toContain('cannot be read as a statement');
  });

  it('REQ-CSV-01: text with no column-naming row says so, and a header with no rows says so', () => {
    expect(parseStatementText('hello\nthere,again,friend\n')).toMatchObject({ ok: false });
    const none = parseStatementText('Date,Narration,Debit\n');
    expect(!none.ok && none.error).toContain('no rows');
  });
});

describe('REQ-CSV-09: real-world layouts', () => {
  it('REQ-CSV-09: the sample has 7 lines of account details above the header, and the header is still found', () => {
    const s = parsed(sample);
    expect(s.preambleLines).toBe(7); // six lines of details and a blank line; the header is on line 8
    expect(s.headers).toEqual(['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance']);
  });

  it('REQ-CSV-09: the sample reads as 14 debits and 2 credits, with footer lines listed as unreadable, not fatal', () => {
    const { applied } = read(sample);
    expect(applied.debits).toHaveLength(14);
    expect(applied.creditCount).toBe(2);
    expect(applied.problems.length).toBeGreaterThanOrEqual(4); // opening, total, closing and generated-on lines
    expect(applied.problems.every((p) => p.line > 8 && p.reason.length > 0)).toBe(true);
  });

  it('REQ-CSV-09: Indian grouping, plain and quoted amounts all read as exact paise', () => {
    const { applied } = read(sample);
    const byRef = new Map(applied.debits.map((d) => [d.refNo, d.debitMinor]));
    expect(byRef.get('0000000101')).toBe(124_550); // "1,245.50"
    expect(byRef.get('0000000109')).toBe(1_723_055); // "17,230.55"
    expect(byRef.get('0000000114')).toBe(56_000); // 560.00 unquoted
    expect(applied.debits.every((d) => Number.isSafeInteger(d.debitMinor))).toBe(true);
  });

  it('REQ-CSV-09: a semicolon-separated file reads like a comma one', () => {
    const { s, applied } = read('Account: 12345;;;\nDate;Description;Amount;Balance\n2026-11-12;Shop A;-560,00;1000,00\n'.replace(/,/g, '.').replace(/;/g, ';'));
    expect(s.delimiter).toBe(';');
    expect(applied.debits).toHaveLength(1);
  });

  it('REQ-CSV-09: tab and pipe separated files are read too', () => {
    for (const d of ['\t', '|']) {
      const text = ['Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.'].join(d) + '\n' + ['12/11/2026', 'Shop', '10.00', ''].join(d) + '\n';
      expect(parsed(text).delimiter).toBe(d);
      expect(read(text).applied.debits).toHaveLength(1);
    }
  });

  it('REQ-CSV-09: a quoted field with a comma or a line break inside stays one field', () => {
    const { applied } = read('Date,Narration,Withdrawal Amt.,Deposit Amt.\n12/11/2026,"SHOP, THE ONE\nBRANCH 2",10.00,\n13/11/2026,Plain,5.00,\n');
    expect(applied.debits).toHaveLength(2);
    expect(applied.debits[0]!.narration).toBe('SHOP, THE ONE BRANCH 2');
    expect(applied.debits[1]!.line).toBe(4); // the line number counts the line break
  });

  it('REQ-CSV-09: rows that cannot be read are listed with their line and a reason, and the rest still load', () => {
    const { applied } = read('Date,Narration,Withdrawal Amt.,Deposit Amt.\n12/11/2026,Good,10.00,\nnot a date,Bad date,5.00,\n13/11/2026,No amount,,\n14/11/2026,Bad amount,abc,\n15/11/2026,Also good,7.00,\n');
    expect(applied.debits.map((d) => d.narration)).toEqual(['Good', 'Also good']);
    expect(applied.problems.map((p) => p.line)).toEqual([3, 4, 5]);
    expect(applied.problems.map((p) => p.reason).join(' ')).toMatch(/not a date.*no amount.*amount could not be read/s);
  });

  it('REQ-CSV-09: a file where nothing is readable gives no debits, plainly', () => {
    expect(read('Date,Narration,Withdrawal Amt.,Deposit Amt.\nx,y,z,\n').applied.debits).toEqual([]);
  });

  it('REQ-CSV-09: identical rows get different fingerprints, and the same row always gets the same one', () => {
    const text = 'Date,Narration,Withdrawal Amt.,Deposit Amt.\n12/11/2026,Coffee,100.00,\n12/11/2026,Coffee,100.00,\n';
    const [a, b] = read(text).applied.debits;
    expect(a!.rowHash).not.toBe(b!.rowHash);
    expect(read(text).applied.debits.map((d) => d.rowHash)).toEqual([a!.rowHash, b!.rowHash]);
  });
});

describe('REQ-CSV-10: the sample statement', () => {
  it('REQ-CSV-10: it has a debit for each demo expense (IRCTC, cab, hotel) and the foreign registration at ₹17,230.55 not the ₹17,100.00 estimate', () => {
    const debits = read(sample).applied.debits;
    const has = (narration: RegExp, minor: number, date: string) => debits.some((d) => narration.test(d.narration) && d.debitMinor === minor && d.date === date);
    expect(has(/IRCTC/, 185_000, '2026-11-09')).toBe(true);
    expect(has(/UBER/, 64_000, '2026-11-11')).toBe(true);
    expect(has(/HOTEL SAMPLE/, 2_450_000, '2026-11-12')).toBe(true);
    expect(has(/LISBON COMPUTING/, 1_723_055, '2026-11-14')).toBe(true);
  });

  it('REQ-CSV-10: it has unrelated personal rows, a credit refund, a second IRCTC row outside the window, and no real names', () => {
    const debits = read(sample).applied.debits;
    expect(debits.some((d) => /GROCERS|STREAMFLIX|PHARMACY|ATM/.test(d.narration))).toBe(true);
    expect(debits.filter((d) => /IRCTC/.test(d.narration))).toHaveLength(2);
    expect(sample).not.toMatch(/@gmail|@yahoo|\b\d{12,}\b/);
    expect(sample).toContain('synthetic');
  });
});
