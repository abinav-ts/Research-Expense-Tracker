// REQ-OFF-01: optional install. The app works in a normal browser tab; installing only adds a home-screen icon.
import { useSyncExternalStore } from 'react';
import { canPromptInstall, needsIosHint, promptInstall, subscribeInstall } from '../../app/install.ts';
import { btn, card, h2, mutedText } from '../../components/ui.ts';

export function InstallSection() {
  const canPrompt = useSyncExternalStore(subscribeInstall, canPromptInstall);
  const ios = needsIosHint();
  if (!canPrompt && !ios) return null;
  return (
    <section className={`${card} mb-6`} aria-labelledby="install-heading" data-testid="install-section">
      <h2 id="install-heading" className={`${h2} mb-2`}>Install the app</h2>
      <p className={`mb-3 ${mutedText}`}>Optional. ExpRes works in the browser; installing adds an icon to your home screen and opens it without browser bars.</p>
      {canPrompt && <button type="button" className={btn} onClick={() => void promptInstall()}>Install app</button>}
      {!canPrompt && ios && <p data-testid="ios-install-hint">On iPhone or iPad: tap the <strong>Share</strong> button in Safari, then <strong>Add to Home Screen</strong>.</p>}
    </section>
  );
}
