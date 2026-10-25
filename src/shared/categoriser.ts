// REQ-CAP-14: suggest a category from the payee; the user always confirms it.
import type { CategoryId } from './types.ts';

/** Normalised payee used as the memory key: lowercase words only. */
export function payeeKey(payee: string): string {
  return payee.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Ambiguous aggregators get two candidate chips instead of one pre-selected choice.
const AGGREGATORS = ['makemytrip', 'goibibo', 'cleartrip', 'yatra', 'ixigo', 'easemytrip', 'expedia', 'booking com'];
const AGGREGATOR_CANDIDATES: CategoryId[] = ['airfare', 'accommodation'];

const KEYWORDS: [CategoryId, string[]][] = [
  ['rail_bus', ['irctc', 'railway', 'railways', 'rail', 'redbus', 'trenitalia', 'sncf', 'eurostar', 'flixbus', 'bus', 'deutsche bahn', 'comboios']],
  ['airfare', ['air india', 'indigo', 'spicejet', 'vistara', 'akasa', 'emirates', 'lufthansa', 'british airways', 'airways', 'airlines', 'airline', 'ryanair', 'easyjet', 'tap portugal', 'qatar', 'etihad', 'singapore air']],
  ['local_transport', ['uber', 'ola', 'rapido', 'lyft', 'bolt', 'taxi', 'cab', 'cabs', 'metro', 'grab', 'free now']],
  ['accommodation', ['hotel', 'hotels', 'inn', 'resort', 'hostel', 'airbnb', 'oyo', 'marriott', 'hilton', 'hyatt', 'lodge', 'suites', 'guest house']],
  ['meals', ['restaurant', 'cafe', 'coffee', 'starbucks', 'mcdonalds', 'kfc', 'zomato', 'swiggy', 'pizza', 'bakery', 'diner', 'canteen', 'dominos', 'food', 'kitchen', 'bistro']],
  ['registration', ['conference', 'symposium', 'congress', 'society', 'workshop', 'summit', 'registration', 'ieee', 'acm']],
  ['visa_insurance', ['visa', 'insurance', 'vfs', 'embassy', 'consulate']],
];

export type Suggestion =
  | { source: 'remembered'; categories: [CategoryId] }
  | { source: 'keyword'; categories: CategoryId[] }
  | { source: 'none'; categories: [] };

const hasPhrase = (words: string, phrase: string) => ` ${words} `.includes(` ${phrase} `);

/** `memory` maps payeeKey → the category the user chose last time. Remembered choices win over keywords. */
export function suggestCategory(payee: string, memory: ReadonlyMap<string, CategoryId> | Record<string, CategoryId> = {}): Suggestion {
  const key = payeeKey(payee);
  if (!key) return { source: 'none', categories: [] };
  const remembered = memory instanceof Map ? memory.get(key) : (memory as Record<string, CategoryId>)[key];
  if (remembered) return { source: 'remembered', categories: [remembered] };
  if (AGGREGATORS.some((a) => hasPhrase(key, a) || key.replaceAll(' ', '').includes(a.replaceAll(' ', '')))) {
    return { source: 'keyword', categories: AGGREGATOR_CANDIDATES };
  }
  for (const [category, words] of KEYWORDS) {
    if (words.some((w) => hasPhrase(key, w))) return { source: 'keyword', categories: [category] };
  }
  return { source: 'none', categories: [] };
}
