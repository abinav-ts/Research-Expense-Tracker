import { useEffect, useRef, useState, type ReactNode } from 'react';
import { suggestCategory } from '../../../shared/categoriser.ts';
import { COMMON_CURRENCIES, currencyExponent } from '../../../shared/currency.ts';
import { duplicateMessage, findDuplicates, type DuplicateMatch } from '../../../shared/duplicates.ts';
import { validateExpenseForm, type ExpenseFields, type ExpenseFormInput } from '../../../shared/expense-form.ts';
import { formatInr, fxToInrMinor, parseAmount } from '../../../shared/money.ts';
import { dateWindowFlag } from '../../../shared/rules/date-window.ts';
import type { FieldSuggestions, SuggestField, Suggestion } from '../../../shared/suggest.ts';
import { microToText, parseRateMicro } from '../../../shared/trip.ts';
import { CATEGORY_IDS, CATEGORY_LABELS, type CategoryId, type Expense } from '../../../shared/types.ts';
import { SelectField, TextAreaField, TextField } from '../../components/fields.tsx';
import { btn, btnPrimary } from '../../components/ui.ts';
import { todayLocal } from '../../lib/today.ts';

interface Props {
  /** The trip's default estimated rates (REQ-SET-06), prefilled for foreign currencies. */
  tripRates?: Record<string, number> | undefined;
  /** What the user chose for each payee before (REQ-CAP-14). */
  memory: Map<string, CategoryId>;
  /** The chosen trip's dates and the grant's buffer, for the date-window warning (REQ-RULE-02). */
  tripWindow?: { trip: { startDate: string; endDate: string }; bufferDays: number } | undefined;
  initial?: Partial<ExpenseFormInput>;
  submitLabel: string;
  onSubmit: (fields: ExpenseFields) => Promise<void>;
  /**
   * Suggested values read from a pasted message or a screenshot (REQ-CAP-15). The best one for each field is prefilled
   * once per `suggestionsKey` and marked "Check"; the others are offered as one-tap chips under the field.
   */
  suggestions?: FieldSuggestions | undefined;
  suggestionsKey?: string | undefined;
  /** Payee spellings saved before, offered while typing (REQ-CAP-17). */
  knownPayees?: string[] | undefined;
  /** The grant's saved expenses and this expense's proofs, for the duplicate warning (REQ-CAP-07). */
  existing?: Expense[] | undefined;
  proofHashes?: string[] | undefined;
  /** Set when editing a saved expense, so it is not compared with itself. */
  editingId?: string | undefined;
  /** What "Discard" does in the duplicate warning. Without it the button is "Keep editing". */
  onDiscard?: (() => void) | undefined;
  /** Rendered above the fields (e.g. the trip and proof-type pickers in the Inbox). */
  top?: ReactNode;
  /** Rendered next to the submit button. */
  actions?: ReactNode;
  /** "cash": this form only makes cash expenses, so there is no "Paid by" field (REQ-CAP-01). */
  fixedPaymentMode?: 'cash' | undefined;
  /** Rendered between the fields and the submit button (e.g. the receipt picker). */
  beforeSubmit?: ReactNode;
}

const blank = (): ExpenseFormInput => ({
  amountText: '', currency: 'INR', rateText: '', date: todayLocal(), payee: '', categoryId: '', paymentMode: 'bank', note: '', reference: '',
});

/** REQ-CAP-01 form, shared by manual add, expense detail and the Inbox confirm screen. */
export function ExpenseFormFields({ tripRates, tripWindow, suggestions, suggestionsKey, knownPayees, existing, proofHashes, editingId, onDiscard, memory, initial, submitLabel, onSubmit, top, actions, fixedPaymentMode, beforeSubmit }: Props) {
  const [form, setForm] = useState<ExpenseFormInput>({ ...blank(), ...initial, ...(fixedPaymentMode && { paymentMode: fixedPaymentMode }) });
  const [errors, setErrors] = useState<Partial<Record<keyof ExpenseFormInput, string>>>({});
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const categoryTouched = useRef(!!initial?.categoryId);
  const [checks, setChecks] = useState<ReadonlySet<keyof ExpenseFormInput>>(new Set());
  const touched = useRef(new Set<keyof ExpenseFormInput>());
  const set = <K extends keyof ExpenseFormInput>(key: K) => (value: ExpenseFormInput[K]) => {
    touched.current.add(key);
    setDuplicates([]);
    setChecks((c) => (c.has(key) ? new Set([...c].filter((k) => k !== key)) : c));
    setForm((f) => ({ ...f, [key]: value }));
  };
  const isInr = form.currency.trim().toUpperCase() === 'INR' || form.currency.trim() === '';

  // Prefill the trip's default rate when a foreign currency is chosen and no rate has been typed.
  useEffect(() => {
    const code = form.currency.trim().toUpperCase();
    const rate = tripRates?.[code];
    if (!isInr && rate && !form.rateText) setForm((f) => ({ ...f, rateText: microToText(rate) }));
  }, [form.currency, tripRates]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Puts a suggestion into the form. `byUser`: the user chose it, so no "Check" mark; otherwise it is a prefill to check. */
  const applySuggestion = (suggestion: Suggestion, byUser: boolean) => {
    const keys = Object.keys(suggestion.patch) as (keyof ExpenseFormInput)[];
    setForm((f) => ({ ...f, ...suggestion.patch }));
    setDuplicates([]);
    if (byUser) keys.forEach((k) => touched.current.add(k));
    setChecks((c) => new Set(byUser ? [...c].filter((k) => !keys.includes(k)) : [...c, ...keys]));
    setErrors({});
  };

  // Prefill the best suggestion for each field once per message/image, never over something the user already typed.
  const prefilledFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!suggestions || !suggestionsKey || prefilledFor.current === suggestionsKey) return;
    if (!Object.values(suggestions).some((list) => list.length > 0)) return;
    prefilledFor.current = suggestionsKey;
    for (const list of Object.values(suggestions)) {
      const best = list.find((s) => !s.guess); // a guessed reading is offered as a chip, never prefilled
      if (best && !(Object.keys(best.patch) as (keyof ExpenseFormInput)[]).some((k) => touched.current.has(k))) applySuggestion(best, false);
    }
  }, [suggestions, suggestionsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The other suggestions for a field, as one-tap chips (the one already in the field is not shown again). */
  const chips = (field: SuggestField) => {
    const visible = (suggestions?.[field] ?? []).filter((s) => !Object.entries(s.patch).every(([k, v]) => form[k as keyof ExpenseFormInput] === v));
    if (!visible.length) return null;
    return (
      <div className="-mt-2 mb-4 flex flex-wrap items-center gap-2" data-testid={`suggest-${field}`}>
        <span className="text-sm text-ink-soft">Or:</span>
        {visible.map((s) => (
          <button
            key={s.label + (s.hint ?? '')} type="button" onClick={() => applySuggestion(s, true)}
            className="min-h-11 max-w-full rounded-full border-2 border-breeze-deep bg-surface px-3 font-semibold break-words text-breeze-deep"
          >
            {s.label}
            {s.hint && <span className="ml-1 text-xs font-normal text-ink-soft">· {s.hint}</span>}
          </button>
        ))}
      </div>
    );
  };

  const suggestion = suggestCategory(form.payee, memory);
  // A remembered choice is pre-selected until the user picks something else; keyword guesses are never applied silently.
  useEffect(() => {
    if (categoryTouched.current) return;
    setForm((f) => ({ ...f, categoryId: suggestion.source === 'remembered' ? suggestion.categories[0] : '' }));
  }, [suggestion.source, suggestion.categories[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = todayLocal();
  const preview = validateExpenseForm(form, today);
  const futureDate = form.date > today;
  const windowFlag = tripWindow && /^\d{4}-\d{2}-\d{2}$/.test(form.date) ? dateWindowFlag({ id: 'form', date: form.date }, tripWindow.trip, tripWindow.bufferDays) : undefined;
  // Live estimate while typing: needs only a valid amount and rate, not the whole form.
  const exponent = currencyExponent(form.currency.trim() || 'INR');
  const typedAmount = parseAmount(form.amountText, exponent);
  const typedRate = parseRateMicro(form.rateText);
  const estimateMinor = typedAmount.ok && typedRate.ok ? fxToInrMinor(typedAmount.value, typedRate.value, exponent) : undefined;

  /** Saves, unless this looks like a duplicate the user has not yet said is fine (`force`: they did). */
  async function save(force: boolean) {
    if (!preview.ok) return setErrors(preview.errors);
    setErrors({});
    const matches = findDuplicates(
      {
        ...(editingId && { id: editingId }),
        payee: preview.value.payee, date: preview.value.date, originalMinor: preview.value.originalMinor,
        originalCurrency: preview.value.originalCurrency, ...(preview.value.reference && { reference: preview.value.reference }),
        proofHashes: proofHashes ?? [],
      },
      existing ?? [],
    );
    if (matches.length > 0 && !force) return setDuplicates(matches); // warn first; saving is still the user's call
    setSaving(true);
    try {
      await onSubmit(preview.value);
    } finally {
      setSaving(false);
    }
  }
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void save(false);
  };

  return (
    <form onSubmit={submit} noValidate>
      {top}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <TextField id="amountText" check={checks.has('amountText')} label={`Amount${isInr ? ' (₹)' : ''}`} value={form.amountText} onChange={set('amountText')} error={errors.amountText} inputMode="decimal" />
        <TextField id="currency" check={checks.has('currency')} label="Currency" value={form.currency} onChange={(v) => set('currency')(v.toUpperCase())} error={errors.currency} list="expense-currencies" maxLength={3} />
        <datalist id="expense-currencies">{COMMON_CURRENCIES.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      {chips('amount')}
      {!isInr && (
        <>
          <TextField id="rateText" label="Estimated rate (₹ per 1 unit)" value={form.rateText} onChange={set('rateText')} error={errors.rateText} inputMode="decimal" hint="An estimate: replaced by the real bank debit when you match your statement." />
          {estimateMinor !== undefined && <p className="amount mb-4 font-semibold" data-testid="inr-preview">Estimated {formatInr(estimateMinor)}</p>}
        </>
      )}
      <TextField id="date" check={checks.has('date')} label="Date" type="date" value={form.date} onChange={set('date')} error={errors.date} />
      {chips('date')}
      {windowFlag && <p role="status" className="-mt-2 mb-4 text-sm font-semibold text-state-low" data-testid="date-window-warning">⚠ {windowFlag.message} You can still save.</p>}
      {futureDate && <p role="status" className="-mt-2 mb-4 text-sm font-semibold text-state-low">⚠ This date is in the future. You can still save.</p>}
      <TextField id="payee" check={checks.has('payee')} label="Paid to (payee)" value={form.payee} onChange={set('payee')} error={errors.payee} maxLength={200} list="known-payees" />
      <datalist id="known-payees">{(knownPayees ?? []).map((name) => <option key={name} value={name} />)}</datalist>
      {chips('payee')}

      <SelectField
        id="categoryId" label="Category" error={errors.categoryId} value={form.categoryId}
        onChange={(v) => { categoryTouched.current = true; set('categoryId')(v); }}
        options={[{ value: '', label: 'Choose later' }, ...CATEGORY_IDS.map((id) => ({ value: id, label: CATEGORY_LABELS[id] }))]}
      />
      {suggestion.source === 'remembered' && !categoryTouched.current && <p className="-mt-2 mb-4 text-sm text-ink-soft" data-testid="category-remembered">Remembered for this payee.</p>}
      {suggestion.source === 'keyword' && (
        <div className="-mt-2 mb-4 flex flex-wrap items-center gap-2" data-testid="category-suggestions">
          <span className="text-sm text-ink-soft">Suggested:</span>
          {suggestion.categories.map((id) => (
            <button
              key={id} type="button" aria-pressed={form.categoryId === id}
              className={`min-h-11 rounded-full border-2 px-4 font-semibold ${form.categoryId === id ? 'border-breeze-deep bg-ink text-on-dark' : 'border-breeze-deep bg-surface text-breeze-deep'}`}
              onClick={() => { categoryTouched.current = true; set('categoryId')(id); }}
            >
              {CATEGORY_LABELS[id]}
            </button>
          ))}
        </div>
      )}

      {!fixedPaymentMode && (
        <SelectField id="paymentMode" label="Paid by" value={form.paymentMode} onChange={(v) => set('paymentMode')(v as 'bank' | 'cash')}
          options={[{ value: 'bank', label: 'Bank, UPI or card' }, { value: 'cash', label: 'Cash' }]} />
      )}
      <TextField id="reference" check={checks.has('reference')} label="Reference (UPI / transaction id, optional)" value={form.reference} onChange={set('reference')} />
      {chips('reference')}
      <TextAreaField id="note" label="Note (optional)" value={form.note} onChange={set('note')} rows={2} />

      {duplicates.length > 0 && (
        <div role="alert" className="mb-4 rounded-lg border-2 border-state-low bg-surface p-3" data-testid="duplicate-warning">
          <ul className="mb-3 grid gap-1 font-semibold text-state-low">
            {duplicates.map((m) => <li key={m.expense.id}>⚠ {duplicateMessage(m)}</li>)}
          </ul>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={btnPrimary} onClick={() => void save(true)} disabled={saving}>Save anyway</button>
            <button type="button" className={btn} onClick={() => (onDiscard ? onDiscard() : setDuplicates([]))}>{onDiscard ? 'Discard' : 'Keep editing'}</button>
          </div>
        </div>
      )}
      {beforeSubmit}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={btnPrimary} disabled={saving}>{submitLabel}</button>
        {actions}
      </div>
    </form>
  );
}

