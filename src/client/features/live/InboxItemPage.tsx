import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { normaliseRules } from '../../../shared/grant.ts';
import type { ExpenseFormInput } from '../../../shared/expense-form.ts';
import { formValuesFromReceipt } from '../../../shared/receipt-form.ts';
import { parseReceiptText, scrubReceiptText } from '../../../shared/receipt-parser.ts';
import { PROOF_TYPE_LABELS, type InboxItem, type ProofType } from '../../../shared/types.ts';
import { ConfirmPanel } from '../../components/ConfirmPanel.tsx';
import { SelectField } from '../../components/fields.tsx';
import { btn, btnDanger, h1 } from '../../components/ui.ts';
import { repo } from '../../db/index.ts';
import { queries } from '../../db/queries.ts';
import { attempt } from '../../lib/errors.ts';
import { todayLocal } from '../../lib/today.ts';
import { useLive } from '../../lib/useLive.ts';
import { ensureOcrAssets, getOcrAssetState } from '../../ocr/assets.ts';
import { OcrStatus } from '../../ocr/OcrStatus.tsx';
import { recogniseImage } from '../../ocr/recognise.ts';
import { ExpenseFormFields, type FormPatch } from './ExpenseFormFields.tsx';
import { ProofView } from './ProofView.tsx';
import { TextAssigner } from './TextAssigner.tsx';

type Phase = 'reading' | 'done' | 'nothing-found' | 'failed' | 'unavailable' | 'dismissed';

/**
 * REQ-CAP-05: read an image on this device, then prefill the form. The raw text lives only in this component's
 * memory; card digits and balances are scrubbed first. Nothing here can block saving: failure just leaves the form empty.
 */
function Recognition({ item, onText }: { item: InboxItem; onText: (text: string, values: Partial<ExpenseFormInput>) => void }) {
  const [phase, setPhase] = useState<Phase>('reading');
  const dismissed = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await ensureOcrAssets();
        if (getOcrAssetState().status !== 'ready') return void (!cancelled && setPhase('unavailable'));
        const blob = await repo.getBlob(item.blobKey!);
        if (!blob) throw new Error('file missing');
        const text = scrubReceiptText(await recogniseImage(blob));
        if (cancelled || dismissed.current) return;
        const values = formValuesFromReceipt(parseReceiptText(text));
        onText(text, values);
        setPhase(Object.keys(values).length ? 'done' : 'nothing-found');
      } catch (error) {
        console.error(error);
        if (!cancelled) setPhase('failed');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const note: Record<Phase, string> = {
    reading: '', dismissed: '',
    done: 'Details read from the screenshot are marked "Check". Please confirm each one.',
    'nothing-found': 'Could not find payment details in this image. Type them in, or tap words below if any were read.',
    failed: 'Reading the screenshot failed. Type the details in; you can still save.',
    unavailable: 'Reading screenshots needs a one-time download of recognition data. Type the details in for now.',
  };
  if (phase === 'reading') {
    return (
      <p role="status" className="mb-3 flex flex-wrap items-center gap-3 font-semibold" data-testid="ocr-reading">
        Reading screenshot…
        <button type="button" className={btn} onClick={() => { dismissed.current = true; setPhase('dismissed'); }}>Dismiss</button>
      </p>
    );
  }
  return note[phase] ? <p role="status" className="mb-3 text-sm text-ink-soft" data-testid="ocr-note" data-phase={phase}>{note[phase]}</p> : null;
}

function Confirm({ item, next, patch }: { item: InboxItem; next?: string | undefined; patch: FormPatch | undefined }) {
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

  // Text items are read by the same parser OCR output goes through; the user always confirms (principle 3).
  const initial = item.kind === 'text' ? formValuesFromReceipt(parseReceiptText(item.text ?? '')) : {};
  const goNext = () => navigate(next ? `/inbox/${next}` : '/inbox');

  return (
    <>
      <ExpenseFormFields
        key={item.id} patch={patch} check={Object.keys(initial) as (keyof ExpenseFormInput)[]} tripRates={chosen.trip.fxRatesMicro}
        tripWindow={{ trip: chosen.trip, bufferDays: normaliseRules(chosen.grant.rules).travelBufferDays }} memory={choices.memory} initial={initial} submitLabel="Confirm expense"
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
  const data = useLive(async () => ({ item: (await queries.inboxItem(itemId)) ?? null, list: await queries.inboxList() }), [itemId]);
  const [patch, setPatch] = useState<FormPatch>();
  const [ocrText, setOcrText] = useState<{ itemId: string; text: string }>();
  if (!data) return <p role="status">Loading…</p>;
  if (!data.item) return <p role="alert">That Inbox item is gone (it may have been confirmed). <Link to="/inbox" className="underline">Back to Inbox</Link></p>;
  const { item, list } = data;
  const next = list.find((i) => i.id !== item.id)?.id;
  const push = (values: Partial<ExpenseFormInput>, source: FormPatch['source']) => setPatch((p) => ({ id: (p?.id ?? 0) + 1, itemId: item.id, values, source }));
  const isImage = item.kind === 'file' && !!item.mime?.startsWith('image/');
  const assignText = item.kind === 'text' ? item.text : ocrText?.itemId === item.id ? ocrText.text : undefined;

  return (
    <div>
      <h1 className={`${h1} mb-4`}>Confirm expense</h1>
      <div className="grid gap-x-8 md:grid-cols-2">
        <div>
          {item.kind === 'file' && <ProofView file={item} />}
          {isImage && <OcrStatus />}
          {isImage && (
            <Recognition key={item.id} item={item} onText={(text, values) => { setOcrText({ itemId: item.id, text }); push(values, 'recognition'); }} />
          )}
          {item.kind === 'text' && <pre className="mb-4 rounded-lg border border-line bg-surface p-3 text-sm whitespace-pre-wrap" data-testid="inbox-text">{item.text}</pre>}
          {assignText && <TextAssigner key={item.id + (item.kind === 'file' ? 'ocr' : '')} text={assignText} onAssign={(values) => push(values, 'user')} />}
          {item.kind === 'file' && !isImage && <p className="mb-4 text-sm text-ink-soft">Type the amount, date and payee from this file.</p>}
        </div>
        <Confirm key={item.id} item={item} next={next} patch={patch?.itemId === item.id ? patch : undefined} />
      </div>
    </div>
  );
}
