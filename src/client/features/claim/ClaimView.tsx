// REQ-CLM-01, REQ-REV-01, REQ-REV-04: the one picture of a claim. The researcher's preview and the reviewer's page both
// draw it from the same ClaimPayload, so what is checked before Submit is what is read after.
import { useState, type ReactNode } from 'react';
import { categoryTotals, type ClaimPayload, type ClaimPayloadFile, type ClaimPayloadItem, type ItemReview } from '../../../shared/claim.ts';
import { formatDateLabel } from '../../../shared/dates.ts';
import { formatInr, formatMinor } from '../../../shared/money.ts';
import { RULE_LABELS } from '../../../shared/rules/evaluate.ts';
import { CATEGORY_LABELS, PROOF_TYPE_LABELS } from '../../../shared/types.ts';
import { card, h2, linkClass, mutedText } from '../../components/ui.ts';

export interface ClaimViewProps {
  payload: ClaimPayload;
  /** Where a file can be fetched from: a local object URL in the preview, the server for a reviewer. */
  fileUrl: (fileId: string) => string;
  reviews?: ItemReview[];
  /** Reviewer controls, shown under each item. */
  renderItemExtra?: (item: ClaimPayloadItem) => ReactNode;
}

const flagIcon = { error: '✖', warn: '⚠', info: 'ℹ' } as const;
const flagColour = { error: 'text-state-over', warn: 'text-state-low', info: 'text-ink-soft' } as const;

/** A proof is only loaded when asked for (REQ-REV-04). */
function Proof({ file, url }: { file: ClaimPayloadFile; url: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string>();
  const [failed, setFailed] = useState(false);
  const label = file.proofType ? PROOF_TYPE_LABELS[file.proofType] : file.kind === 'grant_doc' ? 'Grant document' : 'Proof';
  const show = () => {
    setOpen(true);
    if (file.mime === 'text/plain') {
      fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error('unreadable')))).then(setText, () => setFailed(true));
    }
  };
  return (
    <li className="mb-2" data-testid="claim-proof">
      {!open ? (
        <button type="button" onClick={show} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink-soft bg-surface px-3 font-semibold text-ink">
          View {label.toLowerCase()} <span className={`font-normal ${mutedText}`}>· {file.name}</span>
        </button>
      ) : (
        <figure>
          <figcaption className="mb-1 flex items-center gap-3 text-sm font-semibold text-ink-soft">
            {label} · {file.name}
            <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-2 underline">Hide</button>
          </figcaption>
          {file.mime === 'text/plain' && <pre className="overflow-x-auto rounded-lg border border-line bg-ground p-3 text-sm whitespace-pre-wrap" data-testid="claim-proof-text">{failed ? 'This file could not be loaded.' : (text ?? '…')}</pre>}
          {file.mime.startsWith('image/') && (
            <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`${label}: ${file.name}`} className="max-h-96 w-full rounded-lg border border-line object-contain" /></a>
          )}
          {file.mime === 'application/pdf' && <a href={url} target="_blank" rel="noreferrer" className={linkClass}>Open the PDF</a>}
        </figure>
      )}
    </li>
  );
}

function ItemCard({ item, payload, fileUrl, review, extra }: { item: ClaimPayloadItem; payload: ClaimPayload; fileUrl: (id: string) => string; review?: ItemReview | undefined; extra?: ReactNode }) {
  const byId = new Map(payload.files.map((f) => [f.id, f]));
  const s = item.statementRef;
  return (
    <li className={card} data-testid="claim-item" data-item-id={item.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 className="font-display text-lg font-semibold">{item.description}</h3>
        <p className="amount text-lg font-semibold" data-testid="claim-item-amount">{formatInr(item.amountMinor)}</p>
      </div>
      <p className={`text-sm ${mutedText}`}>
        {formatDateLabel(item.date)} · {item.categoryId ? CATEGORY_LABELS[item.categoryId] : 'No category'}
        {item.originalCurrency !== 'INR' && <> · Paid {formatMinor(item.originalMinor, item.originalCurrency, 2)}</>}
      </p>
      {s ? (
        <p className="mt-2 text-sm" data-testid="claim-statement-line">
          <span className="font-semibold">Bank statement:</span> {formatDateLabel(s.date)} · {s.narration} · {formatInr(s.debitMinor)}{s.refNo ? ` · ref ${s.refNo}` : ''}
        </p>
      ) : (
        <p className="mt-2 text-sm" data-testid="claim-cash-line"><span className="font-semibold">Paid in cash</span>, so there is no statement line.</p>
      )}
      {item.justification && <p className="mt-1 text-sm" data-testid="claim-justification"><span className="font-semibold">Note from the claimant:</span> {item.justification}</p>}
      {item.flags.length > 0 && (
        <ul className="mt-2 grid gap-1" aria-label="Flags">
          {item.flags.map((f) => (
            <li key={f.ruleId} data-testid="claim-flag" className={`text-sm font-semibold ${flagColour[f.severity]}`}>
              {flagIcon[f.severity]} {RULE_LABELS[f.ruleId] ?? f.ruleId}: <span className="font-normal text-ink">{f.message}</span>
            </li>
          ))}
        </ul>
      )}
      {(item.fileIds.length > 0 || item.missingProofs > 0) && (
        <ul className="mt-3" aria-label="Proofs">
          {item.fileIds.map((id) => byId.get(id)).filter((f): f is ClaimPayloadFile => !!f).map((f) => <Proof key={f.id} file={f} url={fileUrl(f.id)} />)}
          {item.missingProofs > 0 && <li className="text-sm font-semibold text-state-low" data-testid="claim-missing-proof">⚠ {item.missingProofs} proof{item.missingProofs === 1 ? '' : 's'} not included (too large to send).</li>}
        </ul>
      )}
      {item.fileIds.length === 0 && item.missingProofs === 0 && <p className={`mt-2 text-sm ${mutedText}`}>No proof attached.</p>}
      {review && <p className="mt-2 text-sm" data-testid="claim-review-note"><span className="font-semibold">{{ approve: 'Approved', reject: 'Rejected', query: 'Query' }[review.decision]}</span>{review.comment ? `: ${review.comment}` : ''}</p>}
      {extra}
    </li>
  );
}

export function ClaimView({ payload, fileUrl, reviews = [], renderItemExtra }: ClaimViewProps) {
  const p = payload.position;
  const totals = categoryTotals(payload.items);
  const grantDocs = payload.files.filter((f) => f.kind === 'grant_doc');
  const reviewOf = new Map(reviews.map((r) => [r.itemId, r]));
  return (
    <div data-testid="claim-view">
      <section className={`${card} mb-4`} aria-labelledby="cv-claim">
        <h2 id="cv-claim" className={h2}>{payload.trip.name}</h2>
        <p className={mutedText}>{payload.trip.city}, {payload.trip.country} · {formatDateLabel(payload.trip.startDate)} to {formatDateLabel(payload.trip.endDate)}</p>
        <dl className="mt-3 grid gap-1 text-sm">
          <div><dt className="inline font-semibold">Claimant: </dt><dd className="inline" data-testid="claim-claimant">{payload.claimant.name} · {payload.claimant.email}{payload.claimant.employeeId ? ` · ID ${payload.claimant.employeeId}` : ''}</dd></div>
          <div><dt className="inline font-semibold">Grant: </dt><dd className="inline">{payload.grant.name}{payload.grant.sponsor ? ` · ${payload.grant.sponsor}` : ''} · {formatDateLabel(payload.grant.startDate)} to {formatDateLabel(payload.grant.endDate)}</dd></div>
        </dl>
        <p className="amount mt-3 text-2xl font-bold" data-testid="claim-total">{formatInr(p.thisClaimMinor)} <span className="text-base font-normal text-ink-soft">claimed in {payload.items.length} {payload.items.length === 1 ? 'item' : 'items'}</span></p>
      </section>

      <section className={`${card} mb-4`} aria-labelledby="cv-position" data-testid="claim-position">
        <h2 id="cv-position" className={h2}>Grant position</h2>
        <dl className="amount mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <dt>Sanctioned</dt><dd className="text-right">{formatInr(p.sanctionedMinor)}</dd>
          <dt>Used before ExpRes</dt><dd className="text-right">{formatInr(p.usedBeforeMinor)}</dd>
          <dt>Spent on other trips</dt><dd className="text-right">{formatInr(p.otherTripsMinor)}</dd>
          <dt>This claim</dt><dd className="text-right">{formatInr(p.thisClaimMinor)}</dd>
          <dt className="font-semibold">Left after this claim</dt><dd className={`text-right font-semibold ${p.leftMinor < 0 ? 'text-state-over' : ''}`} data-testid="claim-left">{p.leftMinor < 0 ? `Over by ${formatInr(-p.leftMinor)}` : formatInr(p.leftMinor)}</dd>
        </dl>
      </section>

      <section className={`${card} mb-4`} aria-labelledby="cv-cats">
        <h2 id="cv-cats" className={h2}>By category</h2>
        <dl className="amount mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1" data-testid="claim-categories">
          {totals.map((c) => (<div key={c.label} className="contents"><dt>{c.label} ({c.count})</dt><dd className="text-right">{formatInr(c.totalMinor)}</dd></div>))}
        </dl>
      </section>

      <h2 className={`${h2} mb-2`}>Items</h2>
      <ul className="mb-4 grid gap-3">
        {payload.items.map((item) => (
          <ItemCard key={item.id} item={item} payload={payload} fileUrl={fileUrl} review={reviewOf.get(item.id)} extra={renderItemExtra?.(item)} />
        ))}
      </ul>

      {grantDocs.length > 0 && (
        <section className={`${card} mb-4`} aria-labelledby="cv-docs">
          <h2 id="cv-docs" className={h2}>Grant documents</h2>
          <ul className="mt-2">{grantDocs.map((f) => <Proof key={f.id} file={f} url={fileUrl(f.id)} />)}</ul>
        </section>
      )}

      <section className={`${card} mb-4`} aria-labelledby="cv-decl">
        <h2 id="cv-decl" className={h2}>Declaration</h2>
        <p className="mt-1" data-testid="claim-declaration">{payload.declaration}</p>
      </section>
    </div>
  );
}
