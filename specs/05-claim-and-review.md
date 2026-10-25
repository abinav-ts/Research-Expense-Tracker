# 05 — Claim Pack, Submission and Reviewer View

Status: **DRAFT** (acceptance criteria to be completed in chat before M3)
Parent: `../SPEC.md`.

## Requirements — Claim

### REQ-CLM-01 — Preview = what the reviewer sees [MUST] [draft]
One screen shows claimant, grant (with chosen grant documents), trip, items with attachments, per-category totals and flags; this same data is what is exported and submitted (REQ-PRIV-03).
### REQ-CLM-02 — Claim pack PDF [MUST] [draft]
Generated in the browser: cover page (grant, trip, claimant, totals, declaration), itemised table (each item with its statement line), per-category totals, flags summary, proof appendix. Works offline.
### REQ-CLM-03 — Claimant details + declaration [MUST] [draft]
Name, email, optional employee ID; declaration wording configurable (D-4).
### REQ-CLM-04 — Submit; queue when offline [MUST] [draft]
Submitting sends the snapshot and attachments; if offline, the user is told to submit when connected; with REQ-OFF-04 (should) the submission waits in the Outbox and sends automatically. The result gives a review link and an owner link.
### REQ-CLM-05 — CSV export [SHOULD] [draft]
### REQ-CLM-06 — Immutable submissions, revisions [SHOULD] [draft]
### REQ-CLM-07 — Researcher sees status [SHOULD] [draft]

### REQ-CLM-08 — Claim amount = statement INR debit [MUST] [draft]
The system shall use the statement INR debit as each item's claimed amount and show the statement line (date, narration, debit, reference) next to the item in the preview, PDF and reviewer view. Cash items show "cash — justification" instead of a statement line (REQ-RULE-13). For foreign-currency items the original amount and currency are shown for information.
Acceptance:
- Given a reconciled €89.00 item with debit ₹8,612.34, Then the claim item amount is ₹8,612.34 and the item displays "€89.00" as original amount.
- Given a submitted claim, Then the stored payload contains only the selected items' statement fields (REQ-PRIV-02).
Tests: tests/unit/claim.test.ts, tests/api/claims.submit.test.ts

## Requirements — Reviewer

### REQ-REV-01 — Read-only pack in browser, no account [MUST] [draft]
### REQ-REV-02 — Per-item approve / reject / query + comment [MUST] [draft]
### REQ-REV-03 — Overall decision, lock afterwards [MUST] [draft]
Statuses: approved (all items approved), partially_approved, rejected.
### REQ-REV-04 — Receipt image viewer [MUST] [draft]
### REQ-REV-05 — Approved total recomputed [SHOULD] [draft]
### REQ-REV-06 — Reviewer PDF download [COULD] [draft]
### REQ-REV-07 — Link security [MUST] [draft]
Review and owner tokens are random ≥ 128-bit values; pages send `noindex`; submit/review endpoints are rate-limited; tokens are not logged.

## API sketch (to be finalised in chat)
`POST /api/claims` · `GET /api/review/:token` · `POST /api/review/:token` · `GET /api/owner/:token` · `GET /api/health`

## Open questions
- Should the reviewer be able to request changes (query → researcher resubmits as revision)? (Default: yes via REQ-CLM-06 if time permits.)
- Passcode on top of link (D-5)?
