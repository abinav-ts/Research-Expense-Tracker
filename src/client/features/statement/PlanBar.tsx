// REQ-CSV-12: the bar at the bottom of the statement screen. Choices above are drafts; this button saves them all and goes
// back to the trip.
import { planCounts, type Plan } from '../../../shared/statement-plan.ts';
import { btnPrimary } from '../../components/ui.ts';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function describePlan(plan: Plan): string {
  const c = planCounts(plan);
  const parts = [
    c.matches > 0 && plural(c.matches, 'match', 'matches'),
    c.adds > 0 && `${plural(c.adds, 'debit', 'debits')} to add`,
    c.unlinks > 0 && `${plural(c.unlinks, 'match', 'matches')} to take back`,
    c.removes > 0 && `${plural(c.removes, 'expense', 'expenses')} to remove`,
  ].filter(Boolean);
  return parts.join(' · ');
}

export function PlanBar({ plan, unmatched, saving, onConfirm }: { plan: Plan; unmatched: number; saving: boolean; onConfirm: () => void }) {
  const empty = planCounts(plan).total === 0;
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 grid gap-2 border-t-2 border-ink bg-surface p-4" data-testid="plan-bar" role="region" aria-label="Confirm your choices">
      <p className="font-semibold" data-testid="plan-summary" role="status">{empty ? 'No changes yet.' : describePlan(plan)}</p>
      {unmatched > 0 && (
        <p className="text-sm text-ink-soft" data-testid="plan-unmatched">
          {plural(unmatched, 'tracked expense is', 'tracked expenses are')} still not matched. {unmatched === 1 ? 'It stays' : 'They stay'} pending and cannot be claimed until matched.
        </p>
      )}
      <p className="text-sm text-ink-soft">Your choices are saved only when you press the button. Leaving this page any other way discards them.</p>
      <button type="button" className={btnPrimary} disabled={saving} onClick={onConfirm}>{saving ? 'Saving…' : empty ? 'Done' : 'Confirm changes'}</button>
    </div>
  );
}
