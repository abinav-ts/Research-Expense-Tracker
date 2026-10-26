// REQ-CAP-15: up to three suggested values per field from recognised or pasted text, best first.
// Nothing here is specific to one bank or shop: it ranks by labels, repetition and trip dates, and tolerates OCR noise.
import { currencyExponent } from './currency.ts';
import { findDatesInText, formatDateLabel } from './dates.ts';
import type { ExpenseFormInput } from './expense-form.ts';
import { applyAnchors, type Anchor } from './learn.ts';
import { formatInr, formatMinor, minorToText, parseAmount } from './money.ts';
import { parseReceiptText } from './receipt-parser.ts';
import { normaliseWords, similarity } from './text-match.ts';

export type SuggestField = 'amount' | 'date' | 'payee' | 'reference';
export interface Suggestion {
  field: SuggestField;
  /** Text on the chip. */
  label: string;
  /** Why it is suggested ("near total", "used before"). */
  hint?: string;
  /** What applying it sets in the form. */
  patch: Partial<ExpenseFormInput>;
  /** True when a character had to be guessed (a day read as "72"): offered as a chip, never prefilled. */
  guess?: boolean;
}
export interface SuggestContext {
  /** Allowed dates for this trip (REQ-RULE-02): dates inside rank first. */
  window?: { start: string; end: string };
  /** Payee spellings the user has saved before (REQ-CAP-16). */
  knownPayees?: string[];
  anchors?: Anchor[];
}
export type FieldSuggestions = Record<SuggestField, Suggestion[]>;

const MAX = 3;
const CODES = 'INR|USD|EUR|GBP|JPY|AUD|CAD|CHF|SGD|AED|CNY|KRW|SEK|NOK|DKK|NZD|THB|MYR|HKD|ZAR';
const MARKER = new RegExp(`(₹|\\bRs\\.?|\\b(?:${CODES})\\b)`, 'i');
const NUMBER = new RegExp(`(?<![A-Za-z0-9.,])(?:(₹|Rs\\.?|(?:${CODES}))\\s*)?(\\d{1,3}(?:,\\d{2,3})+(?:\\.\\d{1,3})?|\\d+(?:\\.\\d{1,3})?)(?![\\d%]|[./:-]\\d)`, 'gi');
const TOTAL_WORDS = /\b(total|tot|grand|amount|amt|paid|payable|net|due|charged|spent|debited|payment|cash|card|upi)\b/i;
const NOT_THE_TOTAL = /\b(tax|gst|cgst|sgst|igst|vat|disc|discount|rate|mrp|qty|saving|savings|change|tendered|round|hsn)\b/i;
const currencyOf = (marker: string) => (/^(₹|rs)/i.test(marker) ? 'INR' : marker.toUpperCase());

function amountSuggestions(text: string, preferred?: { minor: number; currency: string }): Suggestion[] {
  const seenMarkers = new Set([...text.matchAll(new RegExp(MARKER, 'gi'))].map((m) => currencyOf(m[1]!)));
  const fallbackCurrency = seenMarkers.size === 1 ? [...seenMarkers][0]! : 'INR';
  const found = new Map<string, { minor: number; currency: string; score: number; seen: number; labelled: boolean }>();

  for (const line of text.split(/\r?\n/)) {
    const lineMarker = MARKER.exec(line);
    for (const m of line.matchAll(NUMBER)) {
      const marker = m[1];
      const currency = marker ? currencyOf(marker) : lineMarker ? currencyOf(lineMarker[1]!) : fallbackCurrency;
      const exponent = currencyExponent(currency);
      // Plain digit runs are ids, phone numbers and quantities: only accept a number with decimals or a currency marker.
      if (!marker && !/\.\d{2}$/.test(m[2]!)) continue;
      const parsed = parseAmount(m[2]!, exponent);
      if (!parsed.ok || parsed.value > 1e12) continue;
      const before = line.slice(0, m.index);
      const labelled = TOTAL_WORDS.test(before);
      const score = (labelled ? 4 : 0) - (NOT_THE_TOTAL.test(line) ? 3 : 0) + 1;
      const key = `${currency}:${parsed.value}`;
      const known = found.get(key);
      if (known) {
        known.score += score;
        known.seen += 1;
        known.labelled ||= labelled;
      } else found.set(key, { minor: parsed.value, currency, score, seen: 1, labelled });
    }
  }
  if (preferred) {
    const key = `${preferred.currency}:${preferred.minor}`;
    const known = found.get(key);
    if (known) known.score += 4;
    else found.set(key, { minor: preferred.minor, currency: preferred.currency, score: 4, seen: 1, labelled: true });
  }
  const ranked = [...found.values()].sort((a, b) => b.score - a.score || b.minor - a.minor);
  // Alternatives must be plausible next to the leader: a lone unlabelled number beside a total printed on four lines is noise.
  const floor = Math.max(1, (ranked[0]?.score ?? 0) / 5);
  return ranked
    .filter((c, i) => i === 0 || c.score >= floor)
    .slice(0, MAX)
    .map((c) => ({
      field: 'amount' as const,
      label: c.currency === 'INR' ? formatInr(c.minor) : formatMinor(c.minor, c.currency, currencyExponent(c.currency)),
      hint: c.labelled ? 'near "total"' : c.seen > 1 ? `seen ${c.seen} times` : undefined,
      patch: { amountText: minorToText(c.minor, currencyExponent(c.currency)), currency: c.currency },
    }));
}

function dateSuggestions(text: string, ctx: SuggestContext): Suggestion[] {
  const byDate = new Map<string, { score: number; repaired: boolean; inWindow: boolean }>();
  for (const hit of findDatesInText(text, { repairDays: true })) {
    if (hit.date < '2000-01-01') continue;
    const lineStart = text.lastIndexOf('\n', hit.index) + 1;
    const near = /\b(date|dated|invoice|bill|paid|on|txn|issued)\b/i.test(text.slice(Math.max(lineStart, hit.index - 25), hit.index));
    const inWindow = !!ctx.window && hit.date >= ctx.window.start && hit.date <= ctx.window.end;
    const score = (inWindow ? 5 : 0) + (near ? 2 : 0) - (hit.repaired ? 1 : 0);
    const known = byDate.get(hit.date);
    if (known) {
      known.score = Math.max(known.score, score) + 0.5;
      known.repaired &&= hit.repaired;
    } else byDate.set(hit.date, { score, repaired: hit.repaired, inWindow });
  }
  return [...byDate.entries()]
    .sort((a, b) => b[1].score - a[1].score || (a[0] < b[0] ? -1 : 1))
    .slice(0, MAX)
    .map(([date, c]) => ({
      field: 'date' as const,
      label: formatDateLabel(date),
      hint: c.inWindow ? 'in the trip dates' : c.repaired ? 'read with a guess' : undefined,
      patch: { date },
      ...(c.repaired && { guess: true }),
    }));
}

// Lines that are never a payee: headings, labels, contact details, addresses.
const NOT_A_NAME = /\b(invoice|tax|bill|receipt|memo|gst|gstin|pan|phone|ph|tel|mobile|mob|email|www|http|customer|cashier|date|total|amount|qty|rate|thank|thanks|visit|welcome|software|address|opposite|near|street|road|avenue|nagar|floor|plot|sector|pin|state|supply|code|description|duplicate|original|copy|cash|card|upi)\b/i;
/**
 * How much a line looks like a business name (0 = not at all). Decoration rows ("*****") come back from OCR as junk
 * such as "oko soR EK Ack RAR": short words, odd capitals. Real names have words of ordinary length in Title Case
 * or UPPER CASE.
 */
function nameScore(line: string): number {
  if (NOT_A_NAME.test(line) || /[@/]|www\.|\d{4,}/i.test(line)) return 0;
  const letters = line.replace(/[^A-Za-z]/g, '').length;
  if (letters < 3 || letters / line.replace(/\s/g, '').length < 0.8) return 0;
  const words = line.split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, '')).filter(Boolean);
  if (words.length === 0 || words.reduce((n, w) => n + w.length, 0) / words.length < 3.5) return 0;
  if (words.some((w) => /[a-z][A-Z]/.test(w) && !/^(Mc|Mac)/.test(w))) return 0;
  if (!words.every((w) => /^[A-Z][a-z]+$/.test(w) || /^[A-Z]{2,}$/.test(w) || /^[a-z]{1,3}$/.test(w))) return 0;
  if (words.length === 1) return words[0]!.length >= 6 && /[aeiou]/i.test(words[0]!) ? 2 : 0;
  return 3 + Math.min(2, words.length - 2);
}
const cleanName = (s: string) => s.replace(/\s+/g, ' ').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.)]+$/g, '').slice(0, 80);

function payeeSuggestions(text: string, ctx: SuggestContext, parsedPayee?: string): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const add = (name: string, hint?: string) => {
    const key = normaliseWords(name);
    if (!key || seen.has(key) || out.length >= MAX) return;
    seen.add(key);
    out.push({ field: 'payee', label: name, ...(hint && { hint }), patch: { payee: name } });
  };

  const learned = ctx.anchors && applyAnchors(text, ctx.anchors, 'payee');
  if (learned?.payee) add(learned.payee, 'same layout as before');

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 3);
  for (const known of ctx.knownPayees ?? []) {
    if (lines.some((l) => similarity(l, known) >= 0.8 || normaliseWords(l).includes(normaliseWords(known)))) add(known, 'used before');
  }
  if (parsedPayee) add(cleanName(parsedPayee));

  // The merchant is normally printed first, above the invoice details: only look in that header block.
  const header: string[] = [];
  for (const line of lines) {
    if (/\b(invoice|bill|receipt|date)\b/i.test(line) && header.length > 0) break;
    header.push(line);
    if (header.length >= 10) break;
  }
  header
    .map((line, position) => ({ line, position, score: nameScore(line) }))
    .filter((c) => c.score > 0)
    .sort((x, y) => y.score - x.score || x.position - y.position)
    .forEach((c) => add(cleanName(c.line)));
  return out;
}

function referenceSuggestions(text: string, ctx: SuggestContext, parsedReference?: string): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const add = (value: string, hint?: string) => {
    const v = value.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$/g, '');
    if (v.length < 4 || !/\d/.test(v) || seen.has(v.toLowerCase()) || out.length >= MAX) return;
    seen.add(v.toLowerCase());
    out.push({ field: 'reference', label: v, ...(hint && { hint }), patch: { reference: v } });
  };
  const learned = ctx.anchors && applyAnchors(text, ctx.anchors, 'reference');
  if (learned?.reference) add(learned.reference, 'same layout as before');
  if (parsedReference) add(parsedReference);
  // same line only (the label word and its value), so a heading like "TAX INVOICE" cannot swallow the next line's label
  const label = /\b(?:invoice|inv|bill|receipt|order|booking|txn|transaction|ref(?:erence)?|utr|confirmation)[ \t]*(?:no\.?|number|num|id|#)?[ \t]*[:#\-]?[ \t]*([A-Za-z0-9][A-Za-z0-9\-/_()]{3,29})/gi;
  for (const m of text.matchAll(label)) add(m[1]!);
  return out;
}

export function suggestFields(text: string, ctx: SuggestContext = {}): FieldSuggestions {
  const parsed = parseReceiptText(text);
  const learnedAmount = ctx.anchors && applyAnchors(text, ctx.anchors, 'amount');
  const learnedDate = ctx.anchors && applyAnchors(text, ctx.anchors, 'date');

  const amount = amountSuggestions(text, parsed.amountMinor !== undefined ? { minor: parsed.amountMinor, currency: parsed.currency ?? 'INR' } : undefined);
  if (learnedAmount?.amountText) {
    // The remembered layout says where this message keeps its amount: that reading goes first, even if nothing else found it.
    const currency = learnedAmount.currency ?? amount[0]?.patch.currency ?? 'INR';
    const minor = parseAmount(learnedAmount.amountText, currencyExponent(currency));
    const patch = { amountText: learnedAmount.amountText, currency };
    if (minor.ok) {
      const label = currency === 'INR' ? formatInr(minor.value) : formatMinor(minor.value, currency, currencyExponent(currency));
      const i = amount.findIndex((s) => s.patch.amountText === patch.amountText && s.patch.currency === currency);
      if (i >= 0) amount.splice(i, 1);
      amount.unshift({ field: 'amount', label, hint: 'same layout as before', patch });
      amount.length = Math.min(amount.length, MAX);
    }
  }
  const date = dateSuggestions(text, ctx);
  if (learnedDate?.date) {
    const i = date.findIndex((s) => s.patch.date === learnedDate.date);
    if (i >= 0) date.splice(i, 1);
    date.unshift({ field: 'date', label: formatDateLabel(learnedDate.date), hint: 'same layout as before', patch: { date: learnedDate.date } });
    date.length = Math.min(date.length, MAX);
  }
  return {
    amount,
    date,
    payee: payeeSuggestions(text, ctx, parsed.payee),
    reference: referenceSuggestions(text, ctx, parsed.reference),
  };
}
