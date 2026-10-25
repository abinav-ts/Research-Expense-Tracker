import { useState } from 'react';
import { ASSIGN_LABELS, assignSelection, selectionText, tokenize, type AssignField } from '../../../shared/assign.ts';
import type { ExpenseFormInput } from '../../../shared/expense-form.ts';
import { btn } from '../../components/ui.ts';

/**
 * REQ-CAP-15: the message text as tappable words. Tap words, then choose which field they are.
 * The parser only prefills; this guarantees any bank format can still be entered.
 */
export function TextAssigner({ text, onAssign }: { text: string; onAssign: (values: Partial<ExpenseFormInput>) => void }) {
  const tokens = tokenize(text);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [note, setNote] = useState<{ ok: boolean; text: string }>();
  const toggle = (index: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(index)) next.add(index);
      return next;
    });

  function assign(field: AssignField) {
    const result = assignSelection(field, selectionText(tokens, selected));
    if (result.ok) {
      onAssign(result.patch);
      setSelected(new Set());
      setNote({ ok: true, text: result.message });
    } else {
      setNote({ ok: false, text: result.error });
    }
  }

  if (!tokens.length) return null;
  return (
    <section aria-label="Tap words to fill the form" className="mb-4 rounded-xl border border-line bg-surface p-3" data-testid="text-assigner">
      <p className="mb-2 text-sm font-semibold text-ink-soft">Tap the words that belong together, then say what they are.</p>
      <p className="mb-3 flex flex-wrap gap-1" data-testid="assigner-words">
        {tokens.map((t) => (
          <button
            key={t.index} type="button" aria-pressed={selected.has(t.index)} onClick={() => toggle(t.index)}
            className={`min-h-11 rounded-lg border px-2 break-all ${selected.has(t.index) ? 'border-ink bg-ink font-semibold text-on-dark' : 'border-line bg-ground text-ink'}`}
          >
            {t.text}
          </button>
        ))}
      </p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ASSIGN_LABELS) as AssignField[]).map((field) => (
          <button key={field} type="button" className={btn} disabled={selected.size === 0} onClick={() => assign(field)}>
            Use as {ASSIGN_LABELS[field].toLowerCase()}
          </button>
        ))}
        <button type="button" className={btn} disabled={selected.size === 0} onClick={() => { setSelected(new Set()); setNote(undefined); }}>Clear</button>
      </div>
      {note && <p role="status" className={`mt-2 text-sm font-semibold ${note.ok ? 'text-state-healthy' : 'text-state-over'}`} data-testid="assigner-note">{note.ok ? '✓' : '⚠'} {note.text}</p>}
    </section>
  );
}
