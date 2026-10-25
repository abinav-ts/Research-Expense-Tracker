import { describe, expect, it } from 'vitest';
import { allowedWindow, dateWindowFlag } from '../../src/shared/rules/date-window.ts';

const trip = { startDate: '2026-11-10', endDate: '2026-11-14' };
const flag = (date: string, buffer = 2) => dateWindowFlag({ id: 'x', date }, trip, buffer);

describe('REQ-RULE-02: DATE_OUT_OF_WINDOW', () => {
  it('REQ-RULE-02: trip 10–14 Nov with a 2-day buffer allows 8 Nov to 16 Nov', () => {
    expect(allowedWindow(trip, 2)).toEqual({ start: '2026-11-08', end: '2026-11-16' });
  });

  it('REQ-RULE-02: an item on 2026-11-08 has no flag; 2026-11-07 gets a warn flag', () => {
    expect(flag('2026-11-08')).toBeUndefined();
    const f = flag('2026-11-07');
    expect(f).toMatchObject({ ruleId: 'DATE_OUT_OF_WINDOW', severity: 'warn', itemId: 'x' });
  });

  it('REQ-RULE-02: 2026-11-16 has no flag; 2026-11-17 flags', () => {
    expect(flag('2026-11-16')).toBeUndefined();
    expect(flag('2026-11-17')?.ruleId).toBe('DATE_OUT_OF_WINDOW');
  });

  it('REQ-RULE-02: the message includes the item date and the allowed window', () => {
    expect(flag('2026-10-25')!.message).toBe(
      'Dated 25 Oct 2026, outside the allowed window 8 Nov 2026 to 16 Nov 2026 (the trip dates ± 2 days).',
    );
  });

  it('REQ-RULE-02: the window follows the buffer; with 0 days only the trip dates are inside', () => {
    expect(flag('2026-11-09', 0)!.message).toContain('(the trip dates)');
    expect(flag('2026-11-10', 0)).toBeUndefined();
    expect(flag('2026-11-14', 0)).toBeUndefined();
    expect(flag('2026-11-15', 0)).toBeDefined();
    expect(flag('2026-11-17', 3)).toBeUndefined();
  });

  it('REQ-RULE-02: it crosses month and year ends correctly (dates compare as strings)', () => {
    const t = { startDate: '2027-01-02', endDate: '2027-01-03' };
    expect(dateWindowFlag({ id: 'y', date: '2026-12-31' }, t, 2)).toBeUndefined();
    expect(dateWindowFlag({ id: 'y', date: '2026-12-30' }, t, 2)).toBeDefined();
  });

  it('REQ-RULE-02: editing the trip dates changes the result for the same expense (re-evaluated, nothing stored)', () => {
    const item = { id: 'e', date: '2026-10-25' };
    expect(dateWindowFlag(item, trip, 2)).toBeDefined();
    expect(dateWindowFlag(item, { startDate: '2026-10-24', endDate: '2026-10-26' }, 2)).toBeUndefined();
  });
});
