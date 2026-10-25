import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '../brand/Logo.tsx';
import { db } from '../db/index.ts';
import { clearError, useErrorMessage } from '../lib/errors.ts';
import { useLive } from '../lib/useLive.ts';

interface AppShellProps {
  /** 'reviewer' pages show the logo without a home link (REQ-BRAND-01). */
  variant: 'researcher' | 'reviewer';
  children: ReactNode;
}

const navLink = 'inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-ink hover:underline';

function ResearcherNav() {
  const inboxCount = useLive(() => db.inbox.count()) ?? 0;
  return (
    <nav aria-label="Main" className="ml-auto flex items-center gap-1">
      <Link to="/grants" className={navLink}>Grants</Link>
      <Link to="/inbox" className={navLink}>
        Inbox
        {inboxCount > 0 && (
          <span data-testid="inbox-badge" aria-label={`${inboxCount} unconfirmed`} className="ml-1 rounded-full bg-ink px-2 text-sm text-on-dark">{inboxCount}</span>
        )}
      </Link>
    </nav>
  );
}

function ErrorBanner() {
  const message = useErrorMessage();
  if (!message) return null;
  return (
    <div role="alert" className="border-b-2 border-state-over bg-surface">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3">
        <p className="flex-1 font-semibold text-state-over">⚠ {message}</p>
        <button type="button" onClick={clearError} className="min-h-11 px-3 font-semibold underline">Dismiss</button>
      </div>
    </div>
  );
}

/** Every route renders inside this shell, so the logo header is on every page (REQ-BRAND-01). */
export function AppShell({ variant, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-ground text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center px-4">
          <Logo asLink={variant === 'researcher'} />
          {variant === 'researcher' && <ResearcherNav />}
        </div>
      </header>
      <ErrorBanner />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
