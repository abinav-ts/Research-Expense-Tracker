// The one way screens check a trip: build the claim draft from its expenses, work out what the grant's other trips have
// spent, run the rules. Pure.
import { buildClaimDraft } from '../claim-draft.ts';
import type { Expense, Flag, Grant, Trip } from '../types.ts';
import { evaluate, flagsByItem } from './evaluate.ts';

export function evaluateTrip(grant: Grant, trip: Trip, grantExpenses: Expense[]): { flags: Flag[]; byItem: Map<string, Flag[]> } {
  const tripExpenses = grantExpenses.filter((e) => e.tripId === trip.id);
  const otherSpendMinor = grantExpenses.filter((e) => e.tripId !== trip.id && !e.excluded).reduce((sum, e) => sum + e.inrMinor, 0);
  const flags = evaluate(buildClaimDraft(grant, trip, tripExpenses), { otherSpendMinor });
  return { flags, byItem: flagsByItem(flags) };
}
