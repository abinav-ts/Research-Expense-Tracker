// REQ-OFF-01: lets the app offer "Install app" where the browser supports it, and a hint on iPhone/iPad Safari, which has
// no install button of its own.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function startInstallWatch(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // keep the event so the button can use it later
    deferred = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = undefined;
    emit();
  });
}

export const canPromptInstall = (): boolean => deferred !== undefined;
export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export async function promptInstall(): Promise<void> {
  const event = deferred;
  if (!event) return;
  await event.prompt();
  await event.userChoice;
  deferred = undefined;
  emit();
}

/** iPhone and iPad (including iPadOS, which calls itself a Mac) in a browser tab rather than the installed app. */
export function needsIosHint(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}
