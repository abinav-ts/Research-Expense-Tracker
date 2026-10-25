import { z } from 'zod';
import { isValidDate } from './dates.ts';
import { parseAmount, parseDecimal } from './money.ts';
import { CATEGORY_IDS, type CategoryId, type CategoryRule, type GrantRules } from './types.ts';

// ---- Rules: defaults, normalising old data, strict validation (REQ-SET-03) ----

export const DEFAULT_TRAVEL_BUFFER_DAYS = 2;
const defaultRule = (): CategoryRule => ({ eligible: true, requiresProof: true });

export function defaultRules(): GrantRules {
  const categories = {} as Record<CategoryId, CategoryRule>;
  for (const id of CATEGORY_IDS) categories[id] = defaultRule();
  return { travelBufferDays: DEFAULT_TRAVEL_BUFFER_DAYS, categories };
}

const ruleSchema = z.object({
  eligible: z.boolean(),
  capPerTripMinor: z.number().int().positive().optional(),
  requiresProof: z.boolean(),
});

/** Strict: exactly the 8 known categories, no extras, no gaps. Used when saving. */
export const grantRulesSchema = z.object({
  travelBufferDays: z.number().int().min(0).max(7),
  categories: z.strictObject(Object.fromEntries(CATEGORY_IDS.map((id) => [id, ruleSchema])) as Record<CategoryId, typeof ruleSchema>),
});

/** Fills anything missing or invalid in stored (older) data with defaults and changes nothing else. */
export function normaliseRules(raw: unknown): GrantRules {
  const out = defaultRules();
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as { travelBufferDays?: unknown; categories?: Record<string, Partial<CategoryRule> | undefined> };
  if (typeof r.travelBufferDays === 'number' && Number.isInteger(r.travelBufferDays)) out.travelBufferDays = r.travelBufferDays;
  for (const id of CATEGORY_IDS) {
    const c = r.categories?.[id];
    if (!c) continue;
    if (typeof c.eligible === 'boolean') out.categories[id].eligible = c.eligible;
    if (typeof c.requiresProof === 'boolean') out.categories[id].requiresProof = c.requiresProof;
    if (typeof c.capPerTripMinor === 'number' && Number.isSafeInteger(c.capPerTripMinor) && c.capPerTripMinor > 0) {
      out.categories[id].capPerTripMinor = c.capPerTripMinor;
    }
  }
  return out;
}

// ---- Grant form (REQ-SET-01) ----

export interface GrantFormInput {
  name: string;
  sponsor: string;
  totalText: string;
  utilisedText: string;
  startDate: string;
  endDate: string;
}
export interface GrantFields {
  name: string;
  sponsor: string;
  totalMinor: number;
  utilisedBeforeMinor: number;
  startDate: string;
  endDate: string;
}
export type FieldErrors<K extends string> = Partial<Record<K, string>>;
export type GrantFormResult =
  | { ok: true; value: GrantFields }
  | { ok: false; errors: FieldErrors<keyof GrantFormInput> };

export function validateGrantForm(input: GrantFormInput): GrantFormResult {
  const errors: FieldErrors<keyof GrantFormInput> = {};
  const name = input.name.trim();
  const sponsor = input.sponsor.trim();
  if (!name) errors.name = 'Enter a grant name';
  else if (name.length > 80) errors.name = 'At most 80 characters';
  if (sponsor.length > 80) errors.sponsor = 'At most 80 characters';

  const total = parseAmount(input.totalText);
  if (!total.ok) errors.totalText = total.error;
  let utilised = 0;
  if (input.utilisedText.trim()) {
    const u = parseDecimal(input.utilisedText, 2);
    if (!u.ok) errors.utilisedText = u.error;
    else utilised = u.value;
  }
  if (total.ok && !errors.utilisedText && utilised > total.value) errors.utilisedText = 'Cannot be more than the sanctioned total';

  if (!isValidDate(input.startDate)) errors.startDate = 'Enter a start date';
  if (!isValidDate(input.endDate)) errors.endDate = 'Enter an end date';
  else if (isValidDate(input.startDate) && input.endDate < input.startDate) errors.endDate = 'End date must be on or after the start date';

  if (Object.keys(errors).length || !total.ok) return { ok: false, errors };
  return { ok: true, value: { name, sponsor, totalMinor: total.value, utilisedBeforeMinor: utilised, startDate: input.startDate, endDate: input.endDate } };
}

// ---- Delete confirmation wording (REQ-SET-01) ----

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** "2 trips, 7 expenses and 1 document will be deleted" */
export function deletionImpactText(impact: { trips: number; expenses: number; documents: number }): string {
  return `${count(impact.trips, 'trip')}, ${count(impact.expenses, 'expense')} and ${count(impact.documents, 'document')} will be deleted`;
}
