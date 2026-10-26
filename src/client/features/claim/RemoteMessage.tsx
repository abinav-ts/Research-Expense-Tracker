import { btn, h1, mutedText } from '../../components/ui.ts';
import type { RemoteClaim } from './useRemoteClaim.ts';

/** What to show while a link's claim is not (yet) available. */
export function RemoteMessage({ claim, reload }: { claim: Exclude<RemoteClaim, { state: 'ready' }>; reload: () => void }) {
  if (claim.state === 'loading') return <p role="status">Loading the claim…</p>;
  if (claim.state === 'invalid') {
    return (
      <div role="alert" data-testid="link-invalid">
        <h1 className={h1}>This link is not valid</h1>
        <p className={`mt-2 ${mutedText}`}>Check that the whole link was copied. If it still does not open, ask the sender for a new one.</p>
      </div>
    );
  }
  return (
    <div role="alert">
      <h1 className={h1}>{claim.state === 'busy' ? 'Too many requests' : 'The claim could not be loaded'}</h1>
      <p className={`mt-2 ${mutedText}`}>{claim.state === 'busy' ? 'Please wait a minute and try again.' : 'Check your connection and try again.'}</p>
      <button type="button" className={`${btn} mt-4`} onClick={reload}>Try again</button>
    </div>
  );
}
