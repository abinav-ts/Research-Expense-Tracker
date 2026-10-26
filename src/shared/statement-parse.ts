// REQ-CSV-01, REQ-CSV-09: read a bank's CSV text into rows, whatever its layout: lines before the header, comma /
// semicolon / tab / pipe, quoted fields, blank lines. Pure (Papa Parse works on a string without any browser API).
import Papa from 'papaparse';

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
}
export type ParseOutcome = { ok: true; statement: RawStatement } | { ok: false; error: string };

const DELIMITERS = [',', ';', '\t', '|'];
const DATE_WORD = /\b(date|dt)\b/i;
const AMOUNT_WORD = /\b(debit|withdraw\w*|dr|amount|credit|deposit\w*|cr|paid out|money out)\b/i;
const HEADER_WORD = /\b(date|dt|narration|description|particulars|remarks|details|debit|withdraw\w*|credit|deposit\w*|balance|amount|ref\w*|chq|cheque|utr)\b/i;

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
  const headerIndex = rows.findIndex((r) => looksLikeHeader(r.cells));
  if (headerIndex === -1) {
    return { ok: false, error: 'Could not find the row that names the columns (one with a date and an amount or debit column). Is this your bank\'s statement?' };
  }
  const header = rows[headerIndex]!;
  const body = rows.slice(headerIndex + 1).filter((r) => r.cells.some(Boolean));
  if (body.length === 0) return { ok: false, error: 'The statement has column names but no rows under them.' };
  return { ok: true, statement: { delimiter, headers: header.cells, preambleLines: header.line - 1, rows: body } };
}
