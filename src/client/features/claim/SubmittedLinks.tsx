// REQ-CLM-04: the two private links a submission returns.
import { useState } from 'react';
import { btn, card, h2, mutedText } from '../../components/ui.ts';

function CopyRow({ label, hint, url, testId }: { label: string; hint: string; url: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
      document.getElementById(testId)?.focus();
      (document.getElementById(testId) as HTMLInputElement | null)?.select();
    }
  };
  return (
    <div className="mb-4">
      <label htmlFor={testId} className="mb-1 block font-semibold">{label}</label>
      <p className={`mb-1 text-sm ${mutedText}`}>{hint}</p>
      <div className="flex flex-wrap gap-2">
        <input id={testId} data-testid={testId} readOnly value={url} className="block min-h-11 min-w-0 flex-1 rounded-lg border border-ink-soft bg-surface px-3 py-2 text-sm text-ink" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className={btn} onClick={() => void copy()}>{copied ? '✓ Copied' : 'Copy'}</button>
      </div>
    </div>
  );
}

export function SubmittedLinks({ reviewToken, ownerToken }: { reviewToken: string; ownerToken: string }) {
  const base = window.location.origin;
  return (
    <section className={`${card} mb-6 border-2 border-state-healthy`} role="status" aria-labelledby="sent" data-testid="claim-sent">
      <h2 id="sent" className={h2}>✓ Claim submitted</h2>
      <p className={`mb-4 ${mutedText}`}>Keep both links. Anyone who has a link can open it, so share each only with the person it is for.</p>
      <CopyRow testId="review-link" label="Review link (for the grant officer)" hint="They can read the claim and approve, reject or query each item." url={`${base}/review/${reviewToken}`} />
      <CopyRow testId="owner-link" label="Your link (to see the outcome)" hint="Shows the decisions and comments. This device also remembers it on the trip page." url={`${base}/claim/${ownerToken}`} />
    </section>
  );
}
