import { useState } from 'react';
import { BackLink } from '../../components/BackLink.tsx';
import { Link, useNavigate, useParams } from 'react-router';
import { deletionImpactText } from '../../../shared/grant.ts';
import { formatDateLabel } from '../../../shared/dates.ts';
import { formatInr } from '../../../shared/money.ts';
import { tripTotals } from '../../../shared/grouping.ts';
import { ConfirmPanel } from '../../components/ConfirmPanel.tsx';
import { btn, btnDanger, btnPrimary, card, h1, h2, linkClass, mutedText } from '../../components/ui.ts';
import { repo } from '../../db/index.ts';
import { queries } from '../../db/queries.ts';
import { attempt } from '../../lib/errors.ts';
import { useLive } from '../../lib/useLive.ts';
import { BalanceIndicator } from '../balance/BalanceIndicator.tsx';
import { VerifiedMeter } from '../balance/VerifiedMeter.tsx';
import { GrantDocuments } from './GrantDocuments.tsx';

export function GrantPage() {
  const { grantId = '' } = useParams();
  const navigate = useNavigate();
  const detail = useLive(() => queries.grantDetail(grantId), [grantId]);
  const [confirming, setConfirming] = useState<string>();

  if (detail === undefined) return <p role="status">Loading…</p>;
  if (detail === null) return <p role="alert">That grant was not found. <Link to="/grants" className={linkClass}>Back to grants</Link></p>;
  const { grant, trips, expenses, docs } = detail;

  return (
    <div>
      <BackLink to="/grants" label="grants" />
      <h1 className={h1}>{grant.name}</h1>
      <p className={`mb-4 ${mutedText}`}>
        {grant.sponsor && `${grant.sponsor} · `}{formatDateLabel(grant.startDate)} to {formatDateLabel(grant.endDate)} · already utilised {formatInr(grant.utilisedBeforeMinor)}
      </p>
      <div className={`${card} mb-4`}><BalanceIndicator grant={grant} expenses={expenses} /><VerifiedMeter expenses={expenses} /></div>
      <div className="flex flex-wrap gap-3">
        <Link to={`/grants/${grant.id}/edit`} className={btn}>Edit grant</Link>
        <button
          type="button" className={btnDanger}
          onClick={async () => setConfirming(deletionImpactText(await repo.grantDeletionImpact(grant.id)))}
        >
          Delete grant
        </button>
      </div>
      {confirming && (
        <ConfirmPanel
          message={`Delete "${grant.name}"? ${confirming}.`} confirmLabel="Delete everything"
          onCancel={() => setConfirming(undefined)}
          onConfirm={async () => { if (await attempt(() => repo.deleteGrant(grant.id))) navigate('/grants'); }}
        />
      )}

      <section aria-labelledby="trips-heading" className="mt-8">
        <div className="mb-3 flex items-center gap-3">
          <h2 id="trips-heading" className={`${h2} mr-auto`}>Trips</h2>
          <Link to={`/trips/new?grant=${grant.id}`} className={btnPrimary}>Add trip</Link>
        </div>
        <ul className="grid gap-3">
          {trips.length === 0 && <li className={`${card} ${mutedText}`}>No trips yet. Add the conference you are travelling to.</li>}
          {trips.map(({ trip, expenses: tripExpenses }) => (
            <li key={trip.id} className={card} data-testid="trip-card">
              <Link to={`/trips/${trip.id}`} className={`${linkClass} font-display text-lg`}>{trip.name}</Link>
              <p className={`text-sm ${mutedText}`}>{trip.city}, {trip.country} · {formatDateLabel(trip.startDate)} to {formatDateLabel(trip.endDate)}</p>
              <p className="amount text-sm">{formatInr(tripTotals(tripExpenses).totalMinor)} spent</p>
            </li>
          ))}
        </ul>
      </section>

      <GrantDocuments grantId={grant.id} docs={docs} />
    </div>
  );
}
