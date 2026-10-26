// REQ-CLM-01..04, REQ-PRIV-01, REQ-PRIV-03: prepare a claim. Nothing leaves the device until Submit, and Submit needs the
// user to confirm that the preview below is what the reviewer will see.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { CLAIM_LIMITS } from '../../../shared/claim.ts';
import { TextField } from '../../components/fields.tsx';
import { btn, btnPrimary, card, h1, h2, linkClass, mutedText } from '../../components/ui.ts';
import { repo } from '../../db/index.ts';
import { attempt } from '../../lib/errors.ts';
import { buildClaimPdf } from '../../lib/claim-pdf.ts';
import { pdfLogo, pdfProofs } from '../../lib/claim-pdf-assets.ts';
import { useOnline } from '../../lib/useOnline.ts';
import { ClaimView } from './ClaimView.tsx';
import { SubmittedLinks } from './SubmittedLinks.tsx';
import { useClaimPack } from './useClaimPack.ts';

type Sent = { reviewToken: string; ownerToken: string };

export function ClaimPage() {
  const { tripId = '' } = useParams();
  const { data, view, loadedClaimant, claimant, setClaimant, prepared, built } = useClaimPack(tripId);
  const online = useOnline();
  const [declared, setDeclared] = useState(false);
  const [checked, setChecked] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string[]>();
  const [sent, setSent] = useState<Sent>();
  const [pdfBusy, setPdfBusy] = useState(false);

  // Local object URLs so the preview can open the proofs exactly as a reviewer would (and nothing is fetched).
  const urls = useMemo(() => new Map((built?.files ?? []).map((f) => [f.meta.id, URL.createObjectURL(f.bytes)])), [built?.files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  if (data === undefined || !view || !loadedClaimant) return <p role="status">Loading…</p>;
  if (data === null) return <p role="alert">That trip was not found. <Link to="/grants" className="underline">Back to grants</Link></p>;
  const { trip, grant } = view;

  if (view.draft.items.length === 0) {
    return (
      <div>
        <h1 className={h1}>Prepare claim</h1>
        <p className={`${card} mt-4`} data-testid="claim-empty">There is nothing to claim yet: this trip has no expenses. <Link to={`/trips/${trip.id}`} className={linkClass}>Back to the trip</Link></p>
      </div>
    );
  }
  if (!prepared || !built) return <p role="status">Getting your proofs ready…</p>;

  const detailsOk = claimant.name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claimant.email.trim());
  const blocked = built.blocking.length > 0;
  const canSubmit = online && detailsOk && !blocked && declared && checked && built.check.success && !sending;

  async function makePdf() {
    setPdfBusy(true);
    try {
      const { bytes } = await buildClaimPdf(built!.payload, await pdfProofs(built!.files), await pdfLogo());
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `claim-pack-${trip.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip'}.pdf`;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setPdfBusy(false);
    }
  }

  async function submit() {
    if (!canSubmit || !built) return;
    setSending(true);
    setProblem(undefined);
    try {
      const form = new FormData();
      form.set('payload', JSON.stringify(built.payload)); // the very value the preview was drawn from (REQ-PRIV-03)
      form.set('reviewToken', built.reviewToken);
      form.set('ownerToken', built.ownerToken);
      for (const f of built.files) form.set(f.meta.id, f.bytes, f.meta.name);
      let res: Response;
      try {
        res = await fetch('/api/claims', { method: 'POST', body: form });
      } catch {
        setProblem(['Could not reach the server. Nothing was sent and nothing was lost; check your connection and try again.']);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; details?: string[] };
      if (!res.ok || !body.ok) {
        setProblem([body.error ?? 'The claim was not accepted.', ...(body.details ?? [])]);
        return;
      }
      const saved = await attempt(async () => {
        await repo.saveClaimant(claimant);
        await repo.saveSubmission({
          id: built.payload.idempotencyKey, tripId: trip.id, tripName: trip.name, reviewToken: built.reviewToken, ownerToken: built.ownerToken,
          submittedAt: new Date().toISOString(), totalMinor: built.payload.position.thisClaimMinor, itemCount: built.payload.items.length,
        });
      });
      if (!saved) setProblem(['The claim was sent, but this device could not remember the links. Copy them from below now.']);
      setSent({ reviewToken: built.reviewToken, ownerToken: built.ownerToken });
    } finally {
      setSending(false);
    }
  }

  const set = (field: keyof typeof claimant) => (value: string) => setClaimant({ ...claimant, [field]: value });
  const check = built.check;

  return (
    <div>
      <p className="text-sm"><Link to={`/trips/${trip.id}`} className="underline">{trip.name}</Link></p>
      <h1 className={h1}>Prepare claim</h1>
      <p className={`mb-4 ${mutedText}`}>
        Check the preview below. It is exactly what the reviewer will see. Nothing leaves this device until you press <strong>Submit</strong>.
      </p>

      {sent && <SubmittedLinks reviewToken={sent.reviewToken} ownerToken={sent.ownerToken} />}

      {!sent && (
        <>
          <section className={`${card} mb-4`} aria-labelledby="who">
            <h2 id="who" className={h2}>Who is claiming</h2>
            <div className="mt-3">
              <TextField id="claimantName" label="Your name" value={claimant.name} onChange={set('name')} autoComplete="name" maxLength={120} />
              <TextField id="claimantEmail" label="Your email" type="email" value={claimant.email} onChange={set('email')} autoComplete="email" maxLength={200}
                hint="The reviewer sees this so they can reach you."
                error={claimant.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claimant.email.trim()) ? 'That does not look like an email address.' : undefined} />
              <TextField id="claimantEmployeeId" label="Employee ID (optional)" value={claimant.employeeId} onChange={set('employeeId')} maxLength={60} />
            </div>
          </section>

          {prepared.skipped.length > 0 && (
            <section className="mb-4 rounded-xl border-2 border-state-low bg-surface p-4" role="status" data-testid="claim-skipped">
              <h2 className="font-semibold text-state-low">⚠ Some proofs cannot be sent</h2>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {prepared.skipped.map((s) => <li key={s.id}>{s.name}: {s.reason}.</li>)}
              </ul>
              <p className="mt-1 text-sm">The reviewer is told which items have proofs left out. Files are limited to {CLAIM_LIMITS.fileBytes / 1_000_000} MB each.</p>
            </section>
          )}

          {blocked && (
            <section className="mb-4 rounded-xl border-2 border-state-over bg-surface p-4" role="alert" data-testid="claim-blocked">
              <h2 className="font-semibold text-state-over">✖ Fix these before you can submit</h2>
              <ul className="mt-2 grid gap-2 text-sm">
                {built.blocking.map((b) => (
                  <li key={b.itemId}><Link to={`/expenses/${b.itemId}`} className={linkClass}>{b.description}</Link>: {b.messages.join(' ')}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <h2 className={`${h2} mb-2`}>What the reviewer will see</h2>
      <div className="mb-6 rounded-xl border-2 border-dashed border-ink-soft p-3 sm:p-4" data-testid="claim-preview">
        <ClaimView payload={built.payload} fileUrl={(id) => urls.get(id) ?? ''} />
      </div>

      {!sent && (
        <section className={`${card} mb-4`} aria-labelledby="send">
          <h2 id="send" className={h2}>Submit</h2>
          <label className="mt-3 flex min-h-11 items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
            <span>I make the declaration above.</span>
          </label>
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>I have checked that the preview is what the reviewer will see.</span>
          </label>
          {!online && <p role="status" className="mt-2 font-semibold text-state-low" data-testid="claim-offline">⚠ You are offline. Submit when connected. Everything stays on this device, and the PDF still works.</p>}
          {!detailsOk && <p className={`mt-2 text-sm ${mutedText}`}>Add your name and a valid email to submit.</p>}
          {!check.success && detailsOk && !blocked && <p role="alert" className="mt-2 text-sm font-semibold text-state-over">⚠ This claim is not complete: {check.error.issues[0]?.message}</p>}
          {problem && (
            <div role="alert" className="mt-3 rounded-lg border-2 border-state-over p-3 text-state-over" data-testid="claim-problem">
              {problem.map((line, n) => <p key={n} className={n === 0 ? 'font-semibold' : 'text-sm'}>{n === 0 ? '✖ ' : ''}{line}</p>)}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className={btnPrimary} disabled={!canSubmit} onClick={() => void submit()}>{sending ? 'Sending…' : 'Submit claim'}</button>
            <button type="button" className={btn} disabled={pdfBusy} onClick={() => void attempt(makePdf)}>{pdfBusy ? 'Making PDF…' : 'Download claim pack (PDF)'}</button>
          </div>
        </section>
      )}
      {sent && <button type="button" className={btn} disabled={pdfBusy} onClick={() => void attempt(makePdf)}>{pdfBusy ? 'Making PDF…' : 'Download claim pack (PDF)'}</button>}
      <p className={`mt-4 text-sm ${mutedText}`}>Grant: {grant.name}</p>
    </div>
  );
}
