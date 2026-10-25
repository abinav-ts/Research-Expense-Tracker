import { registerSW } from 'virtual:pwa-register';

// Tracks "the app shell is cached and works offline" for the UI (REQ-OFF-02 wording: "Ready for offline use").
let ready = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
const listeners = new Set<() => void>();

export function startPwa(): void {
  if (!import.meta.env.PROD) return; // no service worker in dev, so cached files never hide code changes
  registerSW({
    immediate: true,
    onOfflineReady() {
      ready = true;
      listeners.forEach((l) => l());
    },
  });
}

export function subscribeOfflineReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getOfflineReady = (): boolean => ready;
