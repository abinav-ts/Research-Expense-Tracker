// REQ-REV-01, REQ-CLM-07: loads a claim from a review or owner link. These are the only requests the claim screens make,
// and only for someone who opened such a link (REQ-PRIV-05: our own server only).
import { useCallback, useEffect, useState } from 'react';
import type { ClaimView } from '../../../shared/claim.ts';

export type RemoteClaim =
  | { state: 'loading' }
  | { state: 'invalid' }
  | { state: 'busy' }
  | { state: 'error' }
  | { state: 'ready'; view: ClaimView };

export function useRemoteClaim(kind: 'review' | 'owner', token: string): { claim: RemoteClaim; reload: () => void } {
  const [claim, setClaim] = useState<RemoteClaim>({ state: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    // Search engines must not index a claim page (REQ-REV-07); the server says so too, in a header.
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.append(meta);
    return () => meta.remove();
  }, []);
  useEffect(() => {
    let cancelled = false;
    setClaim({ state: 'loading' });
    fetch(`/api/${kind}/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) return setClaim({ state: 'invalid' });
        if (res.status === 429) return setClaim({ state: 'busy' });
        const body = (await res.json()) as { ok: boolean; view?: ClaimView };
        setClaim(res.ok && body.view ? { state: 'ready', view: body.view } : { state: 'error' });
      })
      .catch(() => !cancelled && setClaim({ state: 'error' }));
    return () => { cancelled = true; };
  }, [kind, token, tick]);
  return { claim, reload: useCallback(() => setTick((n) => n + 1), []) };
}
