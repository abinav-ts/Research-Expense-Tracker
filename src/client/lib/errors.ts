import { useSyncExternalStore } from 'react';

// A tiny store so any screen can show "could not save" in the shell's banner (REQ-CAP-11: nothing fails silently).
let message: string | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function reportError(error: unknown): void {
  message = error instanceof Error ? error.message : 'Something went wrong.';
  emit();
}
export function clearError(): void {
  message = undefined;
  emit();
}
export function useErrorMessage(): string | undefined {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => message);
}

/** Runs an action; a failure goes to the banner instead of being lost. Returns true on success. */
export async function attempt(action: () => Promise<unknown>): Promise<boolean> {
  try {
    await action();
    clearError();
    return true;
  } catch (error) {
    reportError(error);
    return false;
  }
}
