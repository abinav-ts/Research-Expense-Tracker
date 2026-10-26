import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { allowedWindow } from '../../../shared/rules/date-window.ts';
import { applyMapping, guessMapping, profileKey, type DateFormat, type StatementMapping } from '../../../shared/statement-map.ts';
import { parseStatementText, type RawStatement } from '../../../shared/statement-parse.ts';
import { btn, btnPrimary, card, h1, h2, mutedText } from '../../components/ui.ts';
import { repo } from '../../db/index.ts';
import { queries } from '../../db/queries.ts';
import { attempt, clearError, reportError } from '../../lib/errors.ts';
import { useLive } from '../../lib/useLive.ts';
import { MappingPanel } from './MappingPanel.tsx';
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
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; statement: RawStatement }>();
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<Draft>();
  const [confirmed, setConfirmed] = useState<StatementMapping>();
  const [showProblems, setShowProblems] = useState(false);

  if (!data) return <p role="status">Loading…</p>;
  if (!data.detail) return <p role="alert">That trip was not found. <Link to="/grants" className="underline">Back to grants</Link></p>;
  const { trip, grant, expenses, grantExpenses } = data.detail;

  async function choose(chosen: File | undefined) {
    if (!chosen) return;
    setError(undefined);
    setConfirmed(undefined);
    setShowProblems(false);
    const parsed = parseStatementText(await chosen.text());
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

  const applied = file && confirmed ? applyMapping(file.statement.rows, confirmed) : undefined;
  const taken = new Set(grantExpenses.flatMap((e) => (e.statementRef ? [e.statementRef.rowHash] : [])));
  const owners = new Map(grantExpenses.flatMap((e) => (e.statementRef ? [[e.statementRef.rowHash, e.source === 'statement' ? 'Already added to your trip' : `Paired with ${e.payee}`] as const] : [])));
  const dates = allowedWindow(trip, grant.rules.travelBufferDays);

  return (
    <div>
      <p className="text-sm"><Link to={`/trips/${trip.id}`} className="underline">{trip.name}</Link></p>
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
            Read <strong>{file.name}</strong>: {file.statement.rows.length} lines under the column names.
            {applied && ` ${applied.debits.length} debits, ${applied.creditCount} ${applied.creditCount === 1 ? 'credit' : 'credits'}.`}
            {applied && applied.problems.length > 0 && (
              <> <button type="button" className="font-semibold text-breeze-deep underline" onClick={() => setShowProblems(!showProblems)} data-testid="problems-toggle">{applied.problems.length} {applied.problems.length === 1 ? 'line' : 'lines'} could not be read</button></>
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
        <p className="mb-4 text-sm"><button type="button" className="font-semibold text-breeze-deep underline" onClick={() => setConfirmed(undefined)} data-testid="change-mapping">Change the columns</button></p>
      )}

      {applied && (
        <>
          <ReconcilePanel
            expenses={expenses} debits={applied.debits} taken={taken}
            onConfirm={async (expenseId, row) => void (await attempt(() => repo.confirmStatementPair(expenseId, row)))}
            onUnlink={async (expenseId) => void (await attempt(() => repo.unlinkStatementPair(expenseId)))}
          />
          <TransactionTable
            debits={applied.debits} creditCount={applied.creditCount} range={{ from: dates.start, to: dates.end }} owners={owners} memory={data.memory}
            onAdd={async (items) => {
              try {
                const result = await repo.addStatementExpenses(trip.id, items);
                clearError();
                return result;
              } catch (error) {
                reportError(error);
                return { added: 0, skipped: 0 };
              }
            }}
          />
        </>
      )}
    </div>
  );
}
