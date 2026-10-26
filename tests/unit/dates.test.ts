import { describe, expect, it } from 'vitest';
import { findDateInText, findDatesInText, monthFromWord } from '../../src/shared/dates.ts';

const dates = (text: string, repairDays = false) => findDatesInText(text, { repairDays }).map((h) => h.date);

describe('REQ-CAP-15: dates read from noisy text', () => {
  it('REQ-CAP-15: month names with one wrong letter are still months ("hugust", "bugust", "Auqust")', () => {
    expect(monthFromWord('August')).toBe(8);
    for (const noisy of ['hugust', 'bugust', 'pugust', 'Auqust', 'Septembor', 'Novembcr']) expect(monthFromWord(noisy), noisy).toBeDefined();
    expect(monthFromWord('hugust')).toBe(8);
  });

  it('REQ-CAP-15: words that are not months are not fuzzy-matched (short words, ordinary words)', () => {
    for (const word of ['Mon', 'Marketing', 'Sample', 'Total', 'Mat', 'Jam']) expect(monthFromWord(word), word).toBeUndefined();
  });

  it('REQ-CAP-15: "22-hugust-2026(21:11)" reads as 22 Aug 2026', () => {
    expect(dates('Date : 22-hugust-2026(21:11) T#6')).toEqual(['2026-08-22']);
  });

  it('REQ-CAP-15: look-alike characters in digits are repaired (2O-Nov-2O26, l2 Nov 2026)', () => {
    expect(dates('2O-Nov-2O26')).toEqual(['2026-11-20']);
    expect(dates('l2 Nov 2026')).toEqual(['2026-11-12']);
  });

  it('REQ-CAP-15: an impossible day such as 72 offers 12 and 22 only when repair is asked for, marked as a guess', () => {
    expect(dates('72-bugust-2026')).toEqual([]);
    expect(dates('72-bugust-2026', true).sort()).toEqual(['2026-08-12', '2026-08-22']);
    expect(findDatesInText('72-bugust-2026', { repairDays: true }).every((h) => h.repaired)).toBe(true);
  });

  it('REQ-CAP-15: capital letters of an earlier word are not taken for a day, so the real date is still found', () => {
    // "STORES" next to a following number once swallowed the real date.
    expect(dates('Paid to\nRAMESH STORES\n12 Nov 2026, 10:42 am\nSAMPLE 26')).toEqual(['2026-11-12']);
    expect(dates('BOSS 12 Nov 2026')).toEqual(['2026-11-12']);
  });

  it('REQ-CAP-15: every date is returned in reading order with its position, and the first one is findDateInText', () => {
    const text = 'Invoice date: 22 Aug 2026\nDue: 05/09/2026';
    expect(findDatesInText(text).map((h) => [h.date, h.index])).toEqual([['2026-08-22', 14], ['2026-09-05', 31]]);
    expect(findDateInText(text)).toBe('2026-08-22');
  });

  it('REQ-CAP-15: month-first, ordinal, ISO and slash forms all read, and impossible dates are rejected', () => {
    expect(dates('Nov 12, 2026')).toEqual(['2026-11-12']);
    expect(dates('12th November 2026')).toEqual(['2026-11-12']);
    expect(dates('2026-11-12')).toEqual(['2026-11-12']);
    expect(dates('12/11/26')).toEqual(['2026-11-12']);
    expect(dates('31 Feb 2026')).toEqual([]);
  });
});
