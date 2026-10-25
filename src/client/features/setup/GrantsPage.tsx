import { Link } from 'react-router';
import { formatDateLabel } from '../../../shared/dates.ts';
import { btn, btnPrimary, card, h1, h2, mutedText } from '../../components/ui.ts';
import { queries } from '../../db/queries.ts';
import { loadDemoData } from '../../demo/loadDemo.ts';
import { attempt } from '../../lib/errors.ts';
import { useLive } from '../../lib/useLive.ts';
import { BalanceIndicator } from '../balance/BalanceIndicator.tsx';
import { useState } from 'react';

export function GrantsPage() {
  const overview = useLive(() => queries.grantsOverview());
  const [needGrant, setNeedGrant] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);

  if (!overview) return <p role="status">Loading…</p>;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className={`${h1} mr-auto`}>Your grants</h1>
        <Link to="/grants/new" className={btnPrimary}>Add grant</Link>
        {overview.length > 0 ? (
          <Link to="/trips/new" className={btn}>Add trip</Link>
        ) : (
          <button type="button" className={btn} onClick={() => setNeedGrant(true)}>Add trip</button>
        )}
      </div>

      {needGrant && overview.length === 0 && (
        <p role="status" className="mb-4 rounded-lg border border-line bg-surface p-3 font-semibold">
          Create a grant first: every trip belongs to a grant. <Link to="/grants/new" className="underline">Add grant</Link>
        </p>
      )}

      {overview.length === 0 ? (
        <section className={card}>
          <h2 className={h2}>No grants yet</h2>
          <p className={`mt-2 ${mutedText}`}>
            Add the grant you spend from, then a trip for each conference. Everything stays on this device.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/grants/new" className={btnPrimary}>Create your first grant</Link>
            <button
              type="button" className={btn} disabled={loadingDemo}
              onClick={async () => {
                setLoadingDemo(true);
                await attempt(() => loadDemoData());
                setLoadingDemo(false);
              }}
            >
              Load demo data
            </button>
          </div>
          <p className={`mt-3 text-sm ${mutedText}`}>Demo data is a sample grant, trip and expenses; every proof is marked SAMPLE.</p>
        </section>
      ) : (
        <ul className="grid gap-4">
          {overview.map(({ grant, tripCount, expenses }) => (
            <li key={grant.id} className={card} data-testid="grant-card">
              <Link to={`/grants/${grant.id}`} className="font-display text-xl font-semibold underline">{grant.name}</Link>
              <p className={`mb-4 text-sm ${mutedText}`}>
                {grant.sponsor && `${grant.sponsor} · `}{formatDateLabel(grant.startDate)} to {formatDateLabel(grant.endDate)} · {tripCount} {tripCount === 1 ? 'trip' : 'trips'}
              </p>
              <BalanceIndicator grant={grant} expenses={expenses} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

