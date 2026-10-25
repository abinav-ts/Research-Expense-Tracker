import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { formatDateLabel } from '../../../shared/dates.ts';
import { applyFilters, tripTotals, type ExpenseFilters } from '../../../shared/grouping.ts';
import { formatInr } from '../../../shared/money.ts';
import { dateWindowFlag } from '../../../shared/rules/date-window.ts';
import type { Flag } from '../../../shared/types.ts';
import { CATEGORY_IDS, CATEGORY_LABELS } from '../../../shared/types.ts';
import { SelectField } from '../../components/fields.tsx';
import { btn, btnPrimary, card, h1, mutedText } from '../../components/ui.ts';
import { queries } from '../../db/queries.ts';
import { useLive } from '../../lib/useLive.ts';
import { BalanceIndicator } from '../balance/BalanceIndicator.tsx';
import { ExpenseList } from './ExpenseList.tsx';

export function TripPage() {
  const { tripId = '' } = useParams();
  const data = useLive(() => queries.tripDetail(tripId), [tripId]);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  if (data === undefined) return <p role="status">Loading…</p>;
  if (data === null) return <p role="alert">That trip was not found. <Link to="/grants" className="underline">Back to grants</Link></p>;
  const { trip, grant, expenses, grantExpenses } = data;

  // Flags are derived from the current trip dates and grant buffer, so editing the trip re-evaluates them at once.
  const flags = new Map<string, Flag>();
  for (const e of expenses) {
    const flag = dateWindowFlag(e, trip, grant.rules.travelBufferDays);
    if (flag) flags.set(e.id, flag);
  }
  const filters: ExpenseFilters = {};
  if (category) filters.categoryId = category as ExpenseFilters['categoryId'];
  if (status) filters.status = status as ExpenseFilters['status'];
  if (flaggedOnly) filters.flaggedOnly = true;
  const filtered = applyFilters(expenses, filters, new Set(flags.keys()));
  const totals = tripTotals(expenses); // whole trip, never the filtered view

  return (
    <div>
      <p className="text-sm"><Link to={`/grants/${grant.id}`} className="underline">{grant.name}</Link></p>
      <h1 className={h1}>{trip.name}</h1>
      <p className={`mb-4 ${mutedText}`}>{trip.city}, {trip.country} · {formatDateLabel(trip.startDate)} to {formatDateLabel(trip.endDate)}</p>

      <div className={`${card} mb-4`}>
        <BalanceIndicator grant={grant} expenses={grantExpenses} />
      </div>
      <dl className="amount mb-4 grid grid-cols-3 gap-2 text-center" data-testid="trip-totals">
        <div className={card}><dt className="text-sm text-ink-soft">Trip total</dt><dd className="font-semibold" data-testid="trip-total">{formatInr(totals.totalMinor)}</dd></div>
        <div className={card}><dt className="text-sm text-ink-soft">Pending</dt><dd className="font-semibold" data-testid="trip-pending">{formatInr(totals.pendingMinor)}</dd></div>
        <div className={card}><dt className="text-sm text-ink-soft">Confirmed</dt><dd className="font-semibold" data-testid="trip-confirmed">{formatInr(totals.confirmedMinor)}</dd></div>
      </dl>

      <div className="mb-6 flex flex-wrap gap-3">
        <Link to={`/trips/${trip.id}/expenses/new`} className={btnPrimary}>Add expense</Link>
        <Link to="/inbox" className={btn}>Open Inbox</Link>
        <Link to={`/trips/${trip.id}/edit`} className={btn}>Edit trip</Link>
      </div>

      {expenses.length === 0 ? (
        <p className={`${card} ${mutedText}`} data-testid="empty-trip">
          No expenses yet. Choose <strong>Add expense</strong> to type one in, or add a payment screenshot or SMS in the <Link to="/inbox" className="underline">Inbox</Link>.
        </p>
      ) : (
        <>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <SelectField id="filter-category" label="Category" value={category} onChange={setCategory}
              options={[{ value: '', label: 'All categories' }, { value: 'none', label: 'No category' }, ...CATEGORY_IDS.map((id) => ({ value: id, label: CATEGORY_LABELS[id] }))]} />
            <SelectField id="filter-status" label="Status" value={status} onChange={setStatus}
              options={[{ value: '', label: 'Pending and confirmed' }, { value: 'pending', label: 'Pending only' }, { value: 'confirmed', label: 'Confirmed only' }]} />
          </div>
          <label className="mb-4 flex min-h-11 items-center gap-2 font-semibold">
            <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} className="h-5 w-5" />
            Flagged only ({flags.size})
          </label>
          {(category || status || flaggedOnly) && (
            <p className="mb-4 flex items-center gap-3" role="status">
              <span>Showing {filtered.length} of {expenses.length} expenses.</span>
              <button type="button" className={btn} onClick={() => { setCategory(''); setStatus(''); setFlaggedOnly(false); }}>Clear filters</button>
            </p>
          )}
          {filtered.length === 0 ? <p className={mutedText}>No expenses match these filters.</p> : <ExpenseList expenses={filtered} flags={flags} />}
        </>
      )}
    </div>
  );
}
