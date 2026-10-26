import { useState } from 'react';
import { CATEGORY_LABELS } from '../../../shared/types.ts';
import { ConfirmPanel } from '../../components/ConfirmPanel.tsx';
import { TextField } from '../../components/fields.tsx';
import { btn, btnPrimary, card, h2, mutedText } from '../../components/ui.ts';
import { repo } from '../../db/index.ts';
import { attempt } from '../../lib/errors.ts';
import { useLive } from '../../lib/useLive.ts';

/**
 * REQ-CAP-17: the payees ExpRes remembers (they are suggested while typing and when a receipt is read). Rename corrects a
 * misspelling that was saved once and would otherwise be suggested for ever; Remove forgets one. Saved expenses never change.
 */
export function PayeeList() {
  const payees = useLive(() => repo.listPayees());
  const [renaming, setRenaming] = useState<{ key: string; text: string }>();
  const [removing, setRemoving] = useState<{ key: string; name: string }>();

  return (
    <section className={`${card} mb-6`} aria-labelledby="payees-heading" data-testid="payee-list">
      <h2 id="payees-heading" className={`${h2} mb-2`}>Payees</h2>
      <p className={`mb-3 ${mutedText}`}>
        Names you have saved before are offered as you type and when a receipt is read. Correct a misspelling here so it is not
        suggested again. This changes what ExpRes suggests; your saved expenses are not changed.
      </p>
      {payees && payees.length === 0 && <p className={mutedText} data-testid="payees-empty">No payees yet. They appear when you save an expense.</p>}
      <ul className="grid gap-3">
        {payees?.map((p) => (
          <li key={p.key} className="rounded-lg border border-line p-3" data-testid="payee-row">
            {renaming?.key === p.key ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await attempt(() => repo.renamePayee(p.key, renaming.text))) setRenaming(undefined);
                }}
              >
                <TextField id={`rename-${p.key}`} label={`New name for ${p.name}`} value={renaming.text} onChange={(text) => setRenaming({ key: p.key, text })} maxLength={80} />
                <div className="flex gap-3">
                  <button type="submit" className={btnPrimary}>Save name</button>
                  <button type="button" className={btn} onClick={() => setRenaming(undefined)}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <p className="font-semibold [overflow-wrap:anywhere]" data-testid="payee-name">{p.name}</p>
                <p className="mb-2 text-sm text-ink-soft">
                  {p.categoryId ? CATEGORY_LABELS[p.categoryId] : 'No category remembered'} · saved {p.count} {p.count === 1 ? 'time' : 'times'}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button type="button" className={btn} onClick={() => setRenaming({ key: p.key, text: p.name })} aria-label={`Rename ${p.name}`}>Rename</button>
                  <button type="button" className={btn} onClick={() => setRemoving({ key: p.key, name: p.name })} aria-label={`Remove ${p.name}`}>Remove</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {removing && (
        <ConfirmPanel
          message={`Forget "${removing.name}"? It will no longer be suggested. Saved expenses are not changed.`} confirmLabel="Forget payee"
          onCancel={() => setRemoving(undefined)}
          onConfirm={async () => { await attempt(() => repo.removePayee(removing.key)); setRemoving(undefined); }}
        />
      )}
    </section>
  );
}
