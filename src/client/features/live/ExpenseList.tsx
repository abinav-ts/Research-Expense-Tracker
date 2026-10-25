import { Link } from 'react-router';
import { currencyExponent } from '../../../shared/currency.ts';
import { formatDateLabel } from '../../../shared/dates.ts';
import { groupByDay } from '../../../shared/grouping.ts';
import { formatInr, formatMinor } from '../../../shared/money.ts';
import { CATEGORY_LABELS, type Expense } from '../../../shared/types.ts';
import { chip } from '../../components/ui.ts';
import { ProofThumb } from './ProofView.tsx';

/** REQ-CAP-06: expenses grouped by day, newest first, each row linking to its detail. */
export function ExpenseList({ expenses }: { expenses: Expense[] }) {
  return (
    <div>
      {groupByDay(expenses).map((day) => (
        <section key={day.date} aria-label={formatDateLabel(day.date)} className="mb-6" data-testid="day-group">
          <h3 className="mb-2 flex justify-between border-b border-line pb-1 font-display text-lg font-semibold">
            <span>{formatDateLabel(day.date)}</span>
            <span className="amount" data-testid="day-total">{formatInr(day.totalMinor)}</span>
          </h3>
          <ul className="grid gap-2">
            {day.expenses.map((e) => {
              const foreign = e.originalCurrency !== 'INR';
              return (
                <li key={e.id}>
                  <Link to={`/expenses/${e.id}`} data-testid="expense-row" className={`flex items-center gap-3 rounded-xl border border-line bg-surface p-3 ${e.excluded ? 'opacity-60' : ''}`}>
                    {e.attachments[0] ? <ProofThumb file={e.attachments[0]} /> : <span aria-hidden="true" className="h-12 w-12 shrink-0 rounded-md border border-dashed border-line" />}
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold break-words">{e.payee}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        <span className={chip}>{e.categoryId ? CATEGORY_LABELS[e.categoryId] : 'No category'}</span>
                        <span className={chip}>{e.inrStatus === 'confirmed' ? '✓ Confirmed' : '◔ Pending'}</span>
                        {e.paymentMode === 'cash' && <span className={chip}>Cash</span>}
                        {e.excluded && <span className={chip}>Excluded</span>}
                      </span>
                    </span>
                    <span className="amount text-right">
                      <span className="block font-semibold">{formatInr(e.inrMinor)}</span>
                      {foreign && <span className="block text-sm text-ink-soft">{formatMinor(e.originalMinor, e.originalCurrency, currencyExponent(e.originalCurrency))}</span>}
                      {foreign && e.inrStatus === 'pending' && <span className="block text-sm font-semibold text-state-low">Estimated</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
