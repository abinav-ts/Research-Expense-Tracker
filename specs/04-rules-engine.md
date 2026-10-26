# 04 — Rules Engine

Status: **PROPOSED v0.5 — written 2026-10-26 for M2, awaiting the owner's approval** (REQ-RULE-02 is already built and in use)
Covers: flags on claim items. Parent: `../SPEC.md`.

## Design
`evaluate(draft: ClaimDraft, context: RuleContext): Flag[]` is a pure function in `src/shared/rules`. It runs on the client (live feedback, the same screens that list expenses) and later on the server (re-checked at submit). Rules read thresholds from `grant.rules`. The same draft that feeds the rules feeds the claim preview, PDF and submission (principle 4).

- `ClaimDraft` is built from a trip's non-excluded expenses by `buildClaimDraft(grant, trip, expenses)`. Each `ClaimItem` carries what the rules need: `amountMinor` (the statement debit when matched, otherwise the pending amount), `paymentMode`, `inrStatus`, `estimatedRateMicro`, `attachmentCount`, `categoryId`, `statementRef`, `justification`.
- `RuleContext` = `{ otherSpendMinor }`: what the grant's other trips have already spent (so REQ-RULE-04 knows the balance left for this claim). No clock, no storage.
- Output order is fixed: by item (date, then created order), then by rule id, so the same input always gives the same list.
- A flag belongs to one item and has `ruleId`, `severity`, a plain-language `message` and the `itemId`.

## Requirements

### REQ-RULE-01 — Pure, deterministic evaluate() [MUST] [draft]
Same input always gives the same output; no I/O, clocks or randomness; inputs are not changed.
Acceptance:
- Given the same draft and context evaluated twice, Then the two flag lists are equal and in the same order; the draft is unchanged afterwards.
- Given items in any order in the draft, Then the output order depends only on item date and creation order.
- A draft with no problems gives an empty list.
- The expense list, expense page and trip page show these flags (replacing the date-only flag of M1): a chip per flag on the row (⚠ warn, ✖ error, with words), all flags with their messages on the expense page.
Tests: tests/unit/rules.test.ts

### REQ-RULE-02 — DATE_OUT_OF_WINDOW [MUST] [built]
The system shall flag (warn) any item dated before `trip.startDate − travelBufferDays` or after `trip.endDate + travelBufferDays`.
Acceptance:
- Given a trip 2026-11-10..2026-11-14 and buffer 2, When an item is dated 2026-11-08, Then no flag.
- When an item is dated 2026-11-07, Then a `DATE_OUT_OF_WINDOW` warn flag whose message includes the date and the allowed window.
- When an item is dated 2026-11-16, Then no flag; 2026-11-17 flags.
- Dates compare as `YYYY-MM-DD` strings (REQ-NFR-05).
- In M1 the flag is shown live in the form, the row chip, the "flagged only" filter and the expense page; from M2 it comes out of `evaluate()` like every other rule.
Tests: tests/unit/rules.date-window.test.ts, tests/e2e/capture.smoke.test.ts

### REQ-RULE-03 — OVER_CATEGORY_CAP [MUST] [draft]
Warn when a category's total on the claim exceeds `capPerTripMinor`; the flag attaches to the item that crosses the cap.
Acceptance:
- Given "Local transport" capped at ₹3,000.00 and items of ₹1,000.00, ₹1,500.00 and ₹1,000.00 in date order, Then only the third (running total ₹3,500.00) is flagged, with a message naming the cap and the amount over (₹500.00).
- Given a total of exactly ₹3,000.00, Then no flag.
- Given no cap on the category, Then never flagged. Pending and confirmed amounts both count; excluded items do not.
- Given two categories both over their caps, Then each gets its own flag.
Tests: tests/unit/rules.test.ts

### REQ-RULE-04 — OVER_GRANT_BALANCE [MUST] [draft]
Error when the claim total exceeds what is left of the grant for this claim (REQ-BAL-01 minus the grant's other trips).
Acceptance:
- Given a grant of ₹1,00,000 with ₹20,000 utilised before, other trips' spend ₹30,000, and a claim of items ₹20,000, ₹25,000 and ₹10,000 in date order, Then the available amount is ₹50,000.00 and only the third item (running total ₹55,000.00) is flagged as an error, with the amount over (₹5,000.00).
- Given a claim total exactly equal to the available amount, Then no flag.
Tests: tests/unit/rules.test.ts

### REQ-RULE-05 — CATEGORY_NOT_ELIGIBLE [MUST] [draft]
Error when the item's category is not eligible for the grant.
Acceptance:
- Given "Meals" marked not eligible, Then every Meals item gets an error flag naming the category; an item with another category or none does not.
Tests: tests/unit/rules.test.ts

### REQ-RULE-06 — MISSING_PROOF [MUST] [draft]
Warn when the item's category `requiresProof` and the item has no attachment (any proof type counts; a pasted message is a proof).
Acceptance:
- Given a category that requires proof and an item with no attachment, Then a warn flag; with one attachment, Then none; given `requiresProof = false`, Then none.
- An item with no category is not checked here (REQ-RULE-12 covers it).
Tests: tests/unit/rules.test.ts

### REQ-RULE-07 — DUPLICATE [SHOULD] [draft]
Covered while adding expenses by REQ-CAP-07. Not part of M2.

### REQ-RULE-08 — FOREIGN_CURRENCY_NO_RATE [MUST] [draft]
Error when an expense has a non-INR original currency, is still pending, and has no estimated rate. (The UI also prevents saving such an expense; the rule protects imported and backup data.)
Acceptance:
- Given EUR 89.00 with no `estimatedRateMicro` and status pending, Then an error flag; with a rate, Then none; once matched to a statement debit (confirmed), Then none because the statement amount is used.
Tests: tests/unit/rules.test.ts

### REQ-RULE-09 — Severity model and justification [MUST] [draft]
`error` blocks submission until the item is fixed or removed; `warn` never blocks but appears in the pack and the reviewer view; `info` is advisory. The user may add a justification text to any flagged item; it appears next to the flag.
Acceptance:
- A justification (up to 500 characters) is saved with the expense and shown under its flags on the expense page and as a line on the row. It never clears a flag: it explains it.
- `hasBlockingFlags(flags)` is true exactly when any flag has severity `error`; the trip page shows "N items need fixing before this can be claimed" with a link to the first.
- Clearing the justification text removes it.
Tests: tests/unit/rules.test.ts, tests/e2e/rules.smoke.test.ts

### REQ-RULE-10 — Thresholds come from grant config [SHOULD] [draft]
Caps, eligibility, proof requirement and the date buffer are read from `grant.rules` on every evaluation (nothing is hard-coded). Not part of M2 beyond what the rules above already do.

### REQ-RULE-11 — UNVERIFIED_AMOUNT [MUST] [draft]
Error when a claim item is a bank-paid expense (domestic or foreign) with no matched statement debit: the authority accepts only the statement INR debit. Clears when the expense is matched (REQ-CSV-08) or removed from the claim.
Acceptance:
- Given a claim item with `inrStatus = 'pending'` and `paymentMode = 'bank'`, Then an `UNVERIFIED_AMOUNT` error flag is raised and submission is blocked (REQ-RULE-09).
- Given the item is matched to a statement row, Then no flag.
- Given a cash item, Then this rule does not apply (REQ-RULE-13 applies instead).
Tests: tests/unit/rules.test.ts

### REQ-RULE-12 — UNCATEGORISED [MUST] [draft]
Error when an item has no category (REQ-CAP-14 only suggests, never decides).
Acceptance:
- Given an item with no category, Then an error flag asking for a category; with any category, Then none.
Tests: tests/unit/rules.test.ts

### REQ-RULE-13 — CASH_NOT_IN_STATEMENT [SHOULD] [draft]
Warn on cash-paid items (no statement row exists). The user must add a justification, which is shown to the reviewer.
Acceptance:
- Given a cash item without a justification, Then a warn flag saying a justification is needed; with a justification, Then the flag stays (as information that it is cash) and its message includes "justified".
Tests: tests/unit/rules.test.ts

## Decisions this proposal makes (change any of them)
1. A flag for a cap or the grant balance sits on the **one item that crosses the line** (as the draft said), not on every later item.
2. Items with no category are only flagged by REQ-RULE-12, so a missing category does not also produce "no proof needed" noise.
3. Every pending bank-paid expense carries a red UNVERIFIED_AMOUNT flag until it is matched, so a trip full of untouched proofs looks red. That is the intended signal ("not claimable yet"), shown as one summary line at the top of the trip as well as per row.

## Open questions
- Should any warn become an error for your real grant authority (D-4)?
