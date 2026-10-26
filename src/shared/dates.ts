// REQ-NFR-05: calendar dates are 'YYYY-MM-DD' strings, compared as strings. No timezone conversion.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export function makeDate(year: number, month: number, day: number): string | undefined {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return undefined;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth ? `${pad(year, 4)}-${pad(month)}-${pad(day)}` : undefined;
}

/** Whole days from a to b (b - a); both are YYYY-MM-DD. Negative when b is earlier. */
export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number) as [number, number, number];
  const [yb, mb, db] = b.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
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
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export interface DateHit {
  date: string;
  /** Position in the text. */
  index: number;
  /** The words as written. */
  text: string;
  /** True when look-alike characters had to be guessed (e.g. day "72" read as 22). */
  repaired: boolean;
}

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length]!;
}

/** A month from a written word: exact name or 3-letter abbreviation, or (for words of 5+ letters) one wrong character, as OCR makes. */
export function monthFromWord(word: string): number | undefined {
  const w = word.toLowerCase();
  const exact = MONTH_NAMES.findIndex((m) => m === w || m.slice(0, 3) === w || (w === 'sept' && m === 'september'));
  if (exact >= 0) return exact + 1;
  if (w.length < 5) return undefined;
  const close = MONTH_NAMES.map((m, i) => ({ month: i + 1, d: distance(w, m) })).filter((c) => c.d <= 1);
  return close.length === 1 ? close[0]!.month : undefined;
}

// Characters OCR commonly returns instead of digits, and digits it mixes up with each other.
const LOOK_LIKE_DIGIT: Record<string, string> = { O: '0', o: '0', I: '1', l: '1', '|': '1' };
const CONFUSED_WITH: Record<string, string[]> = { '0': ['8', '6'], '1': ['7'], '2': ['7', '3'], '3': ['8', '2'], '5': ['6', '3'], '6': ['5', '8'], '7': ['1', '2'], '8': ['0', '3', '6'], '9': ['4'] };
const asDigits = (s: string) => {
  const fixed = [...s].map((c) => LOOK_LIKE_DIGIT[c] ?? c).join('');
  return /^\d+$/.test(fixed) ? fixed : undefined;
};

// A day or year may contain letters OCR returns for digits (O, l, I, |) but needs at least one real digit,
// so ordinary words never look like dates.
const D = '[0-9OoIl|]';
const DAY_MONTH_YEAR = new RegExp(
  `(?<![A-Za-z0-9])(\\d${D}?|${D}\\d)(?:st|nd|rd|th)?[-\\s/.]*([A-Za-z]{3,9})[-\\s/.,]*([12]${D}{3}|\\d${D}|${D}\\d)(?![A-Za-z0-9])`,
  'g',
);

/** Every date in free text, in reading order. Understands ISO, 12-Nov-26, 12 Nov 2026, 25OCT26, 25th Oct 2026, Nov 12, 2026, 12/11/2026. */
export function findDatesInText(text: string, options: { repairDays?: boolean } = {}): DateHit[] {
  const found: DateHit[] = [];
  const add = (index: number, raw: string, date: string | undefined, repaired = false) => date && found.push({ index, text: raw, date, repaired });
  const year = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));

  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) add(m.index, m[0], makeDate(+m[1]!, +m[2]!, +m[3]!));

  // day month year, where the day and year may contain look-alike letters and the month word may have one wrong letter
  for (const m of text.matchAll(DAY_MONTH_YEAR)) {
    const month = monthFromWord(m[2]!);
    const dayText = asDigits(m[1]!);
    const yearText = asDigits(m[3]!);
    if (!month || !dayText || !yearText) continue;
    const exact = makeDate(year(yearText), month, +dayText);
    if (exact) {
      add(m.index, m[0], exact, dayText !== m[1] || yearText !== m[3]);
    } else if (options.repairDays) {
      // e.g. "72" is not a day; one digit read wrongly could be 22 or 12
      for (const [i, digit] of [...dayText].entries()) {
        for (const alt of CONFUSED_WITH[digit] ?? []) {
          const day = dayText.slice(0, i) + alt + dayText.slice(i + 1);
          add(m.index, m[0], makeDate(year(yearText), month, +day), true);
        }
      }
    }
  }

  for (const m of text.matchAll(new RegExp(`\\b(${MONTH_WORDS})[-\\s/.]*(\\d{1,2})(?:st|nd|rd|th)?,?[-\\s/.]*(\\d{4})\\b`, 'gi'))) {
    add(m.index, m[0], makeDate(year(m[3]!), monthFromWord(m[1]!)!, +m[2]!));
  }
  for (const m of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/g)) add(m.index, m[0], makeDate(year(m[3]!), +m[2]!, +m[1]!));

  const seen = new Set<string>();
  return found
    .sort((a, b) => a.index - b.index)
    .filter((h) => !seen.has(`${h.index}:${h.date}`) && !!seen.add(`${h.index}:${h.date}`));
}

/** The first date in free text (reading order), or undefined. */
export function findDateInText(text: string): string | undefined {
  return findDatesInText(text)[0]?.date;
}
