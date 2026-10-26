import { useState } from 'react';
import { DATE_FORMAT_LABELS, applyMapping, missingParts, type DateFormat, type StatementMapping } from '../../../shared/statement-map.ts';
import type { RawRow } from '../../../shared/statement-parse.ts';
import { formatDateLabel } from '../../../shared/dates.ts';
import { formatInr } from '../../../shared/money.ts';
import { SelectField } from '../../components/fields.tsx';
import { btnPrimary, card, h2, mutedText } from '../../components/ui.ts';

type AmountStyle = 'columns' | 'signed' | 'drcr';
const styleOf = (m: Partial<StatementMapping>): AmountStyle => (m.debit !== undefined ? 'columns' : m.amount !== undefined && m.drcr !== undefined ? 'drcr' : m.amount !== undefined ? 'signed' : 'columns');
const none = { value: '', label: '(none)' };

/** REQ-CSV-02: check the columns ExpRes guessed (or the ones remembered for this bank). */
export function MappingPanel({ headers, rows, mapping, onChange, onConfirm }: {
  headers: string[];
  rows: RawRow[];
  mapping: Partial<StatementMapping> & { dateFormat: DateFormat };
  onChange: (m: Partial<StatementMapping> & { dateFormat: DateFormat }) => void;
  onConfirm: () => void;
}) {
  const columns = [none, ...headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))];
  const pick = (value: number | undefined) => (value === undefined ? '' : String(value));
  const set = (key: keyof StatementMapping) => (v: string) => {
    const next = { ...mapping } as Record<string, unknown>;
    if (v === '') delete next[key];
    else next[key] = Number(v);
    onChange(next as typeof mapping);
  };
  const [style, setStyle] = useState<AmountStyle>(styleOf(mapping));
  // Changing how amounts are shown clears the columns that belonged to the old style.
  const changeStyle = (next: string) => {
    const { debit: _d, credit: _c, amount: _a, drcr: _r, ...rest } = mapping;
    setStyle(next as AmountStyle);
    onChange(rest as typeof mapping);
  };
  const missing = missingParts(mapping);
  const preview = missing.length === 0 ? applyMapping(rows.slice(0, 40), mapping as StatementMapping).debits.slice(0, 3) : [];
  const unreadDates = missing.length === 0 && rows.length > 0 && preview.length === 0;

  return (
    <section className={`${card} mb-6`} aria-labelledby="mapping-heading" data-testid="mapping-panel">
      <h2 id="mapping-heading" className={`${h2} mb-1`}>Check the columns</h2>
      <p className={`mb-4 ${mutedText}`}>ExpRes guessed which column is which. Change anything that is wrong; the choice is remembered for this bank.</p>
      <SelectField id="map-date" label="Date" value={pick(mapping.date)} onChange={set('date')} options={columns} />
      <SelectField id="map-format" label="How dates are written" value={mapping.dateFormat} onChange={(v) => onChange({ ...mapping, dateFormat: v as DateFormat })}
        options={(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map((f) => ({ value: f, label: DATE_FORMAT_LABELS[f] }))} />
      <SelectField id="map-description" label="Description (narration)" value={pick(mapping.description)} onChange={set('description')} options={columns} />
      <SelectField id="map-reference" label="Reference (optional)" value={pick(mapping.reference)} onChange={set('reference')} options={columns} />
      <SelectField
        id="map-style" label="How amounts are shown" value={style} onChange={changeStyle}
        options={[{ value: 'columns', label: 'Separate columns for money out and money in' }, { value: 'signed', label: 'One amount column (a minus sign means money out)' }, { value: 'drcr', label: 'One amount column plus a Dr/Cr column' }]}
      />
      {style === 'columns' && (
        <>
          <SelectField id="map-debit" label="Money out (debit / withdrawal)" value={pick(mapping.debit)} onChange={set('debit')} options={columns} />
          <SelectField id="map-credit" label="Money in (credit / deposit, optional)" value={pick(mapping.credit)} onChange={set('credit')} options={columns} />
        </>
      )}
      {style !== 'columns' && <SelectField id="map-amount" label="Amount" value={pick(mapping.amount)} onChange={set('amount')} options={columns} />}
      {style === 'drcr' && <SelectField id="map-drcr" label="Dr/Cr" value={pick(mapping.drcr)} onChange={set('drcr')} options={columns} />}
      <SelectField id="map-balance" label="Balance (optional)" hint="Marked so it is never mistaken for an amount. It is never read, saved or sent." value={pick(mapping.balance)} onChange={set('balance')} options={columns} />

      {missing.length > 0 && <p role="alert" className="mb-3 font-semibold text-state-over" data-testid="mapping-missing">⚠ Still needed: {missing.join('; ')}.</p>}
      {unreadDates && <p role="alert" className="mb-3 font-semibold text-state-over">⚠ No row could be read with these choices. Check the date column and how dates are written.</p>}
      {preview.length > 0 && (
        <div className="mb-4" data-testid="mapping-preview">
          <p className="mb-1 text-sm font-semibold">First rows as they will be read</p>
          <ul className="grid gap-1 text-sm">
            {preview.map((r) => <li key={r.rowHash} className="rounded border border-line bg-ground p-2 [overflow-wrap:anywhere]">{formatDateLabel(r.date)} · {r.narration} · <span className="amount font-semibold">{formatInr(r.debitMinor)}</span></li>)}
          </ul>
        </div>
      )}
      <button type="button" className={btnPrimary} disabled={missing.length > 0 || preview.length === 0} onClick={onConfirm}>Use these columns</button>
    </section>
  );
}

