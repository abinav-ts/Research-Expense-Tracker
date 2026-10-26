// REQ-OFF-07: shows "Online" or "Offline" in the header, with an icon as well as words (never colour alone), and tells
// screen readers when it changes.
import { useOnline } from '../lib/useOnline.ts';

export function ConnectionStatus() {
  const online = useOnline();
  return (
    <p role="status" aria-live="polite" data-testid="connection-status" data-online={online} className={`inline-flex items-center gap-1 text-sm font-semibold ${online ? 'text-state-healthy' : 'text-state-low'}`}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {online ? <path d="M2 7.5l3 3 7-7" /> : <><circle cx="7" cy="7" r="5.5" /><path d="M3 11L11 3" /></>}
      </svg>
      {online ? 'Online' : 'Offline'}
    </p>
  );
}
