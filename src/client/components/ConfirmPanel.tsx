import { btn, btnDanger } from './ui.ts';

/** An inline confirmation (instead of window.confirm) so it can be styled, read by screen readers and tested. */
export function ConfirmPanel({ message, confirmLabel, onConfirm, onCancel }: { message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="alertdialog" aria-label="Please confirm" className="my-4 rounded-xl border-2 border-state-over bg-surface p-4">
      <p className="mb-3 font-semibold">{message}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={btnDanger} onClick={onConfirm}>{confirmLabel}</button>
        <button type="button" className={btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
