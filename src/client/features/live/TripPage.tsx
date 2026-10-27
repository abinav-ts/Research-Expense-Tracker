import { useState } from 'react';
import { BackLink } from '../../components/BackLink.tsx';
import { Link, useParams } from 'react-router';
import { formatDateLabel } from '../../../shared/dates.ts';
import { applyFilters, tripTotals, type ExpenseFilters } from '../../../shared/grouping.ts';
import { formatInr } from '../../../shared/money.ts';
import { evaluateTrip } from '../../../shared/rules/evaluate-trip.ts';
import { CATEGORY_IDS, CATEGORY_LABELS } from '../../../shared/types.ts';
import { SelectField } from '../../components/fields.tsx';
import { btn, btnPrimary, card, h1, linkClass, mutedText } from '../../components/ui.ts';
import { repo } from '../../db/index.ts';
import { queries } from '../../db/queries.ts';
import { useLive } from '../../lib/useLive.ts';
import { BalanceIndicator } from '../balance/BalanceIndicator.tsx';
import { VerifiedMeter } from '../balance/VerifiedMeter.tsx';
import { ExpenseList, shownFlags } from './ExpenseList.tsx';

export function TripPage() {
  const { tripId = '' } = useParams();
  const data = useLive(() => queries.tripDetail(tripId), [tripId]);
  const submissions = useLive(() => repo.listSubmissions(tripId), [tripId]) ?? [];
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  if (data === undefined) return <p role="status">Loading…</p>;
  if (data === null) return <p role="alert">That trip was not found. <Link to="/grants" className={linkClass}>Back to grants</Link></p>;
  const { trip, grant, expenses, grantExpenses } = data;

  // Flags come from the one rules engine and are worked out on every render, so any change to the trip, the grant's rules
  // or an expense is reflected at once (REQ-RULE-01).
  const { flags: allFlags, byItem } = evaluateTrip(grant, trip, grantExpenses);
  const flaggedIds = new Set([...byItem].filter(([, list]) => shownFlags(list).length > 0).map(([id]) => id));
  const needFixing = [...new Set(allFlags.filter((f) => f.severity === 'error' && f.ruleId !== 'UNVERIFIED_AMOUNT').map((f) => f.itemId))];
  const filters: ExpenseFilters = {};
  if (category) filters.categoryId = category as ExpenseFilters['categoryId'];
  if (status) filters.status = status as ExpenseFilters['status'];
  if (flaggedOnly) filters.flaggedOnly = true;
  const filtered = applyFilters(expenses, filters, flaggedIds);
  const totals = tripTotals(expenses); // whole trip, never the filtered view

  return (
    <div>
      <BackLink to={`/grants/${grant.id}`} label={grant.name} />
      <h1 className={h1}>{trip.name}</h1>
      <p className={`mb-4 ${mutedText}`}>{trip.city}, {trip.country} · {formatDateLabel(trip.startDate)} to {formatDateLabel(trip.endDate)}</p>

      <div className={`${card} mb-4`}>
        <BalanceIndicator grant={grant} expenses={grantExpenses} />
        <VerifiedMeter expenses={grantExpenses} />
      </div>
      <dl className="amount mb-4 grid grid-cols-3 gap-2 text-center" data-testid="trip-totals">
        <div className={card}><dt className="text-sm text-ink-soft">Trip total</dt><dd className="font-semibold" data-testid="trip-total">{formatInr(totals.totalMinor)}</dd></div>
        <div className={card}><dt className="text-sm text-ink-soft">Pending</dt><dd className="font-semibold" data-testid="trip-pending">{formatInr(totals.pendingMinor)}</dd></div>
        <div className={card}><dt className="text-sm text-ink-soft">Confirmed</dt><dd className="font-semibold" data-testid="trip-confirmed">{formatInr(totals.confirmedMinor)}</dd></div>
      </dl>

      {needFixing.length > 0 && (
        <p role="status" className="mb-4 rounded-lg border-2 border-state-over bg-surface p-3 font-semibold text-state-over" data-testid="need-fixing">
          ✖ {needFixing.length} {needFixing.length === 1 ? 'item needs' : 'items need'} fixing before this can be claimed.{' '}
          <Link to={`/expenses/${needFixing[0]}`} className={linkClass}>Fix the first one</Link>
        </p>
      )}
      <div className="mb-6 flex flex-wrap gap-3">
        <Link to={`/trips/${trip.id}/expenses/new`} className={btnPrimary}>+ Cash expense</Link>
        <Link to={`/trips/${trip.id}/statement`} className={btn}>Match bank statement</Link>
        <Link to="/inbox" className={btnPrimary}>+ Expenses with proof</Link>
        {expenses.length > 0 && <Link to={`/trips/${trip.id}/claim`} className={btn} data-testid="prepare-claim">Prepare claim</Link>}
        <Link to={`/trips/${trip.id}/edit`} className={btn}>Edit trip</Link>
      </div>

      {submissions.length > 0 && (
        <section className={`${card} mb-6`} aria-labelledby="sent-claims" data-testid="sent-claims">
          <h2 id="sent-claims" className="font-display text-lg font-semibold">Submitted claims</h2>
          <ul className="mt-2 grid gap-2">
            {submissions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{new Date(s.submittedAt).toLocaleDateString()} · {s.itemCount} {s.itemCount === 1 ? 'item' : 'items'} · <span className="amount">{formatInr(s.totalMinor)}</span></span>
                <Link to={`/claim/${s.ownerToken}`} className={linkClass}>See the outcome</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {expenses.length === 0 ? (
        <p className={`${card} ${mutedText}`} data-testid="empty-trip">
          No expenses yet. Choose <strong>+ Cash expense</strong> to type one in, or <Link to="/inbox" className={linkClass}>+ Expenses with proof</Link> to add a payment screenshot, photo or SMS.
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
            Flagged only ({flaggedIds.size})
          </label>
          {(category || status || flaggedOnly) && (
            <p className="mb-4 flex items-center gap-3" role="status">
              <span>Showing {filtered.length} of {expenses.length} expenses.</span>
              <button type="button" className={btn} onClick={() => { setCategory(''); setStatus(''); setFlaggedOnly(false); }}>Clear filters</button>
            </p>
          )}
          {filtered.length === 0 ? <p className={mutedText}>No expenses match these filters.</p> : <ExpenseList expenses={filtered} flags={byItem} />}
        </>
      )}
    </div>
  );
}
