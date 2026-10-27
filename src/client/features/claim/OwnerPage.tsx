// REQ-CLM-07, REQ-REV-05: the researcher's view of a submitted claim: status, decisions, comments, approved total.
import { useParams } from 'react-router';
import { h1, linkClass, mutedText } from '../../components/ui.ts';
import { ClaimView as ClaimBody } from './ClaimView.tsx';
import { RemoteMessage } from './RemoteMessage.tsx';
import { StatusBanner, Totals } from './ReviewPage.tsx';
import { useRemoteClaim } from './useRemoteClaim.ts';

export function OwnerPage() {
  const { token = '' } = useParams();
  const { claim, reload } = useRemoteClaim('owner', token);
  if (claim.state !== 'ready') return <RemoteMessage claim={claim} reload={reload} />;
  const { view } = claim;
  return (
    <div>
      <h1 className={h1}>Your claim</h1>
      <p className={`mb-4 ${mutedText}`}>Submitted {new Date(view.submittedAt).toLocaleString()}. The decisions below are the reviewer’s.</p>
      <StatusBanner view={view} />
      <div className="mb-4"><Totals view={view} reviews={view.reviews} /></div>
      <button type="button" className={`${linkClass} mb-4`} onClick={reload}>Refresh</button>
      <ClaimBody payload={view.payload} reviews={view.reviews} fileUrl={(id) => `/api/owner/${encodeURIComponent(token)}/files/${encodeURIComponent(id)}`} />
    </div>
  );
}
