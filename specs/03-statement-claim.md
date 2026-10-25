# 03 — Statement Claim (Segment B): reconcile + one-shot

Status: **DRAFT** (acceptance criteria to be completed in chat before M2)
Covers: CSV import, reconciliation with tracked expenses, and selection producing a ClaimDraft. The claimed amount is always the statement INR debit (REQ-CLM-08). Parent: `../SPEC.md`.

## Requirements

### REQ-CSV-01 — Parse CSV in the browser [MUST] [draft]
The file is read and parsed locally; it is never uploaded (REQ-PRIV-01/02).
### REQ-CSV-02 — Column mapping [MUST] [draft]
The user maps date, description, debit/credit (or one signed amount) and reference columns, and picks the date format. The mapping can be remembered locally per "bank profile".
### REQ-CSV-03 — Transaction table [MUST] [draft]
Shows debits with search, date-range filter defaulting to trip window ± buffer, per-row checkbox, select-all-filtered.
### REQ-CSV-04 — Assign category (bulk) [MUST] [draft]
### REQ-CSV-05 — Rows become a ClaimDraft [MUST] [draft]
Selected rows and reconciled tracked expenses form one ClaimDraft and feed the rule engine, preview, PDF and submission. Each item carries its statement line (REQ-CLM-08).
### REQ-CSV-06 — Edit / redact description [SHOULD] [draft]
### REQ-CSV-07 — Attach receipt per row [SHOULD] [draft]
### REQ-CSV-08 — Reconcile tracked expenses with statement rows [MUST] [draft]
The system shall match the trip's tracked expenses to statement debit rows, show proposed pairs for confirmation, and on confirmation set `statementRef`, replace `inrMinor` with the debit amount and set `inrStatus = 'confirmed'`. Unmatched tracked expenses and unmatched statement rows both stay visible.
Matching:
- INR expense: same amount and statement date within ±2 days of the expense date → proposed automatically.
- Foreign-currency expense: candidates are debits within ±15% of the estimated INR amount and within ±5 days of the expense date, sorted by closeness; never auto-confirmed, the user picks the pair.
- A statement row confirms at most one expense and vice versa; the user can unlink a pair.
- Cash expenses (`paymentMode = 'cash'`) are skipped.
Acceptance:
- Given an INR expense ₹1,200.00 on 2026-11-11 and statement debits of ₹1,200.00 on 2026-11-12 and on 2026-11-20, Then only the 11-12 row is proposed.
- Given a €89.00 expense estimated at ₹8,455.00 and a debit of ₹8,612.34 inside the window, Then it is offered as a candidate; after the user confirms, the expense shows ₹8,612.34, status confirmed, and the balance changes per REQ-BAL-06.
- Given two expenses with the same amount and date and one matching row, Then only one pair can be confirmed.
Notes: fallback if this slips is the statement-only path (tick rows, attach proof), but then foreign expenses tracked live cannot be claimed.
Tests: tests/unit/reconcile.test.ts
### REQ-CSV-09 — Tolerate real-world CSVs [MUST] [draft]
Handles preamble lines before the header, comma or semicolon delimiters, quoted fields, thousands separators, blank/malformed lines (reported, not fatal).
### REQ-CSV-10 — Bundled synthetic sample CSV [MUST] [draft]
`fixtures/sample-statement.csv` (synthetic: preamble block, domestic debits, one foreign-currency card debit whose INR amount differs from the demo estimate, unrelated personal rows), downloadable in-app (REQ-DEMO-04).

## Open questions
- Which banks' CSV layouts must work? (Default: generic mapper, tested on 2–3 synthetic layouts.)
- Are credits/refunds ever claimed as negatives? (Default: not in v1.)
- Do statement narrations for foreign card spends show the original-currency amount? (Default: do not rely on it.)
