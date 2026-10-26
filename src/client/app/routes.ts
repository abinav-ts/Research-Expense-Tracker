// The list of every screen. Pure data, so tests can iterate it (REQ-BRAND-01). Elements live in App.tsx.
export interface RouteDef {
  id: string;
  path: string;
  /** A concrete URL that opens this route (ids need not exist: the screen then says "not found" inside the shell). */
  sample: string;
  title: string;
  shell: 'researcher' | 'reviewer';
}

export const routes: readonly RouteDef[] = [
  { id: 'home', path: '/', sample: '/', title: '', shell: 'researcher' },
  { id: 'grants', path: '/grants', sample: '/grants', title: 'Grants', shell: 'researcher' },
  { id: 'grant-new', path: '/grants/new', sample: '/grants/new', title: 'New grant', shell: 'researcher' },
  { id: 'grant', path: '/grants/:grantId', sample: '/grants/none', title: 'Grant', shell: 'researcher' },
  { id: 'grant-edit', path: '/grants/:grantId/edit', sample: '/grants/none/edit', title: 'Edit grant', shell: 'researcher' },
  { id: 'trip-new', path: '/trips/new', sample: '/trips/new', title: 'New trip', shell: 'researcher' },
  { id: 'trip', path: '/trips/:tripId', sample: '/trips/none', title: 'Trip', shell: 'researcher' },
  { id: 'trip-edit', path: '/trips/:tripId/edit', sample: '/trips/none/edit', title: 'Edit trip', shell: 'researcher' },
  { id: 'expense-new', path: '/trips/:tripId/expenses/new', sample: '/trips/none/expenses/new', title: 'Add expense', shell: 'researcher' },
  { id: 'expense', path: '/expenses/:expenseId', sample: '/expenses/none', title: 'Expense', shell: 'researcher' },
  { id: 'inbox', path: '/inbox', sample: '/inbox', title: 'Inbox', shell: 'researcher' },
  { id: 'inbox-item', path: '/inbox/:itemId', sample: '/inbox/none', title: 'Inbox item', shell: 'researcher' },
  { id: 'settings', path: '/settings', sample: '/settings', title: 'Settings', shell: 'researcher' },
  { id: 'reviewer-sample', path: '/review/sample', sample: '/review/sample', title: 'Review sample claim', shell: 'reviewer' },
  { id: 'not-found', path: '*', sample: '/no-such-page', title: 'Page not found', shell: 'researcher' },
];

/** The page <title> always ends with "ExpRes" (REQ-BRAND-01). */
export function pageTitle(title: string): string {
  return title ? `${title} · ExpRes` : 'ExpRes';
}
