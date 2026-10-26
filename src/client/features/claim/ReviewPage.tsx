// REQ-REV-01..05, REQ-DEMO-03: the reviewer's page. Read-only claim, per-item decisions, one overall decision that locks.
// The sample claim (/review/sample) keeps its decisions in this browser only.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { DECISION_LABELS, outcomeOf, reviewTotals, STATUS_LABELS, SAMPLE_TOKEN, type ClaimPayloadItem, type ClaimStatus, type ClaimView, type Decision, type ItemReview } from '../../../shared/claim.ts';
import { formatInr } from '../../../shared/money.ts';
import { TextAreaField } from '../../components/fields.tsx';
import { btn, btnPrimary, card, h1, h2, mutedText } from '../../components/ui.ts';
import { ClaimView as ClaimBody } from './ClaimView.tsx';
import { RemoteMessage } from './RemoteMessage.tsx';
import { useRemoteClaim } from './useRemoteClaim.ts';

const DECISIONS: Decision[] = ['approve', 'reject', 'query'];
const BUTTON_LABEL: Record<Decision, string> = { approve: 'Approve', reject: 'Reject', query: 'Query' };
const isDecided = (s: ClaimStatus) => s === 'approved' || s === 'rejected' || s === 'partially_approved';

export function StatusBanner({ view }: { view: ClaimView }) {
  const decided = isDecided(view.status);
  return (
    <section className={`${card} mb-4 ${decided ? 'border-2 border-ink' : ''}`} role="status" aria-label="Status" data-testid="claim-status">
      <p className="font-display text-xl font-semibold" data-testid="claim-status-text">{STATUS_LABELS[view.status]}{view.sample ? ' (sample)' : ''}</p>
      {view.decidedAt && <p className={`text-sm ${mutedText}`}>Decided {new Date(view.decidedAt).toLocaleString()}</p>}
      {view.overallComment && <p className="mt-2" data-testid="claim-overall-comment"><span className="font-semibold">Comment:</span> {view.overallComment}</p>}
    </section>
  );
}

export function Totals({ view, reviews }: { view: ClaimView; reviews: ItemReview[] }) {
  const t = reviewTotals(view.payload.items, reviews);
  return (
    <dl className="amount grid grid-cols-3 gap-2 text-center" data-testid="review-totals">
      <div className={card}><dt className="text-sm text-ink-soft">Approved</dt><dd className="font-semibold" data-testid="total-approved">{formatInr(t.approvedMinor)}</dd></div>
      <div className={card}><dt className="text-sm text-ink-soft">Rejected</dt><dd className="font-semibold" data-testid="total-rejected">{formatInr(t.rejectedMinor)}</dd></div>
      <div className={card}><dt className="text-sm text-ink-soft">Not decided</dt><dd className="font-semibold" data-testid="total-open">{formatInr(t.openMinor)}</dd></div>
    </dl>
  );
}

function ItemDecision({ item, review, locked, save }: { item: ClaimPayloadItem; review: ItemReview | undefined; locked: boolean; save: (item: string, decision: Decision, comment: string) => Promise<string | undefined> }) {
  const [comment, setComment] = useState(review?.comment ?? '');
  const [note, setNote] = useState<{ ok: boolean; text: string }>();
  const decision = review?.decision;
  const run = async (d: Decision, c: string) => {
    setNote(undefined);
    const err = await save(item.id, d, c);
    setNote(err ? { ok: false, text: err } : { ok: true, text: 'Saved' });
  };
  return (
    <fieldset className="mt-3 border-t border-line pt-3" disabled={locked} data-testid="item-decision">
      <legend className="text-sm font-semibold">Your decision</legend>
      <div className="flex flex-wrap gap-2">
        {DECISIONS.map((d) => (
          <button key={d} type="button" aria-pressed={decision === d} onClick={() => void run(d, comment)}
            className={`inline-flex min-h-11 min-w-24 items-center justify-center rounded-lg border-2 px-4 font-semibold ${decision === d ? 'border-ink bg-ink text-on-dark' : 'border-ink-soft bg-surface text-ink'} disabled:opacity-60`}>
            {decision === d ? '✓ ' : ''}{BUTTON_LABEL[d]}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <TextAreaField id={`comment-${item.id}`} label="Comment (optional)" rows={2} value={comment} onChange={(v) => { setComment(v.slice(0, 1000)); setNote(undefined); }}
          hint={decision ? undefined : 'Choose a decision first; the comment is saved with it.'} />
        {decision && comment !== (review?.comment ?? '') && !locked && <button type="button" className={btn} onClick={() => void run(decision, comment)}>Save comment</button>}
      </div>
      {note && <p role={note.ok ? 'status' : 'alert'} className={`mt-1 text-sm font-semibold ${note.ok ? 'text-state-healthy' : 'text-state-over'}`} data-testid="item-saved">{note.ok ? '✓ ' : '⚠ '}{note.text}</p>}
      {(decision === 'reject' || decision === 'query') && !comment.trim() && <p className={`mt-1 text-sm ${mutedText}`}>Adding a comment helps the claimant to answer.</p>}
    </fieldset>
  );
}

export function ReviewPage() {
  const { token = '' } = useParams();
  const sample = token === SAMPLE_TOKEN;
  const { claim, reload } = useRemoteClaim('review', token);
  const [reviews, setReviews] = useState<ItemReview[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [overall, setOverall] = useState('');
  const [problem, setProblem] = useState<string>();
  const [status, setStatus] = useState<ClaimStatus>('submitted');
  const [decided, setDecided] = useState<{ at?: string; comment?: string }>({});
  const [version, setVersion] = useState(0); // new when the server's copy arrives, so each item's comment box starts from it

  // Take over what the server says once, when the claim has loaded; after that this page is the one changing things.
  const loaded = claim.state === 'ready' ? claim.view : undefined;
  useEffect(() => {
    if (!loaded) return;
    setReviews(loaded.reviews);
    setVersion((n) => n + 1);
    setStatus(loaded.status);
    setDecided({ ...(loaded.decidedAt && { at: loaded.decidedAt }), ...(loaded.overallComment && { comment: loaded.overallComment }) });
  }, [loaded]);

  if (claim.state !== 'ready') return <RemoteMessage claim={claim} reload={reload} />;
  const { view } = claim;
  const locked = isDecided(status);
  const shown: ClaimView = { ...view, status, reviews, ...(decided.at && { decidedAt: decided.at }), ...(decided.comment && { overallComment: decided.comment }) };
  const ids = view.payload.items.map((i) => i.id);
  const outcome = outcomeOf(ids, reviews);
  const undecided = outcome.ok ? 0 : outcome.undecided.length;

  async function save(itemId: string, decision: Decision, comment: string): Promise<string | undefined> {
    if (!sample) {
      try {
        const res = await fetch(`/api/review/${encodeURIComponent(token)}/items/${encodeURIComponent(itemId)}`, {
          method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision, comment }),
        });
        if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Not saved. Try again.';
      } catch {
        return 'Not saved: no connection. Try again.';
      }
    }
    setReviews((list) => [...list.filter((r) => r.itemId !== itemId), { itemId, decision, comment }]);
    setStatus((s) => (s === 'submitted' ? 'in_review' : s));
    return undefined;
  }

  async function finish() {
    setProblem(undefined);
    if (!outcome.ok) return;
    if (!sample) {
      try {
        const res = await fetch(`/api/review/${encodeURIComponent(token)}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comment: overall }) });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) return setProblem(body.error ?? 'The decision was not saved. Try again.');
      } catch {
        return setProblem('The decision was not saved: no connection. Try again.');
      }
    }
    setFinishing(false);
    setStatus(outcome.status);
    setDecided({ at: new Date().toISOString(), ...(overall.trim() && { comment: overall.trim() }) });
  }

  function startAgain() {
    setReviews([]);
    setStatus('submitted');
    setDecided({});
    setOverall('');
  }

  return (
    <div>
      <h1 className={h1}>Review claim</h1>
      <p className={`mb-4 ${mutedText}`}>
        {sample ? 'This is a sample claim made of invented data. Your choices stay in this browser and are not saved anywhere.' : 'Read the claim, decide each item, then finish the review. You do not need an account.'}
      </p>
      <StatusBanner view={shown} />
      <ClaimBody
        payload={view.payload}
        fileUrl={(id) => `/api/review/${encodeURIComponent(token)}/files/${encodeURIComponent(id)}`}
        renderItemExtra={(item) => <ItemDecision key={`${item.id}-${locked}-${version}`} item={item} review={reviews.find((r) => r.itemId === item.id)} locked={locked} save={save} />}
      />

      <h2 className={`${h2} mb-2`}>Totals</h2>
      <div className="mb-4"><Totals view={view} reviews={reviews} /></div>

      <section className={`${card} mb-8`} aria-labelledby="finish">
        <h2 id="finish" className={h2}>Overall decision</h2>
        {locked ? (
          <>
            <p className="mt-2" data-testid="review-finished">Review finished: <strong>{STATUS_LABELS[status]}</strong>. It can no longer be changed.</p>
            {sample && <button type="button" className={`${btn} mt-3`} onClick={startAgain}>Start the sample again</button>}
          </>
        ) : !finishing ? (
          <>
            <p className={`mt-1 ${mutedText}`}>{undecided > 0 ? `${undecided} ${undecided === 1 ? 'item still needs' : 'items still need'} to be approved or rejected before you can finish.` : 'Every item is decided.'}</p>
            <button type="button" className={`${btnPrimary} mt-3`} disabled={undecided > 0} onClick={() => setFinishing(true)}>Finish review</button>
          </>
        ) : (
          <div data-testid="finish-confirm">
            <p className="mt-2 font-semibold">This will mark the claim as {outcome.ok ? STATUS_LABELS[outcome.status] : ''}. {sample ? '' : 'It cannot be undone.'}</p>
            <div className="mt-3"><TextAreaField id="overall-comment" label="Overall comment (optional)" rows={3} value={overall} onChange={(v) => setOverall(v.slice(0, 2000))} /></div>
            {problem && <p role="alert" className="mb-2 font-semibold text-state-over">⚠ {problem}</p>}
            <div className="flex flex-wrap gap-3">
              <button type="button" className={btnPrimary} onClick={() => void finish()}>Confirm and finish</button>
              <button type="button" className={btn} onClick={() => setFinishing(false)}>Go back</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
