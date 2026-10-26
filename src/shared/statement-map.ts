// REQ-CSV-02, REQ-CSV-09: from raw statement rows to debits. Guess the column mapping, read dates and amounts in the many
// ways banks write them, and report what could not be read. Money is integer paise throughout (REQ-NFR-04).
import { makeDate, monthFromWord } from './dates.ts';
import { parseDecimal } from './money.ts';
import type { RawRow } from './statement-parse.ts';

export type DateFormat = 'dmy' | 'mdy' | 'ymd' | 'dMonY';
export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  dmy: 'Day first: 12/11/2026, 12-11-26',
  mdy: 'Month first: 11/12/2026',
  ymd: 'Year first: 2026-11-12',
  dMonY: 'With the month name: 12-Nov-2026, 12 Nov 2026',
};

/** Which columns mean what. Column numbers count from 0. */
export interface StatementMapping {
  date: number;
  description: number;
  reference?: number;
  /** Money out and money in in separate columns (credit optional) ... */
  debit?: number;
  credit?: number;
  /** ... or one signed column (negative = money out) ... */
  amount?: number;
  /** ... optionally with a Dr/Cr column. */
  drcr?: number;
  /** Marked so it is never mistaken for an amount. Never read, stored or sent. */
  balance?: number;
  dateFormat: DateFormat;
}

export interface StatementRow {
  line: number;
  date: string;
  narration: string;
  refNo?: string;
  debitMinor: number;
  /** Fingerprint of the row (date, narration, amount, reference, and which identical row it is). */
  rowHash: string;
}
export interface RowProblem {
  line: number;
  reason: string;
}

// ---- dates ----

/** Reads a date from the start of a cell in the given style; undefined when it does not fit. */
export function parseStatementDate(text: string, format: DateFormat): string | undefined {
  const t = text.trim();
  const year = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));
  if (format === 'ymd') {
    const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t);
    return m ? makeDate(+m[1]!, +m[2]!, +m[3]!) : undefined;
  }
  if (format === 'dMonY') {
    const m = /^(\d{1,2})[-\s/.]*([A-Za-z]{3,9})[-\s/.,]*(\d{4}|\d{2})(?!\d)/.exec(t);
    const month = m && monthFromWord(m[2]!);
    return m && month ? makeDate(year(m[3]!), month, +m[1]!) : undefined;
  }
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/.exec(t);
  if (!m) return undefined;
  return format === 'dmy' ? makeDate(year(m[3]!), +m[2]!, +m[1]!) : makeDate(year(m[3]!), +m[1]!, +m[2]!);
}

/** The style most of a column is written in: any first number above 12 means day first, any second above 12 means month first. */
export function guessDateFormat(samples: string[]): DateFormat {
  const cells = samples.map((s) => s.trim()).filter(Boolean).slice(0, 300);
  if (cells.some((c) => /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(c))) return 'ymd';
  if (cells.some((c) => /^\d{1,2}[-\s/.]*[A-Za-z]{3,9}[-\s/.,]*\d{2,4}/.test(c))) return 'dMonY';
  let firstAbove12 = false;
  let secondAbove12 = false;
  for (const c of cells) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(c);
    if (!m) continue;
    if (+m[1]! > 12) firstAbove12 = true;
    if (+m[2]! > 12) secondAbove12 = true;
  }
  return secondAbove12 && !firstAbove12 ? 'mdy' : 'dmy'; // when both fit, assume day first (India)
}

// ---- amounts ----

export interface StatementAmount {
  minor: number;
  /** True for a minus sign, brackets, or a trailing "-". */
  negative: boolean;
  /** "Dr" / "Cr" written with the number. */
  drcr?: 'dr' | 'cr';
}

/**
 * Reads an amount as banks write it: 1,23,456.78 · 1,234.56 · ₹ 560.00 · Rs.560 · 560.00 Dr · (560.00) · -560.00 · 560.00-.
 * `null` = nothing there (blank or a dash); `undefined` = something that is not an amount.
 */
export function parseStatementAmount(text: string): StatementAmount | null | undefined {
  let t = text.trim();
  if (t === '' || /^[-–—.]+$/.test(t) || /^(nil|n\/a)$/i.test(t)) return null;
  let negative = false;
  let drcr: 'dr' | 'cr' | undefined;
  const bracket = /^\((.*)\)$/.exec(t);
  if (bracket) {
    negative = true;
    t = bracket[1]!.trim();
  }
  const suffix = /\s*\b(dr|cr|debit|credit)\b\.?$/i.exec(t) ?? /^\b(dr|cr|debit|credit)\b\.?\s*/i.exec(t);
  if (suffix) {
    drcr = /^d/i.test(suffix[1]!) ? 'dr' : 'cr';
    t = t.replace(suffix[0], '').trim();
  }
  t = t.replace(/^(₹|rs\.?|inr)\s*/i, '').trim();
  if (t.startsWith('-') || t.startsWith('−')) {
    negative = true;
    t = t.slice(1).trim();
  }
  if (t.endsWith('-')) {
    negative = true;
    t = t.slice(0, -1).trim();
  }
  t = t.replace(/^(₹|rs\.?|inr)\s*/i, '');
  const parsed = parseDecimal(t, 2);
  if (!parsed.ok) return undefined;
  return { minor: parsed.value, negative, ...(drcr && { drcr }) };
}

// ---- guessing the mapping ----

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** One name for a bank's layout, so its mapping can be remembered: the header row, lower-cased. */
export function profileKey(headers: string[]): string {
  return headers.map(norm).join('|');
}

function best(headers: string[], score: (h: string) => number): number | undefined {
  let index: number | undefined;
  let top = 0;
  headers.forEach((h, i) => {
    const s = score(norm(h));
    if (s > top) {
      top = s;
      index = i;
    }
  });
  return index;
}

export interface GuessedMapping {
  mapping: Partial<StatementMapping> & { dateFormat: DateFormat };
  /** What is still missing, in words, for the screen to say. Empty when the mapping is usable. */
  missing: string[];
}

export function guessMapping(headers: string[], rows: RawRow[]): GuessedMapping {
  const date = best(headers, (h) => (/\b(date|dt)\b/.test(h) ? 1 + (/\b(txn|tran|transaction|posting|post)\b/.test(h) ? 2 : 0) - (/\bvalue\b/.test(h) ? 1 : 0) : 0));
  const description = best(headers, (h) => (/\b(narration|description|particulars|remarks|details)\b/.test(h) ? 2 + (/narration|description/.test(h) ? 1 : 0) : 0));
  const balance = best(headers, (h) => (/\b(balance|bal)\b/.test(h) ? 1 : 0));
  const isDrCr = (h: string) => /^(dr cr|cr dr|dr or cr|type|indicator)$/.test(h); // a direction column, not an amount column
  const debit = best(headers, (h) => (/\b(withdraw\w*|debit|dr|paid out|money out)\b/.test(h) && !/\bbalance\b/.test(h) && !isDrCr(h) ? 1 : 0));
  const credit = best(headers, (h) => (/\b(deposit\w*|credit|cr|paid in|money in)\b/.test(h) && !/\bbalance\b/.test(h) && !isDrCr(h) ? 1 : 0));
  const drcr = best(headers, (h) => (isDrCr(h) ? 1 : 0));
  const amount = debit === undefined && credit === undefined ? best(headers, (h) => (/\bamount\b|\bamt\b/.test(h) && !/\bbalance\b/.test(h) ? 1 : 0)) : undefined;
  const reference = best(headers, (h) => (/\b(ref\w*|chq|cheque|utr|txn id|transaction id)\b/.test(h) && !/\bdate\b/.test(h) ? 1 : 0));

  const dateFormat = date === undefined ? 'dmy' : guessDateFormat(rows.map((r) => r.cells[date] ?? ''));
  const mapping: GuessedMapping['mapping'] = { dateFormat };
  if (date !== undefined) mapping.date = date;
  if (description !== undefined) mapping.description = description;
  if (reference !== undefined && reference !== description) mapping.reference = reference;
  if (debit !== undefined) mapping.debit = debit;
  if (credit !== undefined && credit !== debit) mapping.credit = credit;
  if (amount !== undefined) mapping.amount = amount;
  if (drcr !== undefined) mapping.drcr = drcr;
  if (balance !== undefined) mapping.balance = balance;
  return { mapping, missing: missingParts(mapping) };
}

export function missingParts(m: Partial<StatementMapping>): string[] {
  const missing: string[] = [];
  if (m.date === undefined) missing.push('the date column');
  if (m.description === undefined) missing.push('the description (narration) column');
  if (m.debit === undefined && m.amount === undefined) missing.push('the debit (withdrawal) column or an amount column');
  return missing;
}

// ---- applying it ----

/** A small, fast, well-spread string hash (cyrb53). A fingerprint, not a secret. */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export interface AppliedStatement {
  debits: StatementRow[];
  creditCount: number;
  /** Rows that could not be read (no date, no amount, footer lines): reported, never fatal. */
  problems: RowProblem[];
}

export function applyMapping(rows: RawRow[], m: StatementMapping): AppliedStatement {
  const debits: StatementRow[] = [];
  const problems: RowProblem[] = [];
  const seen = new Map<string, number>();
  let creditCount = 0;

  for (const { line, cells } of rows) {
    const cell = (i: number | undefined) => (i === undefined ? '' : (cells[i] ?? '').trim());
    const date = parseStatementDate(cell(m.date), m.dateFormat);
    if (!date) {
      problems.push({ line, reason: cell(m.date) ? `"${cell(m.date).slice(0, 24)}" is not a date` : 'no date (a heading, total or footer line)' });
      continue;
    }

    let debit: number | undefined;
    let isCredit = false;
    let unreadable = false;
    if (m.debit !== undefined) {
      const d = parseStatementAmount(cell(m.debit));
      const c = parseStatementAmount(cell(m.credit));
      if (d === undefined || c === undefined) unreadable = true;
      else if (d && d.minor > 0) debit = d.minor;
      else if (c && c.minor > 0) isCredit = true;
    } else if (m.amount !== undefined) {
      const a = parseStatementAmount(cell(m.amount));
      const kind = cell(m.drcr).toLowerCase();
      if (a === undefined) unreadable = true;
      else if (a && a.minor > 0) {
        const outgoing = a.drcr ? a.drcr === 'dr' : kind ? /^(dr|d|debit)\b/.test(kind) : a.negative;
        const incoming = a.drcr ? a.drcr === 'cr' : kind ? /^(cr|c|credit)\b/.test(kind) : !a.negative;
        if (outgoing) debit = a.minor;
        else if (incoming) isCredit = true;
      }
    }
    if (unreadable) {
      problems.push({ line, reason: 'the amount could not be read' });
      continue;
    }
    if (isCredit) {
      creditCount += 1;
      continue;
    }
    if (debit === undefined) {
      problems.push({ line, reason: 'no amount on this line' });
      continue;
    }

    const narration = cell(m.description).replace(/\s+/g, ' ');
    const refNo = cell(m.reference);
    const key = `${date}|${narration}|${debit}|${refNo}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    debits.push({ line, date, narration, ...(refNo && { refNo }), debitMinor: debit, rowHash: fingerprint(`${key}#${occurrence}`) });
  }
  return { debits, creditCount, problems };
}
