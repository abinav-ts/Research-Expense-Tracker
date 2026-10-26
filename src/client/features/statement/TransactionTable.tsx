import { useState } from 'react';
import { suggestCategory } from '../../../shared/categoriser.ts';
import { formatDateLabel } from '../../../shared/dates.ts';
import { formatInr } from '../../../shared/money.ts';
import type { StatementRow } from '../../../shared/statement-map.ts';
import { CATEGORY_IDS, CATEGORY_LABELS, type CategoryId } from '../../../shared/types.ts';
import { TextField } from '../../components/fields.tsx';
import { btn, btnPrimary, card, h2, mutedText } from '../../components/ui.ts';

const categoryOptions = [{ value: '', label: 'Category: choose later' }, ...CATEGORY_IDS.map((id) => ({ value: id, label: CATEGORY_LABELS[id] }))];

/**
 * REQ-CSV-03, -04, -05: the statement's debits, with search and a date range (the trip's dates by default), checkboxes, a
 * category for ticked rows, and "Add to this trip". Rows already used by an expense are shown but cannot be ticked.
 */
export function TransactionTable({ debits, creditCount, range, owners, memory, onAdd }: {
  debits: StatementRow[];
  creditCount: number;
  /** The trip's dates widened by the grant's buffer: where the table starts. */
  range: { from: string; to: string };
  /** Rows already used, by fingerprint, with a label saying by what. */
  owners: ReadonlyMap<string, string>;
  memory: Map<string, CategoryId>;
  onAdd: (items: { row: StatementRow; categoryId?: CategoryId }[]) => Promise<{ added: number; skipped: number }>;
}) {
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [categories, setCategories] = useState<Record<string, CategoryId | ''>>({});
  const [message, setMessage] = useState<string>();
  const [adding, setAdding] = useState(false);

  const q = query.trim().toLowerCase();
  const shown = debits.filter((r) => (!q || `${r.narration} ${r.refNo ?? ''}`.toLowerCase().includes(q)) && (!from || r.date >= from) && (!to || r.date <= to));
  const selectable = shown.filter((r) => !owners.has(r.rowHash));
  const allShownTicked = selectable.length > 0 && selectable.every((r) => selected.has(r.rowHash));
  const chosen = debits.filter((r) => selected.has(r.rowHash));
  const total = chosen.reduce((sum, r) => sum + r.debitMinor, 0);

  const toggle = (hash: string) => setSelected((prev) => { const next = new Set(prev); if (!next.delete(hash)) next.add(hash); return next; });
  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev);
    for (const r of selectable) allShownTicked ? next.delete(r.rowHash) : next.add(r.rowHash);
    return next;
  });
  const setAllCategories = (value: string) => setCategories((prev) => ({ ...prev, ...Object.fromEntries(chosen.map((r) => [r.rowHash, value as CategoryId | ''])) }));

  async function add() {
    setAdding(true);
    try {
      const { added, skipped } = await onAdd(chosen.map((r) => ({ row: r, ...(categories[r.rowHash] && { categoryId: categories[r.rowHash] as CategoryId }) })));
      setSelected(new Set());
      setMessage(`Added ${added} ${added === 1 ? 'expense' : 'expenses'} to this trip${skipped ? ` (${skipped} already added, skipped)` : ''}. They are verified: they come straight from the statement.`);
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className={`${card} mb-6`} aria-labelledby="table-heading" data-testid="transaction-table">
      <h2 id="table-heading" className={`${h2} mb-1`}>Other debits that belong to this trip</h2>
      <p className={`mb-3 ${mutedText}`}>Tick the ones to add. Rows you do not tick are never saved.</p>

      <TextField id="stmt-search" label="Search" value={query} onChange={setQuery} placeholder="narration or reference" />
      <div className="grid gap-x-3 sm:grid-cols-2">
        <TextField id="stmt-from" label="From" type="date" value={from} onChange={setFrom} />
        <TextField id="stmt-to" label="To" type="date" value={to} onChange={setTo} />
      </div>
      {(from !== '' || to !== '') && <button type="button" className={`${btn} mb-3`} onClick={() => { setFrom(''); setTo(''); }}>Show all dates</button>}

      <p className="mb-3 text-sm" data-testid="table-summary" role="status">
        <span data-testid="table-count">{shown.length} of {debits.length} debits shown</span>
        {creditCount > 0 && <span data-testid="credits-note"> · {creditCount} {creditCount === 1 ? 'credit' : 'credits'} hidden: credits and refunds are not part of a claim.</span>}
      </p>

      {message && <p role="status" className="mb-3 rounded-lg border border-breeze-deep bg-ground p-2 font-semibold text-breeze-deep" data-testid="add-result">✓ {message}</p>}

      {selectable.length > 0 && (
        <label className="mb-2 flex min-h-11 items-center gap-3 font-semibold">
          <input type="checkbox" className="h-5 w-5" checked={allShownTicked} onChange={toggleAll} />
          Select all {selectable.length} shown
        </label>
      )}

      {shown.length === 0 ? <p className={mutedText} data-testid="table-empty">No debits match. Widen the dates or clear the search.</p> : (
        <ul className="grid gap-2" data-testid="table-rows">
          {shown.map((r) => {
            const owner = owners.get(r.rowHash);
            const isOn = selected.has(r.rowHash);
            const suggestion = suggestCategory(r.narration, memory);
            return (
              <li key={r.rowHash} className={`rounded-xl border p-2 ${owner ? 'border-line bg-ground opacity-70' : isOn ? 'border-ink bg-surface' : 'border-line bg-surface'}`} data-testid="stmt-row">
                <label className={`flex min-h-11 items-start gap-3 ${owner ? '' : 'cursor-pointer'}`}>
                  <input type="checkbox" className="mt-2 h-5 w-5 shrink-0" checked={isOn} disabled={!!owner} onChange={() => toggle(r.rowHash)} aria-label={`Select ${r.narration}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold [overflow-wrap:anywhere]">{r.narration}</span>
                    {/* date and amount share the second line, so the description keeps the full width on a phone */}
                    <span className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-sm text-ink-soft">{formatDateLabel(r.date)}{r.refNo ? ` · ref ${r.refNo}` : ''}</span>
                      <span className="amount font-semibold">{formatInr(r.debitMinor)}</span>
                    </span>
                    {owner && <span className="block text-sm font-semibold text-breeze-deep" data-testid="row-owner">✓ {owner}</span>}
                  </span>
                </label>
                {isOn && (
                  <div className="mt-2 ml-8">
                    <select
                      aria-label={`Category for ${r.narration}`} className="ex-select block min-h-11 w-full rounded-lg border border-ink-soft bg-surface px-3 py-2"
                      value={categories[r.rowHash] ?? ''} onChange={(e) => setCategories({ ...categories, [r.rowHash]: e.target.value as CategoryId | '' })}
                    >
                      {categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {!categories[r.rowHash] && suggestion.categories.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-2" data-testid="row-suggestion">
                        {suggestion.categories.map((c) => (
                          <button key={c} type="button" className="min-h-11 rounded-full border-2 border-breeze-deep px-3 font-semibold text-breeze-deep" onClick={() => setCategories({ ...categories, [r.rowHash]: c })}>Suggested: {CATEGORY_LABELS[c]}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {chosen.length > 0 && (
        <div className="sticky bottom-0 mt-4 -mx-5 -mb-5 grid gap-2 rounded-b-xl border-t-2 border-ink bg-surface p-4" data-testid="selection-bar">
          <p className="amount font-semibold" data-testid="selection-summary">{chosen.length} selected · {formatInr(total)}</p>
          <select aria-label="Category for all selected rows" className="ex-select block min-h-11 w-full rounded-lg border border-ink-soft bg-surface px-3 py-2" value="" onChange={(e) => setAllCategories(e.target.value)}>
            <option value="">Set one category for all selected…</option>
            {CATEGORY_IDS.map((id) => <option key={id} value={id}>{CATEGORY_LABELS[id]}</option>)}
          </select>
          <button type="button" className={btnPrimary} disabled={adding} onClick={add}>Add {chosen.length} selected to this trip</button>
        </div>
      )}
    </section>
  );
}
