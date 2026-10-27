import { useMemo, useRef, useState } from 'react';
import { BackLink } from '../../components/BackLink.tsx';
import { Link, useNavigate, useParams } from 'react-router';
import { canBeMatched, proposeMatches } from '../../../shared/reconcile.ts';
import { allowedWindow } from '../../../shared/rules/date-window.ts';
import { applyPlan, emptyPlan, isDraftId, type Plan } from '../../../shared/statement-plan.ts';
import type { CategoryId } from '../../../shared/types.ts';
import { applyMapping, guessMapping, profileKey, type DateFormat, type StatementMapping, type StatementRow } from '../../../shared/statement-map.ts';
import { parseStatementText, type RawStatement } from '../../../shared/statement-parse.ts';
import { decodeStatement } from '../../lib/decode.ts';
import { btn, btnPrimary, card, h1, h2, linkClass, mutedText } from '../../components/ui.ts';
import { repo } from '../../db/index.ts';
import { queries } from '../../db/queries.ts';
import { attempt } from '../../lib/errors.ts';
import { useLive } from '../../lib/useLive.ts';
import { MappingPanel } from './MappingPanel.tsx';
import { PlanBar } from './PlanBar.tsx';
import { ReconcilePanel } from './ReconcilePanel.tsx';
import { TransactionTable } from './TransactionTable.tsx';
import sampleCsv from '../../../../fixtures/sample-statement.csv?raw';

type Draft = Partial<StatementMapping> & { dateFormat: DateFormat };
const complete = (m: Draft): m is StatementMapping => m.date !== undefined && m.description !== undefined && (m.debit !== undefined || m.amount !== undefined);
/** A remembered mapping only counts if its columns exist in this file. */
const fits = (m: StatementMapping, width: number) => [m.date, m.description, m.reference, m.debit, m.credit, m.amount, m.drcr, m.balance].every((c) => c === undefined || c < width);

/** REQ-CSV-01..05, -08, -09: read a bank statement on this device, match it to tracked expenses, add other debits. */
export function StatementPage() {
  const { tripId = '' } = useParams();
  const data = useLive(async () => {
    const detail = await queries.tripDetail(tripId);
    return { detail, memory: await repo.payeeMemory() };
  }, [tripId]);
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  // REQ-CSV-12: every choice is a draft until the final Confirm.
  const [plan, setPlan] = useState<Plan>(emptyPlan);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<{ name: string; statement: RawStatement }>();
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<Draft>();
  const [confirmed, setConfirmed] = useState<StatementMapping>();
  const [showProblems, setShowProblems] = useState(false);
  // Hooks stay above every early return below: React needs the same hooks on every render.
  const applied = useMemo(() => (file && confirmed ? applyMapping(file.statement.rows, confirmed) : undefined), [file, confirmed]);

  if (!data) return <p role="status">Loading…</p>;
  if (!data.detail) return <p role="alert">That trip was not found. <Link to="/grants" className={linkClass}>Back to grants</Link></p>;
  const { trip, grant, expenses, grantExpenses } = data.detail;

  async function choose(chosen: File | undefined) {
    if (!chosen) return;
    setError(undefined);
    setPlan(emptyPlan()); // the draft belongs to the file it was made from
    setDismissed(new Set());
    setConfirmed(undefined);
    setShowProblems(false);
    const decoded = decodeStatement(await chosen.arrayBuffer(), chosen.name);
    const parsed = decoded.ok ? parseStatementText(decoded.text) : decoded;
    if (!parsed.ok) {
      setFile(undefined);
      setDraft(undefined);
      return setError(parsed.error);
    }
    const { statement } = parsed;
    setFile({ name: chosen.name, statement });
    const saved = await repo.getBankProfile(profileKey(statement.headers));
    if (saved && fits(saved, statement.headers.length)) {
      setDraft(saved);
      setConfirmed(saved); // the same bank as before: no questions
    } else {
      setDraft(guessMapping(statement.headers, statement.rows).mapping);
    }
  }

  // The trip as it will be once the draft is saved: everything below is worked out from this, so the order of work never matters.
  const afterGrant = applyPlan(grantExpenses, plan, trip.id);
  const afterTrip = afterGrant.filter((e) => e.tripId === trip.id);
  const taken = new Set(afterGrant.flatMap((e) => (e.statementRef ? [e.statementRef.rowHash] : [])));
  // A row ticked for adding is "chosen", not "used": it stays tickable so that unticking takes it back.
  const owners = new Map(afterGrant.flatMap((e) => (e.statementRef && !isDraftId(e.id) ? [[e.statementRef.rowHash, e.source === 'statement' ? 'Already added to your trip' : `Paired with ${e.payee}`] as const] : [])));
  const dates = allowedWindow(trip, grant.rules.travelBufferDays);
  const found = applied ? proposeMatches(afterTrip, applied.debits, taken) : { automatic: [], foreign: [], unpaired: [] };
  const matches = { ...found, automatic: found.automatic.filter((p) => !dismissed.has(p.expenseId)) };
  const proposed = new Map(matches.automatic.map((p) => [p.row.rowHash, { expenseId: p.expenseId, payee: afterTrip.find((e) => e.id === p.expenseId)?.payee ?? '' }] as const));
  const unmatched = afterTrip.filter(canBeMatched).length;

  const match = (pairs: { expenseId: string; row: StatementRow }[]) => setPlan((p) => ({ ...p, links: { ...p.links, ...Object.fromEntries(pairs.map((x) => [x.expenseId, x.row])) } }));
  const takeBack = (expenseId: string) => setPlan((p) => {
    if (p.links[expenseId]) {
      const { [expenseId]: _gone, ...links } = p.links;
      return { ...p, links };
    }
    return p.unlinks.includes(expenseId) ? p : { ...p, unlinks: [...p.unlinks, expenseId] }; // a saved match: drafted for removal
  });
  const removeAdded = (expenseId: string) => setPlan((p) => {
    if (isDraftId(expenseId)) {
      const { [expenseId.slice('draft:'.length)]: _gone, ...adds } = p.adds;
      return { ...p, adds };
    }
    return p.removes.includes(expenseId) ? p : { ...p, removes: [...p.removes, expenseId] };
  });
  const toggleRow = (row: StatementRow, on: boolean) => setPlan((p) => {
    const { [row.rowHash]: existing, ...rest } = p.adds;
    return { ...p, adds: on ? { ...rest, [row.rowHash]: existing ?? { row } } : rest };
  });
  const setCategory = (rowHash: string, categoryId: CategoryId | '') => setPlan((p) => {
    const add = p.adds[rowHash];
    if (!add) return p;
    const { categoryId: _old, ...rest } = add;
    return { ...p, adds: { ...p.adds, [rowHash]: categoryId ? { ...rest, categoryId } : rest } };
  });
  async function confirmPlan() {
    setSaving(true);
    try {
      if (await attempt(() => repo.applyStatementPlan(trip.id, plan))) navigate(`/trips/${trip.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <BackLink to={`/trips/${trip.id}`} label={trip.name} />
      <h1 className={`${h1} mb-4`}>Bank statement</h1>

      <section className={`${card} mb-6`} aria-labelledby="stmt-file-heading">
        <h2 id="stmt-file-heading" className={`${h2} mb-1`}>1. Choose your statement</h2>
        <p className={`mb-3 ${mutedText}`}>
          Use the CSV file from your bank's website or app. It is read on this device and never uploaded. Only the lines you tick
          or match are kept; the rest of the statement, including its balances, is forgotten when you leave this page.
        </p>
        <input ref={input} type="file" hidden accept=".csv,.txt,text/csv,text/plain" aria-label="Choose statement file" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="flex flex-wrap gap-3">
          <button type="button" className={btnPrimary} onClick={() => input.current?.click()}>{file ? 'Choose another file' : 'Choose statement file'}</button>
          <button
            type="button" className={btn} data-testid="sample-download"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([sampleCsv], { type: 'text/csv' }));
              Object.assign(document.createElement('a'), { href: url, download: 'sample-statement.csv' }).click();
              window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Download a sample statement
          </button>
        </div>
        {error && <p role="alert" className="mt-3 font-semibold text-state-over" data-testid="statement-error">⚠ {error}</p>}
        {file && !error && (
          <p className="mt-3 text-sm" role="status" data-testid="file-summary">
            Read <strong>{file.name}</strong>: {file.statement.rows.length} lines{file.statement.headerless ? ' (this file has no column names, so please check the columns below)' : ' under the column names'}.
            {applied && ` ${applied.debits.length} debits, ${applied.creditCount} ${applied.creditCount === 1 ? 'credit' : 'credits'}.`}
            {applied && applied.problems.length > 0 && (
              <> <button type="button" className={linkClass} onClick={() => setShowProblems(!showProblems)} data-testid="problems-toggle">{applied.problems.length} {applied.problems.length === 1 ? 'line' : 'lines'} could not be read</button></>
            )}
          </p>
        )}
        {applied && showProblems && (
          <ul className="mt-2 grid gap-1 text-sm" data-testid="problems-list">
            {applied.problems.map((p) => <li key={p.line} className="rounded border border-line bg-ground p-1">Line {p.line}: {p.reason}</li>)}
          </ul>
        )}
      </section>

      {file && draft && (!confirmed || !complete(draft)) && (
        <MappingPanel
          headers={file.statement.headers} rows={file.statement.rows} mapping={draft} onChange={setDraft}
          onConfirm={async () => {
            if (!complete(draft)) return;
            await attempt(() => repo.saveBankProfile(profileKey(file.statement.headers), draft));
            setConfirmed(draft);
          }}
        />
      )}
      {file && confirmed && (
        <p className="mb-4 text-sm"><button type="button" className={linkClass} onClick={() => setConfirmed(undefined)} data-testid="change-mapping">Change the columns</button></p>
      )}

      {applied && (
        <>
          <ReconcilePanel
            expenses={afterTrip} debits={applied.debits} taken={taken} matches={matches} plan={plan}
            onMatch={(expenseId, row) => match([{ expenseId, row }])} onMatchMany={match}
            onDismiss={(expenseId) => setDismissed(new Set([...dismissed, expenseId]))}
            onTakeBack={takeBack} onRemoveAdded={removeAdded}
          />
          <TransactionTable
            debits={applied.debits} creditCount={applied.creditCount} range={{ from: dates.start, to: dates.end }} owners={owners} proposed={proposed}
            adds={plan.adds} memory={data.memory} onToggle={toggleRow} onCategory={setCategory}
            onLink={(expenseId, row) => match([{ expenseId, row }])} onDismiss={(expenseId) => setDismissed(new Set([...dismissed, expenseId]))}
          />
          <PlanBar plan={plan} unmatched={unmatched} saving={saving} onConfirm={() => void confirmPlan()} />
        </>
      )}
    </div>
  );
}
