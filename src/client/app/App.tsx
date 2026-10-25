import { useEffect, type ReactElement } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { HomePage } from '../features/home/HomePage.tsx';
import { ComingSoon } from '../features/placeholders/ComingSoon.tsx';
import { AppShell } from './AppShell.tsx';
import { pageTitle, routes, type RouteDef } from './routes.ts';

const screens: Record<string, ReactElement> = {
  home: <HomePage />,
  researcher: (
    <ComingSoon heading="Researcher workspace" note="Grants, trips and expense tracking arrive in milestone M1." />
  ),
  'reviewer-sample': (
    <ComingSoon heading="Sample claim" note="The reviewer view of a sample claim arrives in milestone M3." />
  ),
  'not-found': <ComingSoon heading="Page not found" note="That address does not exist in ExpRes." />,
};

function Page({ def, children }: { def: RouteDef; children: ReactElement }) {
  useEffect(() => {
    document.title = pageTitle(def.title);
  }, [def.title]);
  return <AppShell variant={def.shell}>{children}</AppShell>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {routes.map((def) => (
          <Route key={def.id} path={def.path} element={<Page def={def}>{screens[def.id]!}</Page>} />
        ))}
      </Routes>
    </BrowserRouter>
  );
}
