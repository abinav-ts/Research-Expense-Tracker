import { describe, expect, it } from 'vitest';
import { defaultRules, grantRulesSchema, normaliseRules } from '../../src/shared/grant.ts';
import { CATEGORY_IDS, CATEGORY_LABELS } from '../../src/shared/types.ts';

describe('REQ-SET-03: categories with eligibility, caps, proof flag', () => {
  it('REQ-SET-03: a new grant has exactly the 8 categories, eligible, proof required, no cap, 2 buffer days', () => {
    const rules = defaultRules();
    expect(Object.keys(rules.categories).sort()).toEqual([...CATEGORY_IDS].sort());
    expect(CATEGORY_IDS).toHaveLength(8);
    expect(Object.values(CATEGORY_LABELS)).toEqual(['Registration', 'Airfare', 'Rail / bus', 'Local transport', 'Accommodation', 'Meals', 'Visa / insurance', 'Other']);
    for (const c of Object.values(rules.categories)) expect(c).toEqual({ eligible: true, requiresProof: true });
    expect(rules.travelBufferDays).toBe(2);
  });

  it('REQ-SET-03: older stored data missing categories or fields is filled with defaults, nothing else changes', () => {
    const old = { categories: { meals: { eligible: false }, airfare: { capPerTripMinor: 5_000_000 } } };
    const rules = normaliseRules(old);
    expect(rules.travelBufferDays).toBe(2);
    expect(rules.categories.meals).toEqual({ eligible: false, requiresProof: true });
    expect(rules.categories.airfare).toEqual({ eligible: true, requiresProof: true, capPerTripMinor: 5_000_000 });
    expect(rules.categories.registration).toEqual({ eligible: true, requiresProof: true });
    expect(normaliseRules(undefined)).toEqual(defaultRules());
    expect(normaliseRules({ travelBufferDays: 4 }).travelBufferDays).toBe(4);
  });

  it('REQ-SET-03: a full valid rule set passes the schema', () => {
    expect(grantRulesSchema.safeParse(defaultRules()).success).toBe(true);
  });

  it('REQ-SET-03: a category id not in the list is rejected when saving (zod)', () => {
    const rules = defaultRules();
    const bad = { ...rules, categories: { ...rules.categories, gifts: { eligible: true, requiresProof: true } } };
    expect(grantRulesSchema.safeParse(bad).success).toBe(false);
  });

  it('REQ-SET-03: a missing category or a bad cap or buffer is rejected when saving', () => {
    const rules = defaultRules();
    const { meals: _meals, ...fewer } = rules.categories;
    expect(grantRulesSchema.safeParse({ ...rules, categories: fewer }).success).toBe(false);
    expect(grantRulesSchema.safeParse({ ...rules, travelBufferDays: 9 }).success).toBe(false);
    expect(grantRulesSchema.safeParse({ ...rules, categories: { ...rules.categories, meals: { eligible: true, requiresProof: true, capPerTripMinor: -1 } } }).success).toBe(false);
  });
});
