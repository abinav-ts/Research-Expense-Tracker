// REQ-NFR-09: the "← Back to …" link at the top of every inner screen.
import { Link } from 'react-router';
import { linkClass } from './ui.ts';

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <p className="mb-3" data-testid="back-link-row">
      <Link to={to} className={`${linkClass} max-w-full`} data-testid="back-link">
        <span aria-hidden="true" className="mr-1">←</span>
        <span className="min-w-0 [overflow-wrap:anywhere]">Back to {label}</span>
      </Link>
    </p>
  );
}
