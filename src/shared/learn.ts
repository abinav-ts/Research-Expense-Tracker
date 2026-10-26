// REQ-CAP-16: remember the words around confirmed values, so the same message or invoice format reads correctly next time.
// Only anchor words are kept: never amounts, dates, references or message text.
import { assignSelection } from './assign.ts';
import { currencyExponent } from './currency.ts';
import { findDatesInText } from './dates.ts';
import { parseDecimal } from './money.ts';
import { normaliseWords } from './text-match.ts';

export type LearnField = 'payee' | 'reference' | 'amount' | 'date';

/** The words just before (up to two) and just after (one) a value, lowercase, as written. */
export interface AnchorDraft {
  field: LearnField;
  before: string[];
  after: string | null;
}
export interface Anchor extends AnchorDraft {
  id: string;
  count: number;
}

export interface Confirmed {
  payee?: string;
  reference?: string;
  /** Minor units of the confirmed amount and its currency. */
  amountMinor?: number;
  currency?: string;
  /** YYYY-MM-DD */
  date?: string;
}

interface Tok {
  text: string;
  lower: string;
}
const tokens = (text: string): Tok[] => [...text.matchAll(/\S+/g)].map((m) => ({ text: m[0], lower: m[0].toLowerCase() }));
const hasDigit = (s: string) => /\d/.test(s);
const stripEdges = (s: string) => s.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');

/** The token range [start, end) where the value sits, only if it sits in exactly one place. */
function locate(toks: Tok[], matches: (start: number, end: number) => boolean, maxLen: number): [number, number] | undefined {
  const hits: [number, number][] = [];
  for (let start = 0; start < toks.length; start++) {
    for (let len = 1; len <= maxLen && start + len <= toks.length; len++) {
      // a match must begin and end on a real word, not on a bare symbol like ">>"
      if (!/[A-Za-z0-9]/.test(toks[start]!.text) || !/[A-Za-z0-9]/.test(toks[start + len - 1]!.text)) continue;
      if (matches(start, start + len)) hits.push([start, start + len]);
    }
  }
  return hits.length === 1 ? hits[0] : undefined;
}

export function learnAnchors(text: string, confirmed: Confirmed): AnchorDraft[] {
  const toks = tokens(text);

  // 1. Where each confirmed value sits (only if it sits in exactly one place).
  const where: Partial<Record<LearnField, [number, number]>> = {};
  if (confirmed.payee) {
    const target = normaliseWords(confirmed.payee);
    if (target) where.payee = locate(toks, (s, e) => normaliseWords(toks.slice(s, e).map((t) => t.text).join(' ')) === target, 6);
  }
  if (confirmed.reference) {
    const target = stripEdges(confirmed.reference).toLowerCase();
    if (target) where.reference = locate(toks, (s, e) => e - s === 1 && stripEdges(toks[s]!.lower) === target, 1);
  }
  if (confirmed.amountMinor !== undefined) {
    const exponent = currencyExponent(confirmed.currency ?? 'INR');
    where.amount = locate(toks, (s, e) => {
      if (e - s !== 1) return false;
      const number = /[0-9][0-9,]*(?:\.[0-9]+)?/.exec(toks[s]!.text.replace(/^(₹|rs\.?|[A-Za-z]{3})/i, ''));
      const parsed = number ? parseDecimal(number[0].replace(/[.,]+$/, ''), exponent) : undefined;
      return !!parsed?.ok && parsed.value === confirmed.amountMinor;
    }, 1);
  }
  if (confirmed.date) {
    where.date = locate(toks, (s, e) => {
      const written = toks.slice(s, e).map((t) => t.text).join(' ');
      // the words must be the date itself (not just contain one), allowing a stray bracket or comma around it
      return findDatesInText(written).some((h) => h.date === confirmed.date && h.text.length >= written.replace(/[^A-Za-z0-9]/g, '').length);
    }, 3);
  }

  // 2. The words around each value. They stop at the edge of any other value: those words change in every message.
  const inAnotherValue = (i: number, field: LearnField) => Object.entries(where).some(([f, r]) => f !== field && r && i >= r[0] && i < r[1]);
  const out: AnchorDraft[] = [];
  for (const [field, range] of Object.entries(where) as [LearnField, [number, number] | undefined][]) {
    if (!range) continue;
    const before: string[] = [];
    for (let i = range[0] - 1; i >= 0 && before.length < 2; i--) {
      if (hasDigit(toks[i]!.lower) || inAnotherValue(i, field)) break;
      before.unshift(toks[i]!.lower);
    }
    const next = toks[range[1]];
    const after = next && !hasDigit(next.lower) && !inAnotherValue(range[1], field) ? next.lower : null;
    if (before.length || after) out.push({ field, before, after });
  }
  return out;
}

const MAX_CAPTURE: Record<LearnField, number> = { payee: 6, reference: 1, amount: 1, date: 3 };

/** Reads one field from a text using remembered anchors, most-used first. Returns a form patch, or nothing. */
export function applyAnchors(text: string, anchors: Anchor[], field: LearnField) {
  const toks = tokens(text);
  for (const anchor of anchors.filter((a) => a.field === field && a.before.length > 0).sort((a, b) => b.count - a.count)) {
    for (let i = 0; i + anchor.before.length <= toks.length; i++) {
      if (!anchor.before.every((word, k) => toks[i + k]!.lower === word)) continue;
      const start = i + anchor.before.length;
      let end = start;
      if (anchor.after) {
        const stop = toks.findIndex((t, j) => j > start - 1 && j < start + MAX_CAPTURE[field] + 1 && t.lower === anchor.after);
        if (stop <= start) continue;
        end = stop;
      } else if (field === 'payee') {
        while (end < toks.length && end - start < 4 && !hasDigit(toks[end]!.lower)) end++;
      } else {
        end = Math.min(toks.length, start + (field === 'date' ? 3 : 1));
      }
      const captured = toks.slice(start, end).map((t) => t.text).join(' ');
      if (!captured) continue;
      if (field === 'payee' || field === 'reference') {
        const value = captured.replace(/^[\s.,:;@#\-/()[\]<>]+|[\s.,:;@#\-/()[\]<>]+$/g, '').slice(0, field === 'payee' ? 80 : 60);
        if (value) return field === 'payee' ? { payee: value } : { reference: value };
        continue;
      }
      if (field === 'date') {
        // a date may be fewer words than the maximum; try the shortest reading that works
        for (let n = 1; n <= end - start; n++) {
          const r = assignSelection('date', toks.slice(start, start + n).map((t) => t.text).join(' '));
          if (r.ok) return r.patch;
        }
        continue;
      }
      const r = assignSelection(field, captured);
      if (r.ok) return r.patch;
    }
  }
  return undefined;
}
