import { useState } from 'react';
import { RULE_LABELS } from '../../../shared/rules/evaluate.ts';
import type { Flag } from '../../../shared/types.ts';
import { TextAreaField } from '../../components/fields.tsx';
import { btn } from '../../components/ui.ts';
import { repo } from '../../db/index.ts';
import { attempt } from '../../lib/errors.ts';

const MAX_JUSTIFICATION = 500;

/** REQ-RULE-09: every flag on an expense in words, and a place to say why it is fine. A justification never clears a flag. */
export function FlagPanel({ expenseId, flags, justification }: { expenseId: string; flags: Flag[]; justification: string | undefined }) {
  const [text, setText] = useState(justification ?? '');
  const [saved, setSaved] = useState(false);
  if (flags.length === 0 && !justification) return null;
  return (
    <section aria-labelledby="flags-heading" className="mb-6 rounded-xl border-2 border-line bg-surface p-4" data-testid="flag-panel">
      <h2 id="flags-heading" className="mb-2 font-display text-lg font-semibold">{flags.length > 0 ? 'Needs attention' : 'Note'}</h2>
      <ul className="mb-3 grid gap-2">
        {flags.map((f) => (
          <li key={f.ruleId} data-testid="expense-flag" data-rule={f.ruleId} className={`font-semibold ${f.severity === 'error' ? 'text-state-over' : 'text-state-low'}`}>
            {f.severity === 'error' ? '✖' : '⚠'} {RULE_LABELS[f.ruleId] ?? f.ruleId}: <span className="font-normal text-ink">{f.message}</span>
          </li>
        ))}
      </ul>
      <TextAreaField
        id="justification" label="Why this is fine (optional)" rows={2} value={text}
        onChange={(v) => { setText(v.slice(0, MAX_JUSTIFICATION)); setSaved(false); }}
        hint={`This explains the flags to the grant officer; it does not remove them. ${MAX_JUSTIFICATION - text.length} characters left.`}
      />
      <button type="button" className={btn} onClick={async () => setSaved(await attempt(() => repo.setJustification(expenseId, text)))}>Save note</button>
      {saved && <span role="status" className="ml-3 text-sm font-semibold text-state-healthy">✓ Saved</span>}
    </section>
  );
}
