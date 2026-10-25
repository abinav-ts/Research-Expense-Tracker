import type { ReactNode } from 'react';
import { Logo } from '../brand/Logo.tsx';

interface AppShellProps {
  /** 'reviewer' pages show the logo without a home link (REQ-BRAND-01). */
  variant: 'researcher' | 'reviewer';
  children: ReactNode;
}

/** Every route renders inside this shell, so the logo header is on every page (REQ-BRAND-01). */
export function AppShell({ variant, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-ground text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center px-4">
          <Logo asLink={variant === 'researcher'} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
