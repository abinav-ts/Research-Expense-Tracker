// REQ-CSV-02, REQ-CSV-09: from raw statement rows to debits. Guess the column mapping, read dates and amounts in the many
// ways banks write them, and report what could not be read. Money is integer paise throughout (REQ-NFR-04).
import { makeDate, monthFromWord } from './dates.ts';
import { parseDecimal } from './money.ts';
import type { RawRow } from './statement-parse.ts';

export type DateFormat = 'dmy' | 'mdy' | 'ymd' | 'dMonY' | 'monDY';
export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  dmy: 'Day first: 12/11/2026, 12-11-26',
  mdy: 'Month first: 11/12/2026',
  ymd: 'Year first: 2026-11-12',
  dMonY: 'With the month name: 12-Nov-2026, 12 Nov 2026',
  monDY: 'Month name first: Nov 12, 2026',
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
  /** Amounts written 1.234,56 (decimal comma) as some European-style exports do. */
  decimalComma?: boolean;
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

/** A leading weekday ("Thu, 12 Nov 2026") is dropped. */
const WEEKDAY = /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i;

/** Reads a date from the start of a cell in the given style; undefined when it does not fit. A time after the date is ignored. */
export function parseStatementDate(text: string, format: DateFormat): string | undefined {
  const t = text.trim().replace(/^["']|["']$/g, '').replace(WEEKDAY, '');
  const year = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));
  if (format === 'ymd') {
    const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t);
    return m ? makeDate(+m[1]!, +m[2]!, +m[3]!) : undefined;
  }
  if (format === 'dMonY') {
    const m = /^(\d{1,2})(?:st|nd|rd|th)?[-\s/.,]*([A-Za-z]{3,9})\.?[-\s/.,]*(\d{4}|\d{2})(?!\d)/.exec(t);
    const month = m && monthFromWord(m[2]!);
    return m && month ? makeDate(year(m[3]!), month, +m[1]!) : undefined;
  }
  if (format === 'monDY') {
    const m = /^([A-Za-z]{3,9})\.?[-\s/.]*(\d{1,2})(?:st|nd|rd|th)?[-\s/.,]*(\d{4}|\d{2})(?!\d)/.exec(t);
    const month = m && monthFromWord(m[1]!);
    return m && month ? makeDate(year(m[3]!), month, +m[2]!) : undefined;
  }
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/.exec(t);
  if (!m) return undefined;
  return format === 'dmy' ? makeDate(year(m[3]!), +m[2]!, +m[1]!) : makeDate(year(m[3]!), +m[1]!, +m[2]!);
}

/** True when the cell reads as a date in any of the styles. */
export function looksLikeDate(text: string): boolean {
  return (['dmy', 'ymd', 'dMonY', 'monDY', 'mdy'] as DateFormat[]).some((f) => parseStatementDate(text, f) !== undefined);
}

/** The style most of a column is written in: any first number above 12 means day first, any second above 12 means month first. */
export function guessDateFormat(samples: string[]): DateFormat {
  const cells = samples.map((s) => s.trim().replace(WEEKDAY, '')).filter(Boolean).slice(0, 300);
  if (cells.some((c) => /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(c))) return 'ymd';
  if (cells.some((c) => /^[A-Za-z]{3,9}\.?[-\s/.]*\d{1,2}/.test(c))) return 'monDY';
  if (cells.some((c) => /^\d{1,2}(?:st|nd|rd|th)?[-\s/.,]*[A-Za-z]{3,9}/.test(c))) return 'dMonY';
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

/** Currency words and symbols a bank may write around a number, in any spelling. */
const CURRENCY = /(?:₹|rs\.?|inr|rupees?)/i;

/**
 * Reads an amount as banks write it: 1,23,456.78 · 1,234.56 · ₹ 560.00 · Rs.560 · 560.00 INR · 560.00 Dr · Dr 560 · (560.00)
 * · -560.00 · −560.00 · 560.00- · 1.234,56 (with `decimalComma`) · 1 234,56. Non-breaking spaces are ordinary spaces.
 * `null` = nothing there (blank or a dash); `undefined` = something that is not an amount.
 */
export function parseStatementAmount(text: string, options: { decimalComma?: boolean } = {}): StatementAmount | null | undefined {
  let t = text.replace(/[\u00a0\u202f\u2007]/g, ' ').trim();
  if (t === '' || /^[-–—−.]+$/.test(t) || /^(nil|n\/a|na)$/i.test(t)) return null;
  let negative = false;
  let drcr: 'dr' | 'cr' | undefined;
  const bracket = /^\((.*)\)$/.exec(t);
  if (bracket) {
    negative = true;
    t = bracket[1]!.trim();
  }
  const suffix = /\s*(?<![a-z])(dr|cr|debit|credit)\.?$/i.exec(t) ?? /^(dr|cr|debit|credit)(?![a-z])\.?\s*/i.exec(t);
  if (suffix) {
    drcr = /^d/i.test(suffix[1]!) ? 'dr' : 'cr';
    t = t.replace(suffix[0], '').trim();
  }
  const stripCurrency = () => {
    t = t.replace(new RegExp(`^${CURRENCY.source}\\s*`, 'i'), '').replace(new RegExp(`\\s*${CURRENCY.source}$`, 'i'), '').trim();
  };
  stripCurrency();
  if (t.startsWith('-') || t.startsWith('−') || t.startsWith('–')) {
    negative = true;
    t = t.slice(1).trim();
  }
  if (t.endsWith('-') || t.endsWith('−')) {
    negative = true;
    t = t.slice(0, -1).trim();
  }
  stripCurrency();
  if (options.decimalComma) {
    // 1.234,56 and 1 234,56: dots and spaces group thousands, the comma is the decimal point
    if (!/^\d{1,3}(?:[. ]\d{3})*(?:,\d+)?$|^\d+(?:,\d+)?$/.test(t)) return undefined;
    t = t.replace(/[. ]/g, '').replace(',', '.');
  } else if (/\s/.test(t)) {
    return undefined; // "5 600.00" is ambiguous: never guess
  }
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

const DEBIT_WORDS = /\b(withdraw\w*|debit\w*|dr|paid out|money out|outgoing|spent|payment out|debited)\b/;
const CREDIT_WORDS = /\b(deposit\w*|credit\w*|cr|paid in|money in|incoming|received|payment in|credited)\b/;
const isDrCrHeader = (h: string) => /^(dr cr|cr dr|dr or cr|type|indicator|txn type|transaction type|debit credit|credit debit|d c)$/.test(h);

/** The share of a column's non-empty cells that pass `test`, over up to 200 cells. */
function share(rows: RawRow[], col: number, test: (cell: string) => boolean): { fraction: number; filled: number } {
  const cells = rows.slice(0, 200).map((r) => (r.cells[col] ?? '').trim()).filter(Boolean);
  return { fraction: cells.length ? cells.filter(test).length / cells.length : 0, filled: cells.length };
}

/**
 * Works out the columns from what is IN them, for files whose headers are unusual or missing: the column of dates, the
 * numeric columns, the longest text. The user still confirms the result, so a wrong guess costs one tap, never wrong data.
 */
function inferFromContent(width: number, rows: RawRow[], decimalComma: boolean): Partial<StatementMapping> {
  const out: Partial<StatementMapping> = {};
  const isAmount = (c: string) => {
    const a = parseStatementAmount(c, { decimalComma });
    return a !== undefined && a !== null;
  };
  const cols = Array.from({ length: width }, (_, i) => i);
  const dateCol = cols.find((c) => share(rows, c, looksLikeDate).fraction >= 0.8 && share(rows, c, looksLikeDate).filled > 0);
  if (dateCol !== undefined) out.date = dateCol;

  // An amount column has pence: a column of long whole numbers is a reference or account number, not money.
  const hasPence = (c: string) => /[.,]\d{2}\D*$/.test(c.trim());
  const numeric = cols.filter((c) => c !== dateCol && share(rows, c, isAmount).fraction >= 0.8 && share(rows, c, hasPence).fraction >= 0.6);
  const textual = cols.filter((c) => c !== dateCol && !numeric.includes(c));
  const averageLength = (c: number) => rows.slice(0, 100).reduce((sum, r) => sum + (r.cells[c] ?? '').length, 0) / Math.max(1, Math.min(rows.length, 100));
  // A description is words, so columns with letters in them come first; the longest of those is the narration.
  const wordy = (c: number) => share(rows, c, (x) => /[A-Za-z]{2}/.test(x)).fraction >= 0.5;
  const byLength = [...textual].sort((a, b) => Number(wordy(b)) - Number(wordy(a)) || averageLength(b) - averageLength(a));
  if (byLength[0] !== undefined) out.description = byLength[0];
  const ref = byLength.find((c) => c !== out.description && averageLength(c) > 0 && averageLength(c) <= 24);
  if (ref !== undefined) out.reference = ref;

  // Numeric columns, left to right: [debit credit balance], [debit credit] or [amount balance], or [amount].
  const fill = (c: number) => share(rows, c, () => true).filled / Math.max(1, Math.min(rows.length, 200));
  if (numeric.length >= 3) {
    out.debit = numeric[0]!;
    out.credit = numeric[1]!;
    out.balance = numeric[numeric.length - 1]!;
  } else if (numeric.length === 2) {
    const [first, second] = numeric as [number, number];
    const bothSparse = fill(first) < 0.9 && fill(second) < 0.9; // money out and money in rarely appear on the same line
    if (bothSparse) {
      out.debit = first;
      out.credit = second;
    } else {
      out.amount = first;
      out.balance = second;
    }
  } else if (numeric.length === 1) {
    out.amount = numeric[0]!;
  }
  return out;
}

export function guessMapping(headers: string[], rows: RawRow[]): GuessedMapping {
  const date = best(headers, (h) => (/\b(date|dt|dated)\b/.test(h) ? 1 + (/\b(txn|tran|trans|transaction|posting|post|booking)\b/.test(h) ? 2 : 0) - (/\bvalue\b|\bvalue dt\b/.test(h) ? 1 : 0) : 0));
  const description = best(headers, (h) => (/\b(narration|description|particulars|remarks|details|narrative|memo|payee|counterparty|beneficiary|merchant|transaction details)\b/.test(h) ? 2 + (/narration|description|particulars/.test(h) ? 1 : 0) : 0));
  const balance = best(headers, (h) => (/\b(balance|bal)\b/.test(h) ? 1 : 0));
  const debit = best(headers, (h) => (DEBIT_WORDS.test(h) && !/\bbalance\b/.test(h) && !isDrCrHeader(h) ? 1 : 0));
  const credit = best(headers, (h) => (CREDIT_WORDS.test(h) && !/\bbalance\b/.test(h) && !isDrCrHeader(h) ? 1 : 0));
  const drcr = best(headers, (h) => (isDrCrHeader(h) ? 1 : 0));
  const amount = debit === undefined && credit === undefined ? best(headers, (h) => (/\b(amount|amt|value|sum)\b/.test(h) && !/\b(balance|bal|date)\b/.test(h) ? 1 : 0)) : undefined;
  const reference = best(headers, (h) => (/\b(ref\w*|chq|cheque|instrument|utr|txn id|transaction id|transaction no|txn no|rrn|voucher)\b/.test(h) && !/\bdate\b/.test(h) ? 1 : 0));

  // Written with a decimal comma? Look at the cells under the amount columns.
  const named = [debit, credit, amount].filter((c): c is number => c !== undefined);
  const amountCols = named.length ? named : Array.from({ length: headers.length }, (_, i) => i).filter((i) => i !== date);
  const style = (re: RegExp) => amountCols.reduce((n, c) => n + rows.slice(0, 200).filter((r) => re.test((r.cells[c] ?? '').trim())).length, 0);
  const decimalComma = style(/^\D*\d{1,3}(?:[. \u00a0]\d{3})*,\d{2}\D*$|^\D*\d+,\d{2}\D*$/) > style(/\d\.\d{2}\D*$/);

  const first = guessDateFormat(rows.map((r) => r.cells[date ?? 0] ?? ''));
  const mapping: GuessedMapping['mapping'] = { dateFormat: first };
  if (date !== undefined) mapping.date = date;
  if (description !== undefined) mapping.description = description;
  if (reference !== undefined && reference !== description) mapping.reference = reference;
  if (debit !== undefined) mapping.debit = debit;
  if (credit !== undefined && credit !== debit) mapping.credit = credit;
  if (amount !== undefined) mapping.amount = amount;
  if (drcr !== undefined) mapping.drcr = drcr;
  if (balance !== undefined) mapping.balance = balance;
  if (decimalComma) mapping.decimalComma = true;

  // Anything the headers could not tell us, read from the content (unusual wording, or no header row at all).
  if (missingParts(mapping).length > 0 || date === undefined) {
    const inferred = inferFromContent(headers.length, rows, decimalComma);
    const taken = new Set(Object.entries(mapping).filter(([k, v]) => k !== 'dateFormat' && k !== 'decimalComma' && typeof v === 'number').map(([, v]) => v as number));
    const fill = (key: 'date' | 'description' | 'reference' | 'debit' | 'credit' | 'amount' | 'balance') => {
      const v = inferred[key];
      if (mapping[key] === undefined && v !== undefined && !taken.has(v)) {
        mapping[key] = v;
        taken.add(v);
      }
    };
    (['date', 'description', 'debit', 'credit', 'amount', 'reference', 'balance'] as const).forEach(fill);
    if (mapping.date !== undefined && date === undefined) mapping.dateFormat = guessDateFormat(rows.map((r) => r.cells[mapping.date!] ?? ''));
    if (mapping.debit !== undefined || mapping.credit !== undefined) delete mapping.amount; // a pair of columns wins over a lone amount
  }
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
    const money = (i: number | undefined) => parseStatementAmount(cell(i), { decimalComma: m.decimalComma === true });
    if (m.debit !== undefined) {
      const d = money(m.debit);
      const c = money(m.credit);
      if (d === undefined || c === undefined) unreadable = true;
      else if (d && d.minor > 0) debit = d.minor;
      else if (c && c.minor > 0) isCredit = true;
    } else if (m.amount !== undefined) {
      const a = money(m.amount);
      const kind = cell(m.drcr).toLowerCase();
      if (a === undefined) unreadable = true;
      else if (a && a.minor > 0) {
        const outgoing = a.drcr ? a.drcr === 'dr' : kind ? /^(dr|d|debit|withdrawal|payment|paid|out|purchase|sale)\b/.test(kind) : a.negative;
        const incoming = a.drcr ? a.drcr === 'cr' : kind ? /^(cr|c|credit|deposit|receipt|received|in|refund)\b/.test(kind) : !a.negative;
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

    const narration = cell(m.description).replace(/\s+/g, ' ').slice(0, 300);
    const refNo = cell(m.reference);
    const key = `${date}|${narration}|${debit}|${refNo}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    debits.push({ line, date, narration, ...(refNo && { refNo }), debitMinor: debit, rowHash: fingerprint(`${key}#${occurrence}`) });
  }
  return { debits, creditCount, problems };
}
