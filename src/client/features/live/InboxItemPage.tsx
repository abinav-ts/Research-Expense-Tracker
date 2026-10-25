import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { currencyExponent } from '../../../shared/currency.ts';
import type { ExpenseFormInput } from '../../../shared/expense-form.ts';
import { normaliseRules } from '../../../shared/grant.ts';
import { minorToText } from '../../../shared/money.ts';
import { parseReceiptText } from '../../../shared/receipt-parser.ts';
import { PROOF_TYPE_LABELS, type InboxItem, type ProofType } from '../../../shared/types.ts';
import { ConfirmPanel } from '../../components/ConfirmPanel.tsx';
import { SelectField } from '../../components/fields.tsx';
import { btn, btnDanger, h1 } from '../../components/ui.ts';
import { repo } from '../../db/index.ts';
import { queries } from '../../db/queries.ts';
import { attempt } from '../../lib/errors.ts';
import { todayLocal } from '../../lib/today.ts';
import { useLive } from '../../lib/useLive.ts';
import { ExpenseFormFields } from './ExpenseFormFields.tsx';
import { TextAssigner } from './TextAssigner.tsx';
import { ProofView } from './ProofView.tsx';

function Confirm({ item, next, patch }: { item: InboxItem; next?: string | undefined; patch: { id: number; values: Partial<ExpenseFormInput> } | undefined }) {
  const navigate = useNavigate();
  const choices = useLive(async () => ({ trips: await queries.tripChoices(), last: await repo.lastTripId(), memory: await repo.payeeMemory() }));
  const [tripId, setTripId] = useState<string>();
  const [discarding, setDiscarding] = useState(false);
  if (!choices) return <p role="status">Loading…</p>;
  if (choices.trips.length === 0) {
    return <p role="status">Create a grant and a trip first, then confirm this proof. <Link to="/grants" className="underline">Go to grants</Link></p>;
  }

  // Default trip: the one whose dates include today, else the last used one, else the first.
  const today = todayLocal();
  const inWindow = choices.trips.find((c) => c.trip.startDate <= today && today <= c.trip.endDate);
  const chosen = choices.trips.find((c) => c.trip.id === tripId) ?? inWindow ?? choices.trips.find((c) => c.trip.id === choices.last) ?? choices.trips[0]!;

  // Text items are read by the same parser OCR will use; the user always confirms (principle 3).
  const parsed = item.kind === 'text' ? parseReceiptText(item.text ?? '') : {};
  const currency = parsed.currency ?? 'INR';
  const initial = {
    ...(parsed.amountMinor !== undefined && { amountText: minorToText(parsed.amountMinor, currencyExponent(currency)), currency }),
    ...(parsed.date && { date: parsed.date }),
    ...(parsed.payee && { payee: parsed.payee }),
    ...(parsed.reference && { reference: parsed.reference }),
  };
  const goNext = () => navigate(next ? `/inbox/${next}` : '/inbox');

  return (
    <>
      <ExpenseFormFields
        key={item.id} patch={patch} tripRates={chosen.trip.fxRatesMicro} tripWindow={{ trip: chosen.trip, bufferDays: normaliseRules(chosen.grant.rules).travelBufferDays }} memory={choices.memory} initial={initial} submitLabel="Confirm expense"
        top={
          <>
            <SelectField id="trip" label="Trip" value={chosen.trip.id} onChange={setTripId}
              options={choices.trips.map((c) => ({ value: c.trip.id, label: `${c.trip.name} (${c.grant.name})` }))} />
            <SelectField id="proofType" label="Proof type" value={item.proofType ?? 'other'} onChange={(v) => void attempt(() => repo.setInboxProofType(item.id, v as ProofType))}
              options={(Object.keys(PROOF_TYPE_LABELS) as ProofType[]).map((t) => ({ value: t, label: PROOF_TYPE_LABELS[t] }))} />
          </>
        }
        onSubmit={async (fields) => { if (await attempt(() => repo.confirmInboxItem(item.id, chosen.trip.id, fields))) goNext(); }}
        actions={
          <>
            <button type="button" className={btnDanger} onClick={() => setDiscarding(true)}>Discard</button>
            <Link to="/inbox" className={btn}>Back to Inbox</Link>
          </>
        }
      />
      {discarding && (
        <ConfirmPanel
          message="Discard this item? It and its file are deleted for good." confirmLabel="Discard"
          onCancel={() => setDiscarding(false)}
          onConfirm={async () => { if (await attempt(() => repo.discardInboxItem(item.id))) goNext(); }}
        />
      )}
    </>
  );
}

/** REQ-CAP-04: the proof beside an editable expense form; confirming creates the expense and opens the next item. */
export function InboxItemPage() {
  const { itemId = '' } = useParams();
  const [patch, setPatch] = useState<{ id: number; itemId: string; values: Partial<ExpenseFormInput> }>();
  const data = useLive(async () => ({ item: (await queries.inboxItem(itemId)) ?? null, list: await queries.inboxList() }), [itemId]);
  if (!data) return <p role="status">Loading…</p>;
  if (!data.item) return <p role="alert">That Inbox item is gone (it may have been confirmed). <Link to="/inbox" className="underline">Back to Inbox</Link></p>;
  const { item, list } = data;
  const next = list.find((i) => i.id !== item.id)?.id;
  return (
    <div>
      <h1 className={`${h1} mb-4`}>Confirm expense</h1>
      <div className="grid gap-x-8 md:grid-cols-2">
        <div>
          {item.kind === 'file' && <ProofView file={item} />}
          {item.kind === 'text' && <pre className="mb-4 rounded-lg border border-line bg-surface p-3 text-sm whitespace-pre-wrap" data-testid="inbox-text">{item.text}</pre>}
          {item.kind === 'text' && <TextAssigner key={item.id} text={item.text ?? ''} onAssign={(values) => setPatch((p) => ({ id: (p?.id ?? 0) + 1, itemId: item.id, values }))} />}
          {item.kind === 'file' && <p className="mb-4 text-sm text-ink-soft">Type the amount, date and payee from the proof. Reading screenshots automatically comes later.</p>}
        </div>
        <Confirm key={item.id} item={item} next={next} patch={patch?.itemId === item.id ? patch : undefined} />
      </div>
    </div>
  );
}
