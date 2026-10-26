import { afterEach, describe, expect, it } from 'vitest';
import { formatDateLabel, addDays, daysBetween, isValidDate } from '../../src/shared/dates.ts';
import { dateWindowFlag } from '../../src/shared/rules/date-window.ts';
import { todayLocal } from '../../src/client/lib/today.ts';
import { applyMapping, guessMapping } from '../../src/shared/statement-map.ts';
import { CLAIM_LIMITS, claimPayloadSchema } from '../../src/shared/claim.ts';
import { MAX_CLAIM_FILE_BYTES } from '../../src/shared/files.ts';
import { sampleView } from '../../src/server/claims/sample.ts';

const realTz = process.env.TZ;
afterEach(() => {
  if (realTz === undefined) delete process.env.TZ;
  else process.env.TZ = realTz;
});

// Time zones on both sides of the date line and either side of India, plus one with a daylight-saving change in March.
const ZONES = ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/Los_Angeles', 'Asia/Kolkata', 'UTC', 'Europe/Lisbon'];

describe('REQ-NFR-05: dates are calendar dates, not moments', () => {
  it.each(ZONES)('REQ-NFR-05: labels, arithmetic and validity of a stored date do not move in %s', (zone) => {
    process.env.TZ = zone;
    expect(formatDateLabel('2026-11-10')).toBe('10 Nov 2026');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // across the European clock change
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-03-25', '2026-03-30')).toBe(5);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2); // across the end of summer time
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2028-02-29')).toBe(true);
  });

  it.each(ZONES)('REQ-NFR-05: the trip date window compares as text, so the same date is in or out in %s', (zone) => {
    process.env.TZ = zone;
    const trip = { startDate: '2026-11-10', endDate: '2026-11-14' };
    const on = (date: string) => dateWindowFlag({ id: 'x', date }, trip, 2);
    expect(on('2026-11-10')).toBeUndefined();
    expect(on('2026-11-08')).toBeUndefined(); // inside the buffer
    expect(on('2026-11-07')?.ruleId).toBe('DATE_OUT_OF_WINDOW');
    expect(on('2026-11-17')?.ruleId).toBe('DATE_OUT_OF_WINDOW');
  });

  it('REQ-NFR-05: "today" is the calendar date on the device, in the form YYYY-MM-DD', () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const zone of ZONES) {
      process.env.TZ = zone;
      const d = new Date();
      const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      expect(todayLocal(), zone).toBe(expected);
    }
  });

  it.each(ZONES)('REQ-NFR-05: a statement date read from text stays the same calendar date in %s', (zone) => {
    process.env.TZ = zone;
    const headers = ['Date', 'Narration', 'Withdrawal Amt.'];
    const rows = [{ line: 2, cells: ['01/11/26', 'CAFE', '10.00'] }, { line: 3, cells: ['31/12/26', 'LATE', '5.00'] }];
    const { mapping } = guessMapping(headers, rows);
    const out = applyMapping(rows, mapping as Parameters<typeof applyMapping>[1]);
    expect(out.debits.map((d) => d.date)).toEqual(['2026-11-01', '2026-12-31']);
  });
});

describe('REQ-NFR-07: limits on what is stored and sent', () => {
  it('REQ-NFR-07: the limits are 1 MB a file (D1 allows 2 MB a row), 40 attachments and 25 MB a claim, the same on the device and the server', () => {
    expect(CLAIM_LIMITS.fileBytes).toBe(1_000_000);
    expect(CLAIM_LIMITS.files).toBe(40);
    expect(CLAIM_LIMITS.totalBytes).toBe(25_000_000);
    expect(CLAIM_LIMITS.fileBytes).toBeLessThan(2 * 1024 * 1024);
    expect(MAX_CLAIM_FILE_BYTES).toBeGreaterThanOrEqual(CLAIM_LIMITS.fileBytes);
  });

  it('REQ-NFR-07: the claim schema refuses oversize or malformed fields', () => {
    const base = () => structuredClone(sampleView().payload);
    expect(claimPayloadSchema.safeParse(base()).success).toBe(true);
    const long = base(); long.items[0]!.description = 'x'.repeat(201);
    expect(claimPayloadSchema.safeParse(long).success).toBe(false);
    const frac = base(); frac.items[0]!.amountMinor = 10.5;
    expect(claimPayloadSchema.safeParse(frac).success).toBe(false);
    const neg = base(); neg.items[0]!.amountMinor = -1;
    expect(claimPayloadSchema.safeParse(neg).success).toBe(false);
    const badDate = base(); badDate.items[0]!.date = '12/11/2026';
    expect(claimPayloadSchema.safeParse(badDate).success).toBe(false);
    const badMime = base(); (badMime.files[0] as { mime: string }).mime = 'text/html';
    expect(claimPayloadSchema.safeParse(badMime).success).toBe(false);
    const none = base(); none.items = [];
    expect(claimPayloadSchema.safeParse(none).success).toBe(false);
    const manyItems = base(); manyItems.items = Array.from({ length: 201 }, (_, n) => ({ ...manyItems.items[0]!, id: `m${n}` }));
    expect(claimPayloadSchema.safeParse(manyItems).success).toBe(false);
  });
});
