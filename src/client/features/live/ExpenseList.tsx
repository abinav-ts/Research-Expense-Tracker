import { Link } from 'react-router';
import { currencyExponent } from '../../../shared/currency.ts';
import { formatDateLabel } from '../../../shared/dates.ts';
import { groupByDay } from '../../../shared/grouping.ts';
import { formatInr, formatMinor } from '../../../shared/money.ts';
import { RULE_LABELS } from '../../../shared/rules/evaluate.ts';
import { CATEGORY_LABELS, type Expense, type Flag } from '../../../shared/types.ts';
import { chip } from '../../components/ui.ts';
import { ProofThumb } from './ProofView.tsx';

/** UNVERIFIED_AMOUNT is shown by the verified percentage and by grouping, not as a chip on every row (REQ-RULE-11, REQ-BAL-07). */
export const shownFlags = (flags: Flag[] | undefined): Flag[] => (flags ?? []).filter((f) => f.ruleId !== 'UNVERIFIED_AMOUNT');

function FlagChips({ flags }: { flags: Flag[] }) {
  const shown = [...flags].sort((a, b) => Number(b.severity === 'error') - Number(a.severity === 'error'));
  return (
    <>
      {shown.slice(0, 2).map((f) => (
        <span
          key={f.ruleId} data-testid="flag-chip" data-rule={f.ruleId} title={f.message}
          className={`${chip} font-semibold ${f.severity === 'error' ? 'border-state-over text-state-over' : 'border-state-low text-state-low'}`}
        >
          {f.severity === 'error' ? '✖' : '⚠'} {RULE_LABELS[f.ruleId] ?? f.ruleId}
        </span>
      ))}
      {shown.length > 2 && <span className={chip} data-testid="flag-more">+{shown.length - 2} more</span>}
    </>
  );
}

function Row({ e, flags, verified }: { e: Expense; flags: Flag[] | undefined; verified: boolean }) {
  const foreign = e.originalCurrency !== 'INR';
  return (
    <li>
      <Link
        to={`/expenses/${e.id}`} data-testid="expense-row" data-verified={verified}
        className={`flex items-center gap-3 rounded-xl border p-3 ${verified ? 'border-breeze-deep/60 bg-ground' : 'border-line bg-surface'} ${e.excluded ? 'opacity-60' : ''}`}
      >
        {e.attachments[0] ? <ProofThumb file={e.attachments[0]} /> : <span aria-hidden="true" className="h-12 w-12 shrink-0 rounded-md border border-dashed border-line" />}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold [overflow-wrap:anywhere]">{e.payee}</span>
          <span className="mt-1 flex flex-wrap gap-1">
            <span className={chip}>{e.categoryId ? CATEGORY_LABELS[e.categoryId] : 'No category'}</span>
            <span className={chip}>{e.inrStatus === 'confirmed' ? '✓ Confirmed' : '◔ Pending'}</span>
            {e.paymentMode === 'cash' && <span className={chip}>Cash</span>}
            {e.excluded && <span className={chip}>Excluded</span>}
            <FlagChips flags={shownFlags(flags)} />
          </span>
          {e.justification && <span className="mt-1 block text-sm text-ink-soft" data-testid="row-justification">“{e.justification}”</span>}
        </span>
        <span className="amount text-right">
          <span className="block font-semibold">{formatInr(e.inrMinor)}</span>
          {foreign && <span className="block text-sm text-ink-soft">{formatMinor(e.originalMinor, e.originalCurrency, currencyExponent(e.originalCurrency))}</span>}
          {foreign && e.inrStatus === 'pending' && <span className="block text-sm font-semibold text-state-low">Estimated</span>}
        </span>
      </Link>
    </li>
  );
}

function Section({ title, expenses, flags, verified, id }: { title: string; expenses: Expense[]; flags: ReadonlyMap<string, Flag[]>; verified: boolean; id: string }) {
  if (expenses.length === 0) return null;
  return (
    <section aria-labelledby={id} className="mb-8" data-testid={verified ? 'section-verified' : 'section-to-verify'}>
      <h2 id={id} className={`mb-3 font-display text-xl font-semibold ${verified ? 'text-breeze-deep' : ''}`}>
        {verified && <span aria-hidden="true">✓ </span>}{title} ({expenses.length})
      </h2>
      {groupByDay(expenses).map((day) => (
        <section key={day.date} aria-label={`${title}: ${formatDateLabel(day.date)}`} className="mb-5" data-testid="day-group">
          <h3 className="mb-2 flex justify-between border-b border-line pb-1 font-display text-lg font-semibold">
            <span>{formatDateLabel(day.date)}</span>
            <span className="amount" data-testid="day-total">{formatInr(day.totalMinor)}</span>
          </h3>
          <ul className="grid gap-2">{day.expenses.map((e) => <Row key={e.id} e={e} flags={flags.get(e.id)} verified={verified} />)}</ul>
        </section>
      ))}
    </section>
  );
}

/**
 * REQ-CAP-06, REQ-BAL-07: expenses grouped by day, in two sections. Those still to verify against the bank statement come
 * first; verified ones sit below in their own colour. Cash has no statement line, so it stays in the first section.
 */
export function ExpenseList({ expenses, flags }: { expenses: Expense[]; flags: ReadonlyMap<string, Flag[]> }) {
  return (
    <div>
      <Section id="to-verify-heading" title="Still to verify" expenses={expenses.filter((e) => e.inrStatus !== 'confirmed')} flags={flags} verified={false} />
      <Section id="verified-heading" title="Verified against your statement" expenses={expenses.filter((e) => e.inrStatus === 'confirmed')} flags={flags} verified />
    </div>
  );
}
