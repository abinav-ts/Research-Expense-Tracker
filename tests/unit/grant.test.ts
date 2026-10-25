import { describe, expect, it } from 'vitest';
import { validateGrantForm, type GrantFormInput } from '../../src/shared/grant.ts';

const form: GrantFormInput = {
  name: 'DST Sample Grant', sponsor: 'Sample Agency', totalText: '1,00,000.00', utilisedText: '20,000.00',
  startDate: '2026-04-01', endDate: '2027-03-31',
};

describe('REQ-SET-01: grant validation and money parsing', () => {
  it('REQ-SET-01: accepts the sample grant and stores integer paise', () => {
    const r = validateGrantForm(form);
    expect(r).toEqual({
      ok: true,
      value: { name: 'DST Sample Grant', sponsor: 'Sample Agency', totalMinor: 10_000_000, utilisedBeforeMinor: 2_000_000, startDate: '2026-04-01', endDate: '2027-03-31' },
    });
  });

  it('REQ-SET-01: accepts plain digits and treats an empty utilised amount as zero', () => {
    const r = validateGrantForm({ ...form, totalText: '100000.5', utilisedText: '' });
    expect(r.ok && [r.value.totalMinor, r.value.utilisedBeforeMinor]).toEqual([10_000_050, 0]);
  });

  it('REQ-SET-01: name is required and at most 80 characters', () => {
    expect(validateGrantForm({ ...form, name: ' ' })).toMatchObject({ ok: false, errors: { name: 'Enter a grant name' } });
    expect(validateGrantForm({ ...form, name: 'x'.repeat(81) })).toMatchObject({ ok: false, errors: { name: 'At most 80 characters' } });
    expect(validateGrantForm({ ...form, name: 'x'.repeat(80) }).ok).toBe(true);
  });

  it('REQ-SET-01: total must be > 0 and have at most 2 decimals', () => {
    expect(validateGrantForm({ ...form, totalText: '0' })).toMatchObject({ ok: false, errors: { totalText: 'Enter an amount greater than 0' } });
    expect(validateGrantForm({ ...form, totalText: '10.123' })).toMatchObject({ ok: false, errors: { totalText: 'At most 2 decimal places' } });
  });

  it('REQ-SET-01: utilised must be ≥ 0 and not more than the total', () => {
    expect(validateGrantForm({ ...form, utilisedText: '-1' }).ok).toBe(false);
    expect(validateGrantForm({ ...form, utilisedText: '1,00,000.01' })).toMatchObject({ ok: false, errors: { utilisedText: 'Cannot be more than the sanctioned total' } });
    expect(validateGrantForm({ ...form, utilisedText: '1,00,000' }).ok).toBe(true);
  });

  it('REQ-SET-01: end date must not be before the start date', () => {
    expect(validateGrantForm({ ...form, endDate: '2026-03-31' })).toMatchObject({ ok: false, errors: { endDate: 'End date must be on or after the start date' } });
    expect(validateGrantForm({ ...form, endDate: '2026-04-01' }).ok).toBe(true);
    expect(validateGrantForm({ ...form, startDate: '' }).ok).toBe(false);
  });

  it('REQ-SET-01: every failure is reported together so each field can show its own message', () => {
    const r = validateGrantForm({ name: '', sponsor: '', totalText: 'abc', utilisedText: 'x', startDate: '', endDate: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['endDate', 'name', 'startDate', 'totalText', 'utilisedText']);
  });
});
