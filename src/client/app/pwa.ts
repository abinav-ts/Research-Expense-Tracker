import { registerSW } from 'virtual:pwa-register';

// What the app tells the user about its own cache: "Ready for offline use" (REQ-OFF-02) and "New version available" (REQ-OFF-06).
let offlineReady = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
let updateReady = false;
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const CHECK_EVERY_MS = 30 * 60 * 1000;

export function startPwa(): void {
  if (!import.meta.env.PROD) return; // no service worker in dev, so cached files never hide code changes
  updateServiceWorker = registerSW({
    immediate: true,
    onOfflineReady() {
      offlineReady = true;
      emit();
    },
    onNeedRefresh() {
      updateReady = true;
      emit();
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Look for a new version now and then, and whenever the user comes back to the tab, not only when it is reloaded.
      const check = () => void registration.update().catch(() => undefined);
      window.setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    },
  });
}

/** Activates the waiting version and reloads. Only ever called from the user's tap on "Reload". */
export const reloadForUpdate = (): Promise<void> | undefined => updateServiceWorker?.(true);

export function subscribePwa(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const getOfflineReady = (): boolean => offlineReady;
export const getUpdateReady = (): boolean => updateReady;
