import { useState } from 'react';
import { suggestCategory } from '../../../shared/categoriser.ts';
import { formatDateLabel } from '../../../shared/dates.ts';
import { formatInr } from '../../../shared/money.ts';
import type { StatementRow } from '../../../shared/statement-map.ts';
import type { PlanAdd } from '../../../shared/statement-plan.ts';
import { CATEGORY_IDS, CATEGORY_LABELS, type CategoryId } from '../../../shared/types.ts';
import { TextField } from '../../components/fields.tsx';
import { btn, card, h2, mutedText } from '../../components/ui.ts';

const categoryOptions = [{ value: '', label: 'Category: choose later' }, ...CATEGORY_IDS.map((id) => ({ value: id, label: CATEGORY_LABELS[id] }))];

/**
 * REQ-CSV-03, -04, -05, -12: the statement's debits, with search and a date range (the trip's dates by default). Ticking a row
 * drafts adding it to the trip (saved only by the final Confirm); each ticked row has its own category. A row already used by
 * an expense is shown but cannot be ticked; a row proposed for a tracked expense offers "Link" instead, so one payment is never
 * counted twice.
 */
export function TransactionTable({ debits, creditCount, range, owners, proposed, adds, memory, onToggle, onCategory, onLink, onDismiss }: {
  debits: StatementRow[];
  creditCount: number;
  /** The trip's dates widened by the grant's buffer: where the table starts. */
  range: { from: string; to: string };
  /** Rows already used (saved or drafted as a match), by fingerprint, with a label saying by what. */
  owners: ReadonlyMap<string, string>;
  /** Rows proposed for a tracked expense, by fingerprint. */
  proposed: ReadonlyMap<string, { expenseId: string; payee: string }>;
  /** Rows drafted for adding, by fingerprint. */
  adds: Readonly<Record<string, PlanAdd>>;
  memory: Map<string, CategoryId>;
  onToggle: (row: StatementRow, on: boolean) => void;
  onCategory: (rowHash: string, categoryId: CategoryId | '') => void;
  onLink: (expenseId: string, row: StatementRow) => void;
  onDismiss: (expenseId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  const q = query.trim().toLowerCase();
  const shown = debits.filter((r) => (!q || `${r.narration} ${r.refNo ?? ''}`.toLowerCase().includes(q)) && (!from || r.date >= from) && (!to || r.date <= to));
  const selectable = shown.filter((r) => !owners.has(r.rowHash) && !proposed.has(r.rowHash));
  const allShownTicked = selectable.length > 0 && selectable.every((r) => adds[r.rowHash]);
  const chosen = Object.values(adds);
  const total = chosen.reduce((sum, a) => sum + a.row.debitMinor, 0);

  return (
    <section className={`${card} mb-6`} aria-labelledby="table-heading" data-testid="transaction-table">
      <h2 id="table-heading" className={`${h2} mb-1`}>Other debits that belong to this trip</h2>
      <p className={`mb-3 ${mutedText}`}>Tick the ones to add. Rows you do not tick are never saved. Nothing is added until you press <strong>Confirm changes</strong> at the bottom.</p>

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
      {chosen.length > 0 && <p className="amount mb-3 font-semibold" data-testid="selection-summary">{chosen.length} chosen to add · {formatInr(total)}</p>}

      {selectable.length > 0 && (
        <label className="mb-2 flex min-h-11 items-center gap-3 font-semibold">
          <input type="checkbox" className="h-5 w-5" checked={allShownTicked} onChange={() => { for (const r of selectable) onToggle(r, !allShownTicked); }} />
          Select all {selectable.length} shown
        </label>
      )}

      {shown.length === 0 ? <p className={mutedText} data-testid="table-empty">No debits match. Widen the dates or clear the search.</p> : (
        <ul className="grid gap-2" data-testid="table-rows">
          {shown.map((r) => {
            const owner = owners.get(r.rowHash);
            const proposal = proposed.get(r.rowHash);
            const add = adds[r.rowHash];
            const isOn = !!add;
            const suggestion = suggestCategory(r.narration, memory);
            const blocked = !!owner || !!proposal;
            return (
              <li key={r.rowHash} className={`rounded-xl border p-2 ${owner ? 'border-line bg-ground opacity-70' : isOn ? 'border-ink bg-surface' : 'border-line bg-surface'}`} data-testid="stmt-row">
                <label className={`flex min-h-11 items-start gap-3 ${blocked ? '' : 'cursor-pointer'}`}>
                  <input type="checkbox" className="mt-2 h-5 w-5 shrink-0" checked={isOn} disabled={blocked} onChange={(e) => onToggle(r, e.target.checked)} aria-label={`Select ${r.narration}`} />
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
                {proposal && !owner && (
                  <div className="mt-2 ml-8 rounded-lg border border-line bg-ground p-2" data-testid="row-proposal">
                    <p className="text-sm font-semibold">Looks like your “{proposal.payee}” expense.</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button type="button" className={btn} onClick={() => onLink(proposal.expenseId, r)} aria-label={`Link ${r.narration} to ${proposal.payee}`}>Link</button>
                      <button type="button" className={btn} onClick={() => onDismiss(proposal.expenseId)}>Not this one</button>
                    </div>
                  </div>
                )}
                {isOn && (
                  <div className="mt-2 ml-8">
                    <select
                      aria-label={`Category for ${r.narration}`} className="ex-select block min-h-11 w-full rounded-lg border border-ink-soft bg-surface px-3 py-2"
                      value={add?.categoryId ?? ''} onChange={(e) => onCategory(r.rowHash, e.target.value as CategoryId | '')}
                    >
                      {categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {!add?.categoryId && suggestion.categories.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-2" data-testid="row-suggestion">
                        {suggestion.categories.map((c) => (
                          <button key={c} type="button" className="min-h-11 rounded-full border-2 border-breeze-deep px-3 font-semibold text-breeze-deep" onClick={() => onCategory(r.rowHash, c)}>Suggested: {CATEGORY_LABELS[c]}</button>
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
    </section>
  );
}
