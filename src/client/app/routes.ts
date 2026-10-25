// The list of every screen. Pure data, so tests can iterate it (REQ-BRAND-01). Elements live in App.tsx.
export interface RouteDef {
  id: string;
  path: string;
  /** A concrete URL that opens this route. */
  sample: string;
  title: string;
  shell: 'researcher' | 'reviewer';
}

export const routes: readonly RouteDef[] = [
  { id: 'home', path: '/', sample: '/', title: '', shell: 'researcher' },
  { id: 'researcher', path: '/trips', sample: '/trips', title: 'Researcher', shell: 'researcher' },
  { id: 'reviewer-sample', path: '/review/sample', sample: '/review/sample', title: 'Review sample claim', shell: 'reviewer' },
  { id: 'not-found', path: '*', sample: '/no-such-page', title: 'Page not found', shell: 'researcher' },
];

/** The page <title> always ends with "ExpRes" (REQ-BRAND-01). */
export function pageTitle(title: string): string {
  return title ? `${title} · ExpRes` : 'ExpRes';
}
