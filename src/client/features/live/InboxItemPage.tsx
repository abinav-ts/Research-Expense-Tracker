import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { normaliseRules } from '../../../shared/grant.ts';
import { scrubReceiptText } from '../../../shared/receipt-parser.ts';
import { allowedWindow } from '../../../shared/rules/date-window.ts';
import { suggestFields } from '../../../shared/suggest.ts';
import { PROOF_TYPE_LABELS, type InboxItem, type ProofType } from '../../../shared/types.ts';
import { ConfirmPanel } from '../../components/ConfirmPanel.tsx';
import { SelectField } from '../../components/fields.tsx';
import { btn, btnDanger, h1 } from '../../components/ui.ts';
import { db, repo } from '../../db/index.ts';
import { queries } from '../../db/queries.ts';
import { attempt } from '../../lib/errors.ts';
import { todayLocal } from '../../lib/today.ts';
import { useLive } from '../../lib/useLive.ts';
import { sha256Hex } from '../../lib/hash.ts';
import { ensureOcrAssets, getOcrAssetState } from '../../ocr/assets.ts';
import { OcrStatus } from '../../ocr/OcrStatus.tsx';
import { prepareForOcr } from '../../ocr/prepare.ts';
import { recogniseImage, resetRecogniser } from '../../ocr/recognise.ts';
import { ExpenseFormFields } from './ExpenseFormFields.tsx';
import { ProofView } from './ProofView.tsx';

type Phase = 'reading' | 'done' | 'nothing-found' | 'failed' | 'unavailable' | 'dismissed';

const TIME_LIMIT_MS = 120_000;
const withTimeLimit = <T,>(work: Promise<T>): Promise<T> =>
  Promise.race([work, new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('it took longer than 2 minutes')), TIME_LIMIT_MS))]);

/**
 * REQ-CAP-05: read an image on this device. The image is made easier to read first; if the first pass finds no amount
 * or no date, a second pass with a different layout mode is added. The text lives only in this tab's memory, with card
 * digits and balances scrubbed. Nothing here can block saving. When reading does not work the screen says so in red,
 * gives the reason, and offers "Try again".
 */
function Recognition({ item, onText }: { item: InboxItem; onText: (text: string) => void }) {
  const [phase, setPhase] = useState<Phase>('reading');
  const [reason, setReason] = useState('');
  const [attempts, setAttempts] = useState(0);
  const dismissed = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setPhase('reading');
    void (async () => {
      try {
        await ensureOcrAssets();
        const assets = getOcrAssetState();
        if (assets.status !== 'ready') {
          setReason(assets.status === 'error' ? assets.message : assets.status === 'missing-offline' ? 'there is no connection and the recognition data is not on this device yet' : 'the recognition data is not ready');
          return void (!cancelled && setPhase('unavailable'));
        }
        const blob = await repo.getBlob(item.blobKey!);
        if (!blob) throw new Error('the file is missing from this device');
        const text = await withTimeLimit((async () => {
          const prepared = await prepareForOcr(blob);
          let read = scrubReceiptText(await recogniseImage(prepared, 'auto'));
          const first = suggestFields(read);
          if (!first.amount.length || !first.date.length) read += '\n' + scrubReceiptText(await recogniseImage(prepared, 'sparse'));
          return read;
        })());
        if (cancelled || dismissed.current) return;
        onText(text);
        const found = Object.values(suggestFields(text)).some((list) => list.length > 0);
        setReason(`${text.replace(/\s/g, '').length} characters were read, but no amount, date or payee among them`);
        setPhase(found ? 'done' : 'nothing-found');
      } catch (error) {
        console.error(error);
        await resetRecogniser();
        if (cancelled) return;
        setReason(error instanceof Error && error.message ? error.message : 'unknown error');
        setPhase('failed');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, attempts]);

  if (phase === 'reading') {
    return (
      <p role="status" className="mb-3 flex flex-wrap items-center gap-3 font-semibold" data-testid="ocr-reading">
        Reading screenshot…
        <button type="button" className={btn} onClick={() => { dismissed.current = true; setPhase('dismissed'); }}>Dismiss</button>
      </p>
    );
  }
  if (phase === 'dismissed') return null;
  if (phase === 'done') {
    return <p role="status" className="mb-3 text-sm text-ink-soft" data-testid="ocr-note" data-phase="done">Details read from the screenshot are marked "Check", with other options under each field. Please confirm each one.</p>;
  }
  const headline: Record<'nothing-found' | 'failed' | 'unavailable', string> = {
    'nothing-found': 'Could not find payment details in this image. Please type them in.',
    failed: 'Reading the screenshot failed. Please type the details in; you can still save.',
    unavailable: 'Could not read the screenshot: the recognition data is not available. Please type the details in for now.',
  };
  return (
    <div role="alert" className="mb-3 rounded-lg border-2 border-state-over bg-surface p-3 text-state-over" data-testid="ocr-note" data-phase={phase}>
      <p className="font-semibold">⚠ {headline[phase]}</p>
      <p className="mt-1 text-sm" data-testid="ocr-reason">Reason: {reason}</p>
      <button type="button" className={`${btn} mt-2`} onClick={() => { dismissed.current = false; setAttempts((n) => n + 1); }}>Try again</button>
    </div>
  );
}

/** The raw recognised text, closed by default: it is only for checking or sharing, never for picking words from. */
function WhatWasRead({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <details className="mb-4 rounded-lg border border-line bg-surface p-3" data-testid="what-was-read-box">
      <summary className="min-h-11 cursor-pointer font-semibold">What was read</summary>
      <pre className="mt-2 max-h-64 overflow-auto text-sm whitespace-pre-wrap" data-testid="what-was-read">{text}</pre>
      <button type="button" className={`${btn} mt-2`} onClick={async () => { await navigator.clipboard?.writeText(text); setCopied(true); }}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </details>
  );
}

function Confirm({ item, next, text }: { item: InboxItem; next?: string | undefined; text: string | undefined }) {
  const navigate = useNavigate();
  const choices = useLive(async () => ({
    trips: await queries.tripChoices(), last: await repo.lastTripId(), memory: await repo.payeeMemory(),
    knownPayees: await repo.knownPayees(), anchors: await repo.anchors(), expenses: await db.expenses.toArray(),
  }));
  // A pasted message is compared with saved ones by the fingerprint of its text, as a file is by its own.
  const [textHash, setTextHash] = useState<string>();
  useEffect(() => {
    if (item.kind !== 'text') return;
    void sha256Hex(new Blob([item.text ?? ''], { type: 'text/plain' })).then(setTextHash);
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const bufferDays = normaliseRules(chosen.grant.rules).travelBufferDays;
  const tripsOfGrant = new Set(choices.trips.filter((c) => c.grant.id === chosen.grant.id).map((c) => c.trip.id));
  const existing = choices.expenses.filter((e) => tripsOfGrant.has(e.tripId));

  // Up to three suggestions per field (REQ-CAP-15); dates inside this trip's dates rank first. The user always confirms.
  const suggestions = text
    ? suggestFields(text, { window: allowedWindow(chosen.trip, bufferDays), knownPayees: choices.knownPayees, anchors: choices.anchors })
    : undefined;
  const goNext = () => navigate(next ? `/inbox/${next}` : '/inbox');

  return (
    <>
      <ExpenseFormFields
        key={item.id} knownPayees={choices.knownPayees} existing={existing} proofHashes={[item.kind === 'file' ? (item.sha256 ?? '') : (textHash ?? '')]}
        onDiscard={() => setDiscarding(true)} suggestions={suggestions} suggestionsKey={`${item.id}:${text?.length ?? 0}`} tripRates={chosen.trip.fxRatesMicro}
        tripWindow={{ trip: chosen.trip, bufferDays }} memory={choices.memory} submitLabel="Confirm expense"
        top={
          <>
            <SelectField id="trip" label="Trip" value={chosen.trip.id} onChange={setTripId}
              options={choices.trips.map((c) => ({ value: c.trip.id, label: `${c.trip.name} (${c.grant.name})` }))} />
            <SelectField id="proofType" label="Proof type" value={item.proofType ?? 'other'} onChange={(v) => void attempt(() => repo.setInboxProofType(item.id, v as ProofType))}
              options={(Object.keys(PROOF_TYPE_LABELS) as ProofType[]).map((t) => ({ value: t, label: PROOF_TYPE_LABELS[t] }))} />
          </>
        }
        onSubmit={async (fields) => { if (await attempt(() => repo.confirmInboxItem(item.id, chosen.trip.id, fields, text))) goNext(); }}
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
  const [ocrText, setOcrText] = useState<{ itemId: string; text: string }>();
  if (!data) return <p role="status">Loading…</p>;
  if (!data.item) return <p role="alert">That Inbox item is gone (it may have been confirmed). <Link to="/inbox" className="underline">Back to Inbox</Link></p>;
  const { item, list } = data;
  const next = list.find((i) => i.id !== item.id)?.id;
  const isImage = item.kind === 'file' && !!item.mime?.startsWith('image/');
  const read = ocrText?.itemId === item.id ? ocrText.text : undefined;
  const text = item.kind === 'text' ? item.text : read;

  return (
    <div>
      <h1 className={`${h1} mb-4`}>Confirm expense</h1>
      <div className="grid gap-x-8 md:grid-cols-2">
        <div>
          {item.kind === 'file' && <ProofView file={item} />}
          {isImage && <OcrStatus />}
          {isImage && <Recognition key={item.id} item={item} onText={(t) => setOcrText({ itemId: item.id, text: t })} />}
          {item.kind === 'text' && <pre className="mb-4 rounded-lg border border-line bg-surface p-3 text-sm whitespace-pre-wrap" data-testid="inbox-text">{item.text}</pre>}
          {read && <WhatWasRead text={read} />}
          {item.kind === 'file' && !isImage && <p className="mb-4 text-sm text-ink-soft">Type the amount, date and payee from this file.</p>}
        </div>
        <Confirm key={item.id} item={item} next={next} text={text} />
      </div>
    </div>
  );
}
