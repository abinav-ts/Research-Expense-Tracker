import { useState } from 'react';
import { ConfirmPanel } from '../../components/ConfirmPanel.tsx';
import { btn, btnDanger, card, h1, h2, mutedText } from '../../components/ui.ts';
import { repo } from '../../db/index.ts';
import { attempt } from '../../lib/errors.ts';
import { useLive } from '../../lib/useLive.ts';
import { OcrStatus } from '../../ocr/OcrStatus.tsx';
import { PayeeList } from './PayeeList.tsx';

/** Removes the saved copy of the app (service workers and their caches) and reloads. Data in IndexedDB and the recognition data stay. */
async function refreshAppFiles(): Promise<void> {
  try {
    for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
    for (const key of await caches.keys()) if (!key.startsWith('expres-ocr')) await caches.delete(key);
  } finally {
    location.reload();
  }
}

/** Settings (M1b: what ExpRes has learned, REQ-CAP-16). Backup and storage controls arrive with REQ-CAP-12 and REQ-OFF-08. */
export function SettingsPage() {
  const counts = useLive(() => repo.learningCounts());
  const [confirming, setConfirming] = useState(false);
  const total = counts ? counts.payees + counts.formats + counts.categories : 0;
  const [refreshing, setRefreshing] = useState(false);

  return (
    <div>
      <h1 className={`${h1} mb-6`}>Settings</h1>

      <PayeeList />

      <section className={`${card} mb-6`} aria-labelledby="learned-heading">
        <h2 id="learned-heading" className={`${h2} mb-2`}>What ExpRes has learned</h2>
        <p className={`mb-3 ${mutedText}`}>
          To save you typing, ExpRes remembers the spelling of payees you save, the category you chose for each, and the
          words around values in messages you confirmed (not the amounts, dates or numbers). It stays on this device.
        </p>
        {counts && (
          <ul className="mb-4 list-disc pl-6" data-testid="learned-counts">
            <li><span data-testid="count-payees">{counts.payees}</span> payee {counts.payees === 1 ? 'spelling' : 'spellings'}</li>
            <li><span data-testid="count-categories">{counts.categories}</span> payee {counts.categories === 1 ? 'category' : 'categories'}</li>
            <li><span data-testid="count-formats">{counts.formats}</span> message {counts.formats === 1 ? 'format hint' : 'format hints'}</li>
          </ul>
        )}
        <button type="button" className={btnDanger} disabled={!counts || total === 0} onClick={() => setConfirming(true)}>
          Forget what ExpRes has learned
        </button>
        {confirming && (
          <ConfirmPanel
            message="Forget all remembered payees, categories and message formats? Your saved expenses are not changed."
            confirmLabel="Forget"
            onCancel={() => setConfirming(false)}
            onConfirm={async () => { await attempt(() => repo.clearLearning()); setConfirming(false); }}
          />
        )}
      </section>

      <section className={`${card} mb-6`} aria-labelledby="app-heading">
        <h2 id="app-heading" className={`${h2} mb-2`}>This app</h2>
        <p className="mb-3">Version: <span data-testid="app-version">{__APP_VERSION__}</span></p>
        <p className={`mb-3 ${mutedText}`}>
          If this device keeps showing an old version, "Refresh app files" throws away the saved copy of the app and loads the
          latest one. Your grants, trips, expenses and files are not touched.
        </p>
        <button
          type="button" className={btn} disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            await refreshAppFiles();
          }}
        >
          Refresh app files
        </button>
      </section>

      <section className={card} aria-labelledby="reading-heading">
        <h2 id="reading-heading" className={`${h2} mb-2`}>Reading screenshots</h2>
        <p className={`mb-2 ${mutedText}`}>Screenshots are read on this device, using about 7 MB of data that is downloaded once.</p>
        <OcrStatus />
      </section>
    </div>
  );
}
