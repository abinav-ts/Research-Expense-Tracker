import { describe, expect, it } from 'vitest';
import { microToText, validateTripForm, type TripFormInput } from '../../src/shared/trip.ts';

const grant = { startDate: '2026-04-01', endDate: '2027-03-31' };
const form: TripFormInput = {
  name: 'SampleConf 2026', city: 'Lisbon', country: 'Portugal', startDate: '2026-11-10', endDate: '2026-11-14',
  budgetText: '', rates: [],
};

describe('REQ-SET-02: trip linked to one grant', () => {
  it('REQ-SET-02: accepts SampleConf 2026 in Lisbon, Portugal with no budget and no warnings', () => {
    expect(validateTripForm(form, grant)).toEqual({
      ok: true, warnings: [],
      value: { name: 'SampleConf 2026', city: 'Lisbon', country: 'Portugal', startDate: '2026-11-10', endDate: '2026-11-14' },
    });
  });

  it('REQ-SET-02: name, city and country are required; end is not before start', () => {
    const r = validateTripForm({ ...form, name: '', city: ' ', country: '', endDate: '2026-11-09' }, grant);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['city', 'country', 'endDate', 'name']);
  });

  it('REQ-SET-02: an optional budget must be > 0', () => {
    expect(validateTripForm({ ...form, budgetText: '0' }, grant).ok).toBe(false);
    const r = validateTripForm({ ...form, budgetText: '50,000' }, grant);
    expect(r.ok && r.value.budgetMinor).toBe(5_000_000);
  });

  it('REQ-SET-02: dates outside the grant period give a warning but still save', () => {
    const r = validateTripForm({ ...form, startDate: '2027-03-30', endDate: '2027-04-02' }, grant);
    expect(r.ok && r.warnings).toEqual(["These dates fall outside the grant's period."]);
  });

  it('REQ-SET-02: "Default rates" become integer micro-rates keyed by currency code', () => {
    const r = validateTripForm({ ...form, rates: [{ currency: 'eur', rateText: '95.5' }, { currency: '', rateText: '' }, { currency: 'JPY', rateText: '0.63' }] }, grant);
    expect(r.ok && r.value.fxRatesMicro).toEqual({ EUR: 95_500_000, JPY: 630_000 });
  });

  it('REQ-SET-02: a rate row needs a non-INR 3-letter code and a positive rate', () => {
    expect(validateTripForm({ ...form, rates: [{ currency: 'INR', rateText: '1' }] }, grant).ok).toBe(false);
    expect(validateTripForm({ ...form, rates: [{ currency: 'EUR', rateText: '0' }] }, grant).ok).toBe(false);
    expect(validateTripForm({ ...form, rates: [{ currency: 'EUR', rateText: '' }] }, grant).ok).toBe(false);
    expect(validateTripForm({ ...form, rates: [{ currency: 'EURO', rateText: '95' }] }, grant).ok).toBe(false);
  });

  it('REQ-SET-02: stored micro-rates convert back to the typed text', () => {
    expect(microToText(95_500_000)).toBe('95.5');
    expect(microToText(630_000)).toBe('0.63');
    expect(microToText(95_000_000)).toBe('95');
  });
});
