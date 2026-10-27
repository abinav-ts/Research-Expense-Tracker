// Shared class strings. Colours come from the brand theme only (REQ-BRAND-03).
const base = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold disabled:opacity-60';
export const btn = `${base} border border-ink-soft bg-surface text-ink hover:border-breeze-deep`;
export const btnPrimary = `${base} bg-ink text-on-dark hover:bg-ink-soft`;
export const btnDanger = `${base} border border-state-over bg-surface text-state-over`;
// REQ-NFR-10: a clickable phrase is a box, not underlined text.
export const linkClass = 'inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 py-1 font-semibold text-breeze-deep hover:border-breeze-deep';
export const card = 'rounded-xl border border-line bg-surface p-5';
export const h1 = 'font-display text-[28px] leading-[34px] font-bold';
export const h2 = 'font-display text-xl leading-[26px] font-semibold';
export const mutedText = 'text-ink-soft';
export const chip = 'inline-flex items-center rounded-full border border-ink-soft px-2 py-0.5 text-sm text-ink-soft';
// REQ-CSV-12: the small ✕ that takes a drafted choice back (at least 44 px square).
export const cross = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-ink-soft bg-surface text-lg font-semibold text-ink hover:border-state-over hover:text-state-over';
