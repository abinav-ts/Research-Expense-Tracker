import { balanceLabel, computeBalance, pendingText, remainingText, STATE_LABELS, type BalanceState } from '../../../shared/balance.ts';
import { formatInr } from '../../../shared/money.ts';
import type { Expense, Grant } from '../../../shared/types.ts';

const TEXT_COLOUR: Record<BalanceState, string> = { healthy: 'text-state-healthy', low: 'text-state-low', over: 'text-state-over' };

// State is shown by word + icon + colour, never colour alone (REQ-BAL-02, REQ-NFR-02).
function StateIcon({ state }: { state: BalanceState }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
  if (state === 'healthy') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.5" /></svg>;
  if (state === 'low') return <svg {...common}><path d="M12 3.5l9 16H3z" /><path d="M12 10v4M12 17h.01" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></svg>;
}

export function BalanceIndicator({ grant, expenses }: { grant: Pick<Grant, 'totalMinor' | 'utilisedBeforeMinor'>; expenses: Expense[] }) {
  const b = computeBalance(grant, expenses);
  const pending = pendingText(b);
  return (
    <div role="group" aria-label={balanceLabel(b)} data-testid="balance-indicator" data-state={b.state}>
      <p className={`flex items-center gap-2 text-sm font-semibold tracking-wide uppercase ${TEXT_COLOUR[b.state]}`}>
        <StateIcon state={b.state} />
        <span data-testid="balance-state">{STATE_LABELS[b.state]}</span>
      </p>
      <p className={`amount text-[32px] leading-9 font-bold ${TEXT_COLOUR[b.state]}`} data-testid="balance-remaining">{remainingText(b)}</p>
      <p className="amount text-sm text-ink-soft" data-testid="balance-percent">
        {b.state === 'over' ? `of ${formatInr(b.totalMinor)} sanctioned` : `${b.percentRemaining}% of ${formatInr(b.totalMinor)} sanctioned`}
      </p>
      {pending && <p className="amount mt-1 text-sm font-semibold text-state-low" data-testid="balance-pending">{pending}</p>}
      <div className="mt-3 h-2 rounded-full bg-line" aria-hidden="true">
        <div className="h-2 rounded-full bg-breeze" style={{ width: `${b.percentRemaining}%` }} />
      </div>
    </div>
  );
}
