# 04 — Rules Engine

Status: **DRAFT** (one worked example below; remaining criteria to be completed in chat before M2)
Covers: flags on claim items. Parent: `../SPEC.md`.

## Design
`evaluate(draft: ClaimDraft, context): Flag[]` is a pure function in `src/shared/rules`. It runs on the client (live feedback) and on the server (re-checked at submit). Rules read thresholds from `grant.rules`.

## Requirements

### REQ-RULE-01 — Pure deterministic evaluate() [MUST] [draft]
Same input always gives same output; no I/O, clocks or randomness.
### REQ-RULE-02 — DATE_OUT_OF_WINDOW [MUST] [draft]
The system shall flag (warn) any item dated before `trip.startDate − travelBufferDays` or after `trip.endDate + travelBufferDays`.
Acceptance:
- Given a trip 2026-11-10..2026-11-14 and buffer 2, When an item is dated 2026-11-08, Then no flag.
- When an item is dated 2026-11-07, Then a `DATE_OUT_OF_WINDOW` warn flag whose message includes the date and the allowed window.
- When an item is dated 2026-11-16, Then no flag; 2026-11-17 flags.
- Dates compare as `YYYY-MM-DD` strings (REQ-NFR-05).
Tests: tests/unit/rules.date-window.test.ts
### REQ-RULE-03 — OVER_CATEGORY_CAP [MUST] [draft]
Warn when a category's total on the claim exceeds `capPerTripMinor`; flag attaches to the item that crosses the cap.
### REQ-RULE-04 — OVER_GRANT_BALANCE [MUST] [draft]
Error when claim total exceeds remaining grant balance (REQ-BAL-01).
### REQ-RULE-05 — CATEGORY_NOT_ELIGIBLE [MUST] [draft]
Error when the item's category is not eligible for the grant.
### REQ-RULE-06 — MISSING_PROOF [MUST] [draft]
Warn when the category `requiresProof` and the item has no attachment (any proof type counts).
### REQ-RULE-07 — DUPLICATE [SHOULD] [draft]
### REQ-RULE-08 — FOREIGN_CURRENCY_NO_RATE [MUST] [draft]
Error when an expense has a non-INR original currency and no estimated rate. (The UI also prevents saving such an expense; the rule protects imported/backup data.)
### REQ-RULE-09 — Severity model + justification [MUST] [draft]
`error` blocks submission until the item is fixed or removed; `warn` never blocks but appears in the pack and the reviewer view; `info` is advisory. The user may add a justification text to any flagged item; it appears next to the flag.
### REQ-RULE-10 — Thresholds from grant config [SHOULD] [draft]

### REQ-RULE-11 — UNVERIFIED_AMOUNT [MUST] [draft]
Error when a claim item is a bank-paid expense (domestic or foreign) with no matched statement debit: the authority accepts only the statement INR debit. Clears when the expense is matched (REQ-CSV-08) or removed from the claim.
Acceptance:
- Given a claim item with `inrStatus = 'pending'` and `paymentMode = 'bank'`, Then an `UNVERIFIED_AMOUNT` error flag is raised and submission is blocked (REQ-RULE-09).
- Given the item is matched to a statement row, Then no flag.
- Given a cash item, Then this rule does not apply (REQ-RULE-13 applies instead).
Tests: tests/unit/rules.unverified.test.ts

### REQ-RULE-12 — UNCATEGORISED [MUST] [draft]
Error when an item has no category (REQ-CAP-14 only suggests, never decides).

### REQ-RULE-13 — CASH_NOT_IN_STATEMENT [SHOULD] [draft]
Warn on cash-paid items (no statement row exists). The user must add a justification, which is shown to the reviewer.

## Open questions
- Should any warn become an error for your real grant authority (D-4)?
