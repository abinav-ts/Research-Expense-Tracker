import type { ReactNode } from 'react';

interface BaseProps {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  /** Prefilled by recognition and not yet edited by the user (REQ-CAP-05). */
  check?: boolean | undefined;
}
const control = 'block min-h-11 w-full rounded-lg border border-ink-soft bg-surface px-3 py-2 text-ink';

function Wrap({ id, label, error, hint, check, children }: BaseProps & { children: ReactNode }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">
        {label}
        {check && <span className="ml-2 rounded border border-state-low px-1 text-xs font-semibold text-state-low" data-testid={`check-${id}`}>Check</span>}
      </label>
      {children}
      {hint && <p id={`${id}-hint`} className="mt-1 text-sm text-ink-soft">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-sm font-semibold text-state-over">⚠ {error}</p>}
    </div>
  );
}
const describedBy = (id: string, error?: string, hint?: string) => [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;

interface TextFieldProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'date' | 'email';
  inputMode?: 'decimal' | 'text';
  placeholder?: string;
  list?: string;
  maxLength?: number;
  autoComplete?: string;
}
export function TextField({ id, label, error, hint, check, value, onChange, type = 'text', inputMode, placeholder, list, maxLength, autoComplete = 'off' }: TextFieldProps) {
  return (
    <Wrap id={id} label={label} error={error} hint={hint} check={check}>
      <input
        id={id} name={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} className={control}
        inputMode={inputMode} placeholder={placeholder} list={list} maxLength={maxLength} autoComplete={autoComplete}
        aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)}
      />
    </Wrap>
  );
}

interface SelectFieldProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}
export function SelectField({ id, label, error, hint, value, onChange, options }: SelectFieldProps) {
  return (
    <Wrap id={id} label={label} error={error} hint={hint}>
      <select id={id} name={id} value={value} onChange={(e) => onChange(e.target.value)} className={control} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Wrap>
  );
}

export function TextAreaField({ id, label, error, hint, value, onChange, rows = 3 }: BaseProps & { value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <Wrap id={id} label={label} error={error} hint={hint}>
      <textarea id={id} name={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className={control} aria-describedby={describedBy(id, error, hint)} />
    </Wrap>
  );
}
