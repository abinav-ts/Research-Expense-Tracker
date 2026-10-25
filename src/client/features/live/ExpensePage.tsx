import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { currencyExponent } from '../../../shared/currency.ts';
import { minorToText } from '../../../shared/money.ts';
import { dateWindowFlag } from '../../../shared/rules/date-window.ts';
import { microToText } from '../../../shared/trip.ts';
import { ConfirmPanel } from '../../components/ConfirmPanel.tsx';
import { btn, btnDanger, h1 } from '../../components/ui.ts';
import { repo } from '../../db/index.ts';
import { queries } from '../../db/queries.ts';
import { attempt } from '../../lib/errors.ts';
import { useLive } from '../../lib/useLive.ts';
import { ExpenseFormFields } from './ExpenseFormFields.tsx';
import { ProofView } from './ProofView.tsx';

/** REQ-CAP-06: edit all fields, view the proof, exclude/include, delete. */
export function ExpensePage() {
  const { expenseId = '' } = useParams();
  const navigate = useNavigate();
  const data = useLive(async () => ({ detail: await queries.expenseDetail(expenseId), memory: await repo.payeeMemory() }), [expenseId]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!data) return <p role="status">Loading…</p>;
  if (!data.detail) return <p role="alert">That expense was not found. <Link to="/grants" className="underline">Back to grants</Link></p>;
  const { expense, trip, grant } = data.detail;
  const bufferDays = grant.rules.travelBufferDays;
  const flag = dateWindowFlag(expense, trip, bufferDays);
  const exponent = currencyExponent(expense.originalCurrency);
  const back = `/trips/${trip.id}`;

  return (
    <div>
      <p className="text-sm"><Link to={back} className="underline">{trip.name}</Link></p>
      <h1 className={`${h1} mb-1`}>{expense.payee}</h1>
      {flag && <p role="status" className="mb-2 font-semibold text-state-low" data-testid="expense-flag">⚠ {flag.message}</p>}
      {expense.excluded && <p role="status" className="mb-2 font-semibold text-state-low">Excluded: not counted in the balance and left out of the claim.</p>}
      {expense.originalCurrency !== 'INR' && expense.inrStatus === 'pending' && <p className="mb-2 text-sm font-semibold text-state-low">The rupee amount is an estimate until it is matched to your bank statement.</p>}

      <div className="mb-6">
        {expense.attachments.length === 0 && <p className="text-ink-soft">No proof attached.</p>}
        {expense.attachments.map((a) => <ProofView key={a.id} file={a} />)}
      </div>

      <ExpenseFormFields
        key={expense.updatedAt}
        tripRates={trip.fxRatesMicro} tripWindow={{ trip, bufferDays }} memory={data.memory} submitLabel="Save changes"
        initial={{
          amountText: minorToText(expense.originalMinor, exponent), currency: expense.originalCurrency,
          rateText: expense.estimatedRateMicro ? microToText(expense.estimatedRateMicro) : '', date: expense.date, payee: expense.payee,
          categoryId: expense.categoryId ?? '', paymentMode: expense.paymentMode, note: expense.note ?? '', reference: expense.reference ?? '',
        }}
        onSubmit={async (fields) => { if (await attempt(() => repo.updateExpense(expense.id, fields))) navigate(back); }}
        actions={
          <>
            <button type="button" className={btn} onClick={() => attempt(() => repo.setExcluded(expense.id, !expense.excluded))}>
              {expense.excluded ? 'Include again' : 'Exclude'}
            </button>
            <button type="button" className={btnDanger} onClick={() => setConfirmingDelete(true)}>Delete</button>
            <Link to={back} className={btn}>Back</Link>
          </>
        }
      />
      {confirmingDelete && (
        <ConfirmPanel
          message={`Delete "${expense.payee}"? Its proof files are deleted too.`} confirmLabel="Delete expense"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={async () => { if (await attempt(() => repo.deleteExpense(expense.id))) navigate(back); }}
        />
      )}
    </div>
  );
}
