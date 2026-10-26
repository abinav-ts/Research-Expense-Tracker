import { verifiedShare } from '../../../shared/balance.ts';
import type { Expense } from '../../../shared/types.ts';

/** REQ-BAL-07: how much of the bank-paid spend has been checked against the statement. */
export function VerifiedMeter({ expenses }: { expenses: Expense[] }) {
  const { percent } = verifiedShare(expenses);
  if (percent === undefined) return null;
  return (
    <div className="mt-3" data-testid="verified-meter" role="group" aria-label={`${percent} percent of spending verified against your bank statement`}>
      <p className="amount text-sm font-semibold text-breeze-deep">
        <span data-testid="verified-percent">{percent}% verified</span>
        <span className="font-normal text-ink-soft"> against your bank statement</span>
      </p>
      <div className="mt-1 h-2 rounded-full bg-line" aria-hidden="true">
        <div className="h-2 rounded-full bg-breeze-deep" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
