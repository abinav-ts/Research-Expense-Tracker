import { useState } from 'react';
import { currencyExponent } from '../../../shared/currency.ts';
import { formatDateLabel } from '../../../shared/dates.ts';
import { formatInr, formatMinor } from '../../../shared/money.ts';
import { canBeMatched, type Matches } from '../../../shared/reconcile.ts';
import { isDraftId, type Plan } from '../../../shared/statement-plan.ts';
import type { StatementRow } from '../../../shared/statement-map.ts';
import type { Expense } from '../../../shared/types.ts';
import { btn, btnPrimary, card, cross, h2, mutedText } from '../../components/ui.ts';

const expenseAmount = (e: Expense) => (e.originalCurrency === 'INR' ? formatInr(e.inrMinor) : `${formatMinor(e.originalMinor, e.originalCurrency, currencyExponent(e.originalCurrency))} (estimated ${formatInr(e.inrMinor)})`);

function Side({ title, name, date, amount }: { title: string; name: string; date: string; amount: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-line bg-ground p-2">
      <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">{title}</p>
      <p className="font-semibold [overflow-wrap:anywhere]">{name}</p>
      <p className="amount text-sm">{formatDateLabel(date)} · {amount}</p>
    </div>
  );
}

/**
 * REQ-CSV-08, REQ-CSV-12: match tracked expenses to statement debits. `expenses` are the trip's expenses as they will be once
 * the draft is saved, so every list always agrees with the choices made so far, in whatever order. Choosing only changes the
 * draft; the ✕ on a chosen item takes it back. Automatic proposals are for INR expenses (same amount, within 2 days); foreign
 * ones list candidates to choose from; anything else can be linked by hand. The statement amount always wins.
 */
export function ReconcilePanel({ expenses, debits, taken, matches, plan, onMatch, onMatchMany, onDismiss, onTakeBack, onRemoveAdded }: {
  expenses: Expense[];
  debits: StatementRow[];
  /** Rows used by an expense (saved or drafted). */
  taken: ReadonlySet<string>;
  /** Proposals for the trip's still-open expenses, with the ones the user said "not this one" to already left out. */
  matches: Matches;
  plan: Plan;
  onMatch: (expenseId: string, row: StatementRow) => void;
  onMatchMany: (pairs: { expenseId: string; row: StatementRow }[]) => void;
  onDismiss: (expenseId: string) => void;
  onTakeBack: (expenseId: string) => void;
  onRemoveAdded: (expenseId: string) => void;
}) {
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<Record<string, string>>({});
  const pending = expenses.filter(canBeMatched);
  const automatic = matches.automatic;
  const byId = new Map(expenses.map((e) => [e.id, e]));
  const matched = expenses.filter((e) => e.statementRef && !e.excluded && e.source !== 'statement');
  const added = expenses.filter((e) => e.source === 'statement' && !e.excluded);
  const free = debits.filter((r) => !taken.has(r.rowHash));
  const handled = new Set([...automatic.map((p) => p.expenseId), ...matches.foreign.map((f) => f.expenseId)]);
  // Everything still waiting that has no proposal on screen, including proposals the user said no to.
  const byHand = pending.filter((e) => !handled.has(e.id));
  const nothingToDo = automatic.length === 0 && matches.foreign.length === 0 && byHand.length === 0;
  const unsaved = (e: Expense) => (plan.links[e.id] !== undefined) || isDraftId(e.id);

  return (
    <section className={`${card} mb-6`} aria-labelledby="reconcile-heading" data-testid="reconcile-panel">
      <h2 id="reconcile-heading" className={`${h2} mb-1`}>Match your expenses to the statement</h2>
      <p className={`mb-4 ${mutedText}`}>The bank's amount is the one the grant authority accepts. When an expense is matched, it takes the bank's amount and counts as verified.</p>

      {pending.length === 0 && matched.length === 0 && <p className={mutedText} data-testid="reconcile-none">You have no tracked expenses on this trip to match. You can still tick statement rows below.</p>}

      {automatic.length > 0 && (
        <div className="mb-5" data-testid="reconcile-auto">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h3 className="font-semibold">Proposed matches ({automatic.length})</h3>
            {automatic.length > 1 && <button type="button" className={btnPrimary} onClick={() => onMatchMany(automatic.map((p) => ({ expenseId: p.expenseId, row: p.row })))}>Match all {automatic.length}</button>}
          </div>
          <ul className="grid gap-3">
            {automatic.map((p) => {
              const e = byId.get(p.expenseId)!;
              return (
                <li key={p.expenseId} className="rounded-xl border border-line p-3" data-testid="proposal">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Side title="Your expense" name={e.payee} date={e.date} amount={expenseAmount(e)} />
                    <Side title="Bank statement" name={p.row.narration} date={p.row.date} amount={formatInr(p.row.debitMinor)} />
                  </div>
                  <p className="my-2 text-sm text-ink-soft">{p.reason}</p>
                  <div className="flex gap-3">
                    <button type="button" className={btnPrimary} onClick={() => onMatch(e.id, p.row)} aria-label={`Match ${e.payee} with ${p.row.narration}`}>Match</button>
                    <button type="button" className={btn} onClick={() => onDismiss(e.id)}>Not this one</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {matches.foreign.length > 0 && (
        <div className="mb-5" data-testid="reconcile-foreign">
          <h3 className="mb-2 font-semibold">Foreign spending: choose the bank debit ({matches.foreign.length})</h3>
          <ul className="grid gap-3">
            {matches.foreign.map((f) => {
              const e = byId.get(f.expenseId)!;
              const pick = chosen[e.id];
              return (
                <li key={e.id} className="rounded-xl border border-line p-3" data-testid="foreign-choice">
                  <p className="mb-2 font-semibold [overflow-wrap:anywhere]">{e.payee} · {formatDateLabel(e.date)} · {expenseAmount(e)}</p>
                  <fieldset className="grid gap-2">
                    <legend className="sr-only">Debits that could be {e.payee}</legend>
                    {f.candidates.map((c) => (
                      <label key={c.row.rowHash} className="flex min-h-11 items-start gap-3 rounded-lg border border-line p-2">
                        <input type="radio" name={`pick-${e.id}`} className="mt-1 h-5 w-5" checked={pick === c.row.rowHash} onChange={() => setChosen({ ...chosen, [e.id]: c.row.rowHash })} />
                        <span className="min-w-0">
                          <span className="block font-semibold [overflow-wrap:anywhere]">{c.row.narration}</span>
                          <span className="amount block text-sm">{formatDateLabel(c.row.date)} · {formatInr(c.row.debitMinor)}</span>
                          <span className="block text-sm text-ink-soft">{c.reason}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <button type="button" className={`${btnPrimary} mt-2`} disabled={!pick} onClick={() => onMatch(e.id, f.candidates.find((c) => c.row.rowHash === pick)!.row)}>Use this debit</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {byHand.length > 0 && (
        <div className="mb-5" data-testid="reconcile-manual">
          <h3 className="mb-1 font-semibold">No debit found for ({byHand.length})</h3>
          <p className={`mb-2 text-sm ${mutedText}`}>Nothing matched these automatically. If you know which debit is which, link it by hand: the bank's amount will be used.</p>
          <ul className="grid gap-3">
            {byHand.map((e) => {
              const row = free.find((r) => r.rowHash === manual[e.id]);
              return (
                <li key={e.id} className="rounded-xl border border-line p-3" data-testid="unpaired-expense">
                  <p className="mb-2 font-semibold [overflow-wrap:anywhere]">{e.payee} · {formatDateLabel(e.date)} · {expenseAmount(e)}</p>
                  <label className="mb-1 block text-sm font-semibold" htmlFor={`manual-${e.id}`}>Link to a bank debit</label>
                  <select id={`manual-${e.id}`} className="ex-select block min-h-11 w-full rounded-lg border border-ink-soft bg-surface px-3 py-2" value={manual[e.id] ?? ''} onChange={(ev) => setManual({ ...manual, [e.id]: ev.target.value })}>
                    <option value="">Choose a debit…</option>
                    {free.map((r) => <option key={r.rowHash} value={r.rowHash}>{formatDateLabel(r.date)} · {formatInr(r.debitMinor)} · {r.narration.slice(0, 40)}</option>)}
                  </select>
                  {row && row.debitMinor !== e.inrMinor && <p role="status" className="mt-2 text-sm font-semibold text-state-low">The bank's {formatInr(row.debitMinor)} will be used instead of {formatInr(e.inrMinor)}.</p>}
                  <button type="button" className={`${btn} mt-2`} disabled={!row} onClick={() => row && onMatch(e.id, row)}>Link</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {nothingToDo && pending.length > 0 && <p className={mutedText}>Every tracked expense has been looked at.</p>}

      {matched.length > 0 && (
        <div className="mb-5" data-testid="reconcile-matched">
          <h3 className="mb-2 font-semibold">Matched ({matched.length})</h3>
          <ul className="grid gap-2">
            {matched.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-breeze-deep/60 bg-ground p-2" data-testid="matched-pair">
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <span className="block font-semibold">✓ {e.payee}{unsaved(e) && <span className="ml-2 text-sm font-normal text-ink-soft" data-testid="unsaved-tag">not saved yet</span>}</span>
                  <span className="amount block text-sm text-ink-soft">{formatDateLabel(e.statementRef!.date)} · {formatInr(e.inrMinor)} · {e.statementRef!.narration.slice(0, 50)}</span>
                </span>
                <button type="button" className={cross} onClick={() => onTakeBack(e.id)} aria-label={`Take back the match for ${e.payee}`}><span aria-hidden="true">✕</span></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {added.length > 0 && (
        <div data-testid="reconcile-added">
          <h3 className="mb-2 font-semibold">Added from the statement ({added.length})</h3>
          <ul className="grid gap-2">
            {added.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-ground p-2" data-testid="added-row">
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <span className="block font-semibold">{e.payee}{unsaved(e) && <span className="ml-2 text-sm font-normal text-ink-soft" data-testid="unsaved-tag">not saved yet</span>}</span>
                  <span className="amount block text-sm text-ink-soft">{formatDateLabel(e.statementRef!.date)} · {formatInr(e.inrMinor)}</span>
                </span>
                <button type="button" className={cross} onClick={() => onRemoveAdded(e.id)} aria-label={`Remove ${e.payee} from this trip`}><span aria-hidden="true">✕</span></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
