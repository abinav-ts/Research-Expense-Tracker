import { useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { getOfflineReady, subscribePwa } from '../../app/pwa.ts';

const card =
  'flex min-h-11 flex-col gap-1 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-breeze-deep';

export function HomePage() {
  const offlineReady = useSyncExternalStore(subscribePwa, getOfflineReady);

  return (
    <div>
      <h1 className="font-display text-[40px] leading-[44px] font-bold">Prove your grant spending, not your whole bank statement.</h1>
      <p className="mt-4 max-w-prose text-ink-soft">
        ExpRes lets researchers track conference-travel expenses against a grant, reconcile them with a bank
        statement on their own device, and share only the selected items with the grant officer. Nothing leaves
        your device until you submit a claim.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link to="/grants" className={card}>
          <span className="font-display text-xl font-semibold">Researcher</span>
          <span className="text-ink-soft">Track expenses and prepare a claim.</span>
        </Link>
        <Link to="/review/sample" className={card}>
          <span className="font-display text-xl font-semibold">Reviewer (sample claim)</span>
          <span className="text-ink-soft">See what a grant officer reviews.</span>
        </Link>
      </div>

      <p className="mt-8 text-sm text-ink-soft" role="status">
        {offlineReady ? '✓ Ready for offline use' : ''}
      </p>
    </div>
  );
}
