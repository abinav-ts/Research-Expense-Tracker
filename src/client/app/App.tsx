import { useEffect, type ReactElement } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ClaimPage } from '../features/claim/ClaimPage.tsx';
import { OwnerPage } from '../features/claim/OwnerPage.tsx';
import { ReviewPage } from '../features/claim/ReviewPage.tsx';
import { HomePage } from '../features/home/HomePage.tsx';
import { ComingSoon } from '../features/placeholders/ComingSoon.tsx';
import { ExpenseNewPage } from '../features/live/ExpenseNewPage.tsx';
import { ExpensePage } from '../features/live/ExpensePage.tsx';
import { InboxItemPage } from '../features/live/InboxItemPage.tsx';
import { InboxPage } from '../features/live/InboxPage.tsx';
import { TripPage } from '../features/live/TripPage.tsx';
import { SettingsPage } from '../features/settings/SettingsPage.tsx';
import { StatementPage } from '../features/statement/StatementPage.tsx';
import { GrantFormPage } from '../features/setup/GrantFormPage.tsx';
import { GrantPage } from '../features/setup/GrantPage.tsx';
import { GrantsPage } from '../features/setup/GrantsPage.tsx';
import { TripFormPage } from '../features/setup/TripFormPage.tsx';
import { AppShell } from './AppShell.tsx';
import { pageTitle, routes, type RouteDef } from './routes.ts';

const screens: Record<string, ReactElement> = {
  home: <HomePage />,
  grants: <GrantsPage />,
  'grant-new': <GrantFormPage />,
  grant: <GrantPage />,
  'grant-edit': <GrantFormPage />,
  'trip-new': <TripFormPage />,
  trip: <TripPage />,
  'trip-edit': <TripFormPage />,
  statement: <StatementPage />,
  'expense-new': <ExpenseNewPage />,
  expense: <ExpensePage />,
  inbox: <InboxPage />,
  'inbox-item': <InboxItemPage />,
  settings: <SettingsPage />,
  claim: <ClaimPage />,
  review: <ReviewPage />,
  owner: <OwnerPage />,
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
