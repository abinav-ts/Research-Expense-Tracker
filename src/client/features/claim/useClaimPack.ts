// REQ-CLM-01, REQ-CLM-03, REQ-CLM-04: everything the claim page needs: the draft, its flags, the files made ready to send,
// and the payload that both the preview and the request are made from (REQ-PRIV-03).
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildClaimPayload, blockingItems, claimPayloadSchema, type ClaimPayload, type PreparedFile } from '../../../shared/claim.ts';
import { buildClaimDraft } from '../../../shared/claim-draft.ts';
import { evaluateTrip } from '../../../shared/rules/evaluate-trip.ts';
import { queries } from '../../db/queries.ts';
import { db, repo } from '../../db/index.ts';
import { prepareClaimFiles, sourceFilesFor, type PreparedSet } from '../../lib/claim-files.ts';
import { newKey, newToken } from '../../lib/tokens.ts';
import { useLive } from '../../lib/useLive.ts';

export interface Claimant { name: string; email: string; employeeId: string }

interface Attempt { sig: string; key: string; reviewToken: string; ownerToken: string; preparedAt: string }

export function useClaimPack(tripId: string) {
  const data = useLive(() => queries.tripDetail(tripId), [tripId]);
  const docs = useLive(() => (data ? db.grantDocs.where('grantId').equals(data.grant.id).toArray() : Promise.resolve([])), [data?.grant.id]);
  const [claimant, setClaimant] = useState<Claimant>({ name: '', email: '', employeeId: '' });
  const [loadedClaimant, setLoadedClaimant] = useState(false);
  const [prepared, setPrepared] = useState<PreparedSet>();
  const attempt = useRef<Attempt>(undefined);

  useEffect(() => {
    void repo.getClaimant().then((c) => { setClaimant(c); setLoadedClaimant(true); });
  }, []);

  const view = useMemo(() => {
    if (!data || !docs) return undefined;
    const { grant, trip, expenses, grantExpenses } = data;
    const { flags } = evaluateTrip(grant, trip, grantExpenses);
    const draft = buildClaimDraft(grant, trip, expenses);
    const attachments = expenses.filter((e) => !e.excluded).flatMap((e) => e.attachments);
    const sources = sourceFilesFor(attachments, docs);
    return { grant, trip, grantExpenses, flags, draft, sources };
  }, [data, docs]);

  // Make the files ready (pictures re-drawn small) whenever the set of files changes.
  const sourceSig = view?.sources.map((s) => s.id).join(',') ?? '';
  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    setPrepared(undefined);
    void prepareClaimFiles(view.sources).then((p) => { if (!cancelled) setPrepared(p); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSig]);

  const built = useMemo(() => {
    if (!view || !prepared) return undefined;
    const skippedAttachmentIds = prepared.skipped.map((s) => s.id);
    const content = (key: string, preparedAt: string): ClaimPayload =>
      buildClaimPayload({ draft: view.draft, flags: view.flags, grantExpenses: view.grantExpenses, claimant, idempotencyKey: key, preparedAt, files: prepared.files, skippedAttachmentIds });
    // The key, links and time stay the same while the content stays the same (a retry is the same claim, REQ-CLM-04),
    // and are renewed as soon as anything in the claim changes.
    const sig = JSON.stringify(content('k', 'p'));
    if (attempt.current?.sig !== sig) attempt.current = { sig, key: newKey(), reviewToken: newToken(), ownerToken: newToken(), preparedAt: new Date().toISOString() };
    const a = attempt.current;
    const payload = content(a.key, a.preparedAt);
    return { payload, reviewToken: a.reviewToken, ownerToken: a.ownerToken, files: prepared.files as PreparedFile[], blocking: blockingItems(view.draft, view.flags), check: claimPayloadSchema.safeParse(payload) };
  }, [view, prepared, claimant]);

  return { data, view, loadedClaimant, claimant, setClaimant, prepared, built };
}
