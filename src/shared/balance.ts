// REQ-BAL-01, -02, -06: pure balance maths. No clock, no storage; integer paise only (REQ-NFR-04).
import { formatInr } from './money.ts';
import type { Expense, Grant } from './types.ts';

export type BalanceState = 'healthy' | 'low' | 'over';

export interface Balance {
  totalMinor: number;
  utilisedBeforeMinor: number;
  confirmedMinor: number;
  pendingMinor: number;
  remainingMinor: number;
  /** Whole percent of the sanctioned total remaining, rounded down; 0 when overspent. */
  percentRemaining: number;
  state: BalanceState;
}

export function balanceState(remainingMinor: number, totalMinor: number): BalanceState {
  if (remainingMinor < 0) return 'over';
  return remainingMinor * 5 >= totalMinor ? 'healthy' : 'low'; // ≥ 20 %
}

/** `expenses` = every expense of every trip of the grant. Excluded ones do not count. */
export function computeBalance(
  grant: Pick<Grant, 'totalMinor' | 'utilisedBeforeMinor'>,
  expenses: Pick<Expense, 'inrMinor' | 'inrStatus' | 'excluded'>[],
): Balance {
  let confirmedMinor = 0;
  let pendingMinor = 0;
  for (const e of expenses) {
    if (e.excluded) continue;
    if (e.inrStatus === 'confirmed') confirmedMinor += e.inrMinor;
    else pendingMinor += e.inrMinor;
  }
  const remainingMinor = grant.totalMinor - grant.utilisedBeforeMinor - confirmedMinor - pendingMinor;
  const percentRemaining = remainingMinor <= 0 ? 0 : Math.floor((remainingMinor * 100) / grant.totalMinor);
  return {
    totalMinor: grant.totalMinor,
    utilisedBeforeMinor: grant.utilisedBeforeMinor,
    confirmedMinor,
    pendingMinor,
    remainingMinor,
    percentRemaining,
    state: balanceState(remainingMinor, grant.totalMinor),
  };
}

export const STATE_LABELS: Record<BalanceState, string> = { healthy: 'Healthy', low: 'Low', over: 'Overspent' };

/** "₹58,400.00 left" or "Overspent by ₹0.01". */
export function remainingText(b: Balance): string {
  return b.remainingMinor < 0 ? `Overspent by ${formatInr(-b.remainingMinor)}` : `${formatInr(b.remainingMinor)} left`;
}

/** "₹6,200.00 of spend is pending verification", or undefined when nothing is pending. */
export function pendingText(b: Balance): string | undefined {
  return b.pendingMinor > 0 ? `${formatInr(b.pendingMinor)} of spend is pending verification` : undefined;
}

/** Accessible name: "Grant balance: ₹60,000.00 remaining, 60 percent, Healthy". */
export function balanceLabel(b: Balance): string {
  const amount = b.remainingMinor < 0 ? `overspent by ${formatInr(-b.remainingMinor)}` : `${formatInr(b.remainingMinor)} remaining, ${b.percentRemaining} percent`;
  const pending = pendingText(b);
  return `Grant balance: ${amount}, ${STATE_LABELS[b.state]}${pending ? `. ${pending}` : ''}`;
}
