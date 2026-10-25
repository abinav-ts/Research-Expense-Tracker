// REQ-RULE-02 DATE_OUT_OF_WINDOW: an item dated before trip start − buffer days, or after trip end + buffer days, is flagged.
// Pure; dates are compared as YYYY-MM-DD strings (REQ-NFR-05).
import { addDays, formatDateLabel } from '../dates.ts';
import type { Flag } from '../types.ts';

export interface DateWindow {
  start: string;
  end: string;
}

export function allowedWindow(trip: { startDate: string; endDate: string }, bufferDays: number): DateWindow {
  return { start: addDays(trip.startDate, -bufferDays), end: addDays(trip.endDate, bufferDays) };
}

export function dateWindowFlag(item: { id: string; date: string }, trip: { startDate: string; endDate: string }, bufferDays: number): Flag | undefined {
  const w = allowedWindow(trip, bufferDays);
  if (item.date >= w.start && item.date <= w.end) return undefined;
  const buffer = bufferDays === 0 ? 'the trip dates' : `the trip dates ± ${bufferDays} ${bufferDays === 1 ? 'day' : 'days'}`;
  return {
    ruleId: 'DATE_OUT_OF_WINDOW',
    severity: 'warn',
    itemId: item.id,
    message: `Dated ${formatDateLabel(item.date)}, outside the allowed window ${formatDateLabel(w.start)} to ${formatDateLabel(w.end)} (${buffer}).`,
  };
}
