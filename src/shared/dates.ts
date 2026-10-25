// REQ-NFR-05: calendar dates are 'YYYY-MM-DD' strings, compared as strings. No timezone conversion.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export function makeDate(year: number, month: number, day: number): string | undefined {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return undefined;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth ? `${pad(year, 4)}-${pad(month)}-${pad(day)}` : undefined;
}

export function isValidDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return !!m && makeDate(Number(m[1]), Number(m[2]), Number(m[3])) === value;
}

export function addDays(value: string, days: number): string {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** "2026-11-12" → "12 Nov 2026". */
export function formatDateLabel(value: string): string {
  const [y, m, d] = value.split('-');
  return `${Number(d)} ${MONTH_LABELS[Number(m) - 1] ?? '?'} ${y}`;
}

const MONTH_WORDS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

/**
 * Finds the first date in free text. Understands 2026-11-12, 12-Nov-26, 12 Nov 2026, 25OCT26 (no separators),
 * Nov 12, 2026, and 12/11/2026 (day first, as in India). Only real month names count, so "5 Marketing 2026" is not a date.
 */
export function findDateInText(text: string): string | undefined {
  const found: { index: number; date: string }[] = [];
  const add = (index: number, date: string | undefined) => date && found.push({ index, date });
  const year = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));
  const month = (word: string) => MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1;

  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) add(m.index, makeDate(+m[1]!, +m[2]!, +m[3]!));
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})[-\\s/.]*(${MONTH_WORDS})[-\\s/.,]*(\\d{4}|\\d{2})\\b`, 'gi'))) {
    add(m.index, makeDate(year(m[3]!), month(m[2]!), +m[1]!));
  }
  for (const m of text.matchAll(new RegExp(`\\b(${MONTH_WORDS})[-\\s/.]*(\\d{1,2})(?:st|nd|rd|th)?,?[-\\s/.]*(\\d{4})\\b`, 'gi'))) {
    add(m.index, makeDate(year(m[3]!), month(m[1]!), +m[2]!));
  }
  for (const m of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/g)) add(m.index, makeDate(year(m[3]!), +m[2]!, +m[1]!));

  found.sort((a, b) => a.index - b.index);
  return found[0]?.date;
}
