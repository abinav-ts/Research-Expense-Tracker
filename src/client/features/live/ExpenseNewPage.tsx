import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { normaliseRules } from '../../../shared/grant.ts';
import { btn, h1 } from '../../components/ui.ts';
import { repo } from '../../db/index.ts';
import { db } from '../../db/index.ts';
import { attempt } from '../../lib/errors.ts';
import { queries } from '../../db/queries.ts';
import { useLive } from '../../lib/useLive.ts';
import { ExpenseFormFields } from './ExpenseFormFields.tsx';
import { ReceiptPicker } from './ReceiptPicker.tsx';

export function ExpenseNewPage() {
  const { tripId = '' } = useParams();
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState<File[]>([]);
  const data = useLive(async () => {
    const trip = (await db.trips.get(tripId)) ?? null;
    const grant = trip && (await db.grants.get(trip.grantId));
    return {
      trip, bufferDays: normaliseRules(grant?.rules).travelBufferDays, memory: await repo.payeeMemory(),
      knownPayees: await repo.knownPayees(), existing: trip ? await queries.grantExpenses(trip.grantId) : [],
    };
  }, [tripId]);
  if (!data) return <p role="status">Loading…</p>;
  if (!data.trip) return <p role="alert">That trip was not found. <Link to="/grants" className="underline">Back to grants</Link></p>;
  const { trip, memory, bufferDays, knownPayees, existing } = data;
  return (
    <div>
      <h1 className={`${h1} mb-1`}>Cash expense</h1>
      <p className="mb-1 text-ink-soft">{trip.name}</p>
      <p className="mb-6 text-sm text-ink-soft">For money you paid in cash. Paid by bank, UPI or card? Use <Link to="/inbox" className="underline">+ Expenses with proof</Link> or the bank statement.</p>
      <ExpenseFormFields
        tripRates={trip.fxRatesMicro} tripWindow={{ trip, bufferDays }} memory={memory} knownPayees={knownPayees} existing={existing}
        onDiscard={() => navigate(`/trips/${trip.id}`)} submitLabel="Save expense" fixedPaymentMode="cash"
        beforeSubmit={<ReceiptPicker files={receipts} onChange={setReceipts} />}
        onSubmit={async (fields) => {
          const saved = await attempt(() => receipts.length
            ? repo.addExpenseWithProofs(trip.id, fields, receipts.map((file) => ({ file, proofType: 'invoice' as const })), 'manual')
            : repo.addExpense(trip.id, fields));
          if (saved) navigate(`/trips/${trip.id}`);
        }}
        actions={<Link to={`/trips/${trip.id}`} className={btn}>Cancel</Link>}
      />
    </div>
  );
}
