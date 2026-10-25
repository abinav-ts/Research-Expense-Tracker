// REQ-CAP-13 (and the text half of REQ-CAP-05): read amount, date, payee and reference from card SMS /
// UPI-style receipt text. Pure and conservative: a field it is unsure about stays empty.
import { currencyExponent } from './currency.ts';
import { findDateInText } from './dates.ts';
import { parseAmount } from './money.ts';

export interface ParsedReceipt {
  amountMinor?: number;
  currency?: string;
  date?: string;
  payee?: string;
  reference?: string;
}

/**
 * Removes what must never be stored (REQ-CAP-13): card/account digits and "available limit/balance" figures.
 * Run this on pasted or shared text BEFORE saving it; the parser then works on the scrubbed text.
 */
export function scrubReceiptText(text: string): string {
  return text
    .replace(/\b(?:avl|avail(?:able)?)\.?\s*(?:lmt|limit|bal(?:ance)?)\.?\s*:?\s*(?:₹|rs\.?|[A-Z]{3})?\s*[\d,]+(?:\.\d+)?/gi, '')
    .replace(/\b(card|a\/c|acct?|account)(\s*(?:no\.?|number|ending|ending with)?\s*[:#]?)\s*[xX*•]*\s*\d{2,}/gi, '$1 XXXX')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const CODES = 'INR|USD|EUR|GBP|JPY|AUD|CAD|CHF|SGD|AED|CNY|KRW|SEK|NOK|DKK|NZD|THB|MYR|HKD|ZAR';
const AMOUNT = new RegExp(`(₹|\\bRs\\.?|\\b(?:${CODES}))\\s*([0-9][0-9,]*(?:\\.[0-9]{1,3})?)`, 'gi');
const SPEND_WORDS = /\b(spent|paid|debited|debit|purchase|txn|transaction|sent|withdrawn|charged|payment)\b/gi;
const BALANCE_WORDS = /(avl|avail|limit|lmt|balance|bal)\b/i;
const NEAR = 30; // a spend word must be within this many characters of the amount

function currencyOf(symbol: string): string {
  return /^(₹|rs)/i.test(symbol) ? 'INR' : symbol.toUpperCase();
}

/** The amount next to a spend word wins; several amounts and no clear winner → empty. */
function pickAmount(text: string): { amountMinor: number; currency: string } | undefined {
  const words = [...text.matchAll(SPEND_WORDS)].map((w) => ({ start: w.index, end: w.index + w[0].length }));
  const byValue = new Map<string, { minor: number; currency: string; distance: number }>();
  for (const m of text.matchAll(AMOUNT)) {
    const currency = currencyOf(m[1]!);
    if (BALANCE_WORDS.test(text.slice(Math.max(0, m.index - 24), m.index))) continue; // a limit or balance, not the spend
    const parsed = parseAmount(m[2]!, currencyExponent(currency));
    if (!parsed.ok) continue;
    const start = m.index;
    const end = m.index + m[0].length;
    const distance = Math.min(Infinity, ...words.map((w) => Math.max(0, w.start - end, start - w.end)));
    const key = `${currency}:${parsed.value}`;
    const known = byValue.get(key);
    if (!known || distance < known.distance) byValue.set(key, { minor: parsed.value, currency, distance });
  }
  const found = [...byValue.values()].sort((a, b) => a.distance - b.distance);
  const best = found[0];
  if (!best) return undefined;
  if (found.length === 1) return { amountMinor: best.minor, currency: best.currency };
  if (best.distance <= NEAR && best.distance < found[1]!.distance) return { amountMinor: best.minor, currency: best.currency };
  return undefined;
}

function pickPayee(text: string, hasAmount: boolean): string | undefined {
  const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/[.,:;-]+$/, '').trim();
  const labelled = /(?:paid to|sent to|payee|merchant|paid at)\s*[:\-]?\s*([^\n\r]+)/i.exec(text);
  if (labelled?.[1] && /^[A-Za-z0-9]/.test(labelled[1].trim())) return clean(labelled[1]).slice(0, 80) || undefined;
  if (!hasAmount) return undefined; // the loose "at <place>" form is only trusted in a payment message
  const at = /\bat\s+([A-Za-z][^\n\r]*?)(?=\s+(?:on|dated|ref|txn|upi|avl|for|using)\b|[.,\n\r]|$)/i.exec(text);
  return at?.[1] ? clean(at[1]).slice(0, 80) || undefined : undefined;
}

function pickReference(text: string): string | undefined {
  const m = /(?:utr|txn\s*(?:id|no\.?)?|transaction\s*(?:id|no\.?)?|upi\s*(?:ref(?:erence)?\s*(?:no\.?)?|transaction\s*id)|ref(?:erence)?\s*(?:no\.?|number)?)\s*[:#\-]?\s*([A-Za-z0-9]{6,})/i.exec(text);
  return m?.[1];
}

export function parseReceiptText(text: string): ParsedReceipt {
  const out: ParsedReceipt = {};
  const amount = pickAmount(text);
  if (amount) {
    out.amountMinor = amount.amountMinor;
    out.currency = amount.currency;
  }
  const date = findDateInText(text);
  if (date) out.date = date;
  const payee = pickPayee(text, !!amount);
  if (payee) out.payee = payee;
  const reference = pickReference(text);
  if (reference) out.reference = reference;
  return out;
}
