// REQ-CSV-01, REQ-CSV-09: read a bank's CSV text into rows, whatever its layout: lines before the header, comma /
// semicolon / tab / pipe, quoted fields, blank lines. Pure (Papa Parse works on a string without any browser API).
import Papa from 'papaparse';
import { looksLikeDate } from './statement-map.ts';

export const MAX_STATEMENT_BYTES = 5_000_000;
export const MAX_STATEMENT_LINES = 50_000;

export interface RawRow {
  /** Line of the file where the row starts (1-based), for messages like "line 14 could not be read". */
  line: number;
  cells: string[];
}
export interface RawStatement {
  delimiter: string;
  headers: string[];
  /** Everything above the header row: account details, period and so on. Never used or stored. */
  preambleLines: number;
  rows: RawRow[];
  /** True when the file has no row of column names: the columns are called Column 1, Column 2 ... and guessed from their contents. */
  headerless?: boolean;
}
export type ParseOutcome = { ok: true; statement: RawStatement } | { ok: false; error: string };

const DELIMITERS = [',', ';', '\t', '|'];
const DATE_WORD = /\b(date|dt|dated)\b/i;
const AMOUNT_WORD = /\b(debit\w*|withdraw\w*|dr|amount|amt|credit\w*|deposit\w*|cr|paid out|paid in|money out|money in|value)\b/i;
const HEADER_WORD = /\b(date|dt|narration|description|particulars|remarks|details|narrative|memo|payee|debit\w*|withdraw\w*|credit\w*|deposit\w*|balance|bal|amount|amt|ref\w*|chq|cheque|utr|type|txn|transaction)\b/i;

/** The delimiter that gives the most rows of one consistent, wide shape (account details above the table do not decide it). */
function guessDelimiter(sample: string): string {
  let best = ',';
  let bestScore = -1;
  for (const delimiter of DELIMITERS) {
    const widths = Papa.parse<string[]>(sample, { delimiter, skipEmptyLines: 'greedy' }).data.map((r) => r.length);
    const counts = new Map<number, number>();
    for (const w of widths) if (w >= 3) counts.set(w, (counts.get(w) ?? 0) + 1);
    const top = Math.max(0, ...counts.values());
    if (top > bestScore) {
      bestScore = top;
      best = delimiter;
    }
  }
  return best;
}

const looksLikeHeader = (cells: string[]): boolean => {
  const filled = cells.map((c) => c.trim()).filter(Boolean);
  return filled.length >= 3 && filled.some((c) => DATE_WORD.test(c)) && filled.some((c) => AMOUNT_WORD.test(c)) && filled.filter((c) => HEADER_WORD.test(c)).length >= 2;
};

export function parseStatementText(input: string): ParseOutcome {
  const text = input.replace(/^﻿/, '');
  if (text.length > MAX_STATEMENT_BYTES) return { ok: false, error: 'This file is larger than 5 MB, which is too big for a statement. Download a shorter period from your bank.' };
  if (text.includes('\u0000') || (text.match(/[\u0001-\u0008\u000E-\u001F]/g)?.length ?? 0) > 20) {
    return { ok: false, error: 'This file cannot be read as a statement. Choose the CSV file from your bank (not a PDF or a picture).' };
  }
  if (text.split('\n').length > MAX_STATEMENT_LINES) return { ok: false, error: 'This file has more than 50,000 lines, which is too many for a statement. Download a shorter period from your bank.' };

  const delimiter = guessDelimiter(text.slice(0, 200_000));

  // Where each line starts, so a row's line number is found by search instead of by counting from the top every time.
  const lineStarts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) lineStarts.push(i + 1);
  const lineAt = (offset: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  const all: RawRow[] = [];
  let rowStart = 0; // Papa Parse reports where each row ENDS (meta.cursor); a row starts where the previous one ended
  Papa.parse<string[]>(text, {
    delimiter,
    // Blank lines are kept here (and dropped below) so that every row's start position, and so its line number, stays exact.
    step: (result) => {
      all.push({ line: lineAt(rowStart), cells: result.data.map((c) => c.trim()) });
      rowStart = result.meta.cursor;
    },
  });
  const rows = all.filter((r) => r.cells.some(Boolean));
  // 1. A row that names a date and an amount column. 2. Failing that, the text row just above the first row that holds a date.
  // 3. Failing that, a file with no header at all: the first row that holds a date starts the data.
  const hasDate = (r: RawRow) => r.cells.some((c) => c && looksLikeDate(c));
  const wide = (r: RawRow) => r.cells.filter(Boolean).length >= 3;
  let headerIndex = rows.findIndex((r) => looksLikeHeader(r.cells));
  if (headerIndex === -1) {
    const firstData = rows.findIndex((r) => wide(r) && hasDate(r));
    if (firstData > 0 && wide(rows[firstData - 1]!) && !hasDate(rows[firstData - 1]!)) headerIndex = firstData - 1;
    else if (firstData >= 0) {
      const body = rows.slice(firstData);
      const width = Math.max(...body.map((r) => r.cells.length));
      return { ok: true, statement: { delimiter, headers: Array.from({ length: width }, (_, i) => `Column ${i + 1}`), preambleLines: rows[firstData]!.line - 1, rows: body, headerless: true } };
    }
  }
  if (headerIndex === -1) {
    return { ok: false, error: 'Could not find the rows of transactions: no row has a date and an amount. Is this your bank\'s statement?' };
  }
  const header = rows[headerIndex]!;
  const body = rows.slice(headerIndex + 1).filter((r) => r.cells.some(Boolean));
  if (body.length === 0) return { ok: false, error: 'The statement has column names but no rows under them.' };
  return { ok: true, statement: { delimiter, headers: header.cells.map((c) => c.replace(/\s+/g, ' ').trim().replace(/^"+|"+$/g, '').trim()), preambleLines: header.line - 1, rows: body } };
}
