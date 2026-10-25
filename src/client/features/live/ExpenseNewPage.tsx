import { Link, useNavigate, useParams } from 'react-router';
import { normaliseRules } from '../../../shared/grant.ts';
import { btn, h1 } from '../../components/ui.ts';
import { repo } from '../../db/index.ts';
import { db } from '../../db/index.ts';
import { attempt } from '../../lib/errors.ts';
import { useLive } from '../../lib/useLive.ts';
import { ExpenseFormFields } from './ExpenseFormFields.tsx';

export function ExpenseNewPage() {
  const { tripId = '' } = useParams();
  const navigate = useNavigate();
  const data = useLive(async () => {
    const trip = (await db.trips.get(tripId)) ?? null;
    const grant = trip && (await db.grants.get(trip.grantId));
    return { trip, bufferDays: normaliseRules(grant?.rules).travelBufferDays, memory: await repo.payeeMemory() };
  }, [tripId]);
  if (!data) return <p role="status">Loading…</p>;
  if (!data.trip) return <p role="alert">That trip was not found. <Link to="/grants" className="underline">Back to grants</Link></p>;
  const { trip, memory, bufferDays } = data;
  return (
    <div>
      <h1 className={`${h1} mb-1`}>Add expense</h1>
      <p className="mb-6 text-ink-soft">{trip.name}</p>
      <ExpenseFormFields
        tripRates={trip.fxRatesMicro} tripWindow={{ trip, bufferDays }} memory={memory} submitLabel="Save expense"
        onSubmit={async (fields) => { if (await attempt(() => repo.addExpense(trip.id, fields))) navigate(`/trips/${trip.id}`); }}
        actions={<Link to={`/trips/${trip.id}`} className={btn}>Cancel</Link>}
      />
    </div>
  );
}
