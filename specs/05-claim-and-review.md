# 05 — Claim Pack, Submission and Reviewer View

Status: **PROPOSED v0.6 — drafted 2026-10-26 and built from the same day at the owner's instruction; the decisions at the end are the owner's to change**
Parent: `../SPEC.md`. Privacy requirements: SPEC §9.

## How it works
From a trip, **Prepare claim** opens one screen: who is claiming, the declaration, and a **preview that is exactly what the reviewer will see**. Nothing has left the device until the user ticks "I have checked this" and presses **Submit**. Submitting sends one snapshot (the items, their proofs, the statement lines of those items, the claimant and the grant and trip details shown on screen) to the server and returns two private links: a **review link** for the grant officer and an **owner link** for the researcher. The reviewer opens the link, sees the pack, approves, rejects or queries each item with a comment, and finishes with an overall decision; the owner link shows the outcome. A PDF of the same pack can be made on the device at any time, even offline.

What is **not** sent: unticked statement rows, the statement's balances or account details, excluded expenses, the grant's rules, the researcher's other trips (only their total spend, shown in the grant position), grant documents not chosen, files over the size limit.

## Requirements — Claim

### REQ-CLM-01 — Preview = what the reviewer sees [MUST] [draft]
One screen shows the claimant, the grant (with the grant documents chosen), the trip, the grant position, every item with its proofs, per-category totals, and all flags with their justifications. The reviewer's page is the same component with the same data.
Acceptance:
- The preview lists every non-excluded expense of the trip in date order; excluded ones are absent. Each item shows: date, description, category, the claimed amount, the original amount and currency for foreign items, the statement line (REQ-CLM-08), proofs, flags and justification.
- Per-category totals add up to the claim total; the claim total equals the sum of the items (integer paise).
- The **grant position** box shows: sanctioned total, used before ExpRes, spent on other trips, this claim, and what is left after it. These are the only grant-money figures sent.
- The text and numbers the user sees in the preview are the same as the reviewer sees (the browser test compares them).
- The page works at 360 px wide.
Tests: tests/unit/claim.test.ts, tests/e2e/claim.smoke.test.ts

### REQ-CLM-02 — Claim pack PDF (on the device) [MUST] [draft]
Acceptance:
- "Download claim pack (PDF)" builds the PDF in the browser; it works with the network off.
- Cover page: ExpRes mark and name, grant, trip, claimant, claim total, number of items, date prepared, declaration. Itemised table: date, description, category, claimed amount, original amount, statement line (date, narration, reference) or "cash — justification". Per-category totals. Flags summary with justifications. Proof appendix: each image on its own area with its caption; PDFs and text proofs are listed by name.
- The rupee sign is written "Rs." in the PDF because the PDF's standard fonts have no ₹ glyph; screens keep ₹.
- A PDF with no problems has no flag section; a claim with 40 items runs to several pages with the table header repeated.
Tests: tests/unit/claim-pdf.test.ts, tests/e2e/claim.smoke.test.ts

### REQ-CLM-03 — Claimant details and declaration [MUST] [draft]
Acceptance:
- Name and email are required (email checked for a plausible shape); employee ID is optional. They are remembered on the device for the next claim.
- The declaration reads, unless the owner supplies other wording (D-4): "I declare that the expenses listed are true and were incurred for the conference above, that the amounts are those debited to my account, and that I have not claimed them elsewhere." It is shown in the preview, in the PDF and to the reviewer exactly as submitted.
- The declaration is a checkbox the user must tick before Submit.
Tests: tests/unit/claim.test.ts, tests/e2e/claim.smoke.test.ts

### REQ-CLM-04 — Submit [MUST] [draft]
Acceptance:
- **Submit** is disabled until: the details are valid, no item has an error flag (REQ-RULE-09; the screen lists them with links), at least one item exists, and the "I have checked this is what the reviewer will see, and I make the declaration" box is ticked (REQ-PRIV-03).
- Online: one request sends the snapshot; the result shows the **review link** and the **owner link**, each with a Copy button, and the claim is remembered on the device. A second tap of Submit with the same data does not create a second claim (an idempotency key).
- Offline: the screen says "You're offline — submit when connected"; nothing is sent, nothing is lost, and the PDF is still available. (The automatic outbox is REQ-OFF-04, later.)
- Files are made small first: images are re-encoded as JPEG (this also removes location and camera data, REQ-PRIV-04) to at most 1 MB each; a PDF over 1 MB cannot be included and the screen says so beside the item. At most 40 attachments and 25 MB per claim.
- A server error or a refusal shows its reason and keeps everything on the device so the user can retry.
Tests: tests/api/claims.submit.test.ts, tests/unit/claim.test.ts, tests/e2e/claim.smoke.test.ts

### REQ-CLM-05 — CSV export of items [SHOULD] [draft]
Not part of M3.

### REQ-CLM-06 — Submitted claims are immutable [SHOULD] [draft]
The server never changes a submitted claim's content; only reviews are added. Resubmitting as a revision is later.

### REQ-CLM-07 — Researcher sees claim status [SHOULD] [draft]
Acceptance:
- The trip page lists the claims submitted from this device with their status; opening the owner link (or the trip page, online) shows: submitted / in review / approved / partially approved / rejected, per-item decisions and comments, the overall comment, the approved total.
Tests: tests/e2e/claim.smoke.test.ts

### REQ-CLM-08 — Claim amount = statement INR debit [MUST] [draft]
The system shall use the statement INR debit as each item's claimed amount and show the statement line (date, narration, debit, reference) next to the item in the preview, PDF and reviewer view. Cash items show "cash — justification" instead of a statement line (REQ-RULE-13). For foreign-currency items the original amount and currency are shown for information.
Acceptance:
- Given a reconciled €89.00 item with debit ₹8,612.34, Then the claim item amount is ₹8,612.34 and the item displays "EUR 89.00" as original amount.
- Given a submitted claim, Then the stored payload contains only the selected items' statement fields: date, narration, debit, reference, fingerprint (REQ-PRIV-02).
- An item that is still pending (not matched) cannot be submitted (REQ-RULE-11 blocks).
Tests: tests/unit/claim.test.ts, tests/api/claims.submit.test.ts

## Requirements — Reviewer

### REQ-REV-01 — Read-only pack in the browser, no account [MUST] [draft]
Acceptance:
- Opening `/review/<token>` shows the whole pack (the same view as the preview) with no sign-in. An unknown or malformed token shows "This review link is not valid" (never a server error page), and the page says nothing about whether a similar token exists.
- The reviewer page shows the ExpRes mark but it is not a link home (REQ-BRAND-01) and has `noindex`.
- The reviewer cannot change any claim content.
Tests: tests/api/claims.review.test.ts, tests/e2e/review.smoke.test.ts

### REQ-REV-02 — Per-item approve / reject / query + comment [MUST] [draft]
Acceptance:
- Each item has three choices (Approve, Reject, Query) and an optional comment (up to 1,000 characters). A choice is saved at once, with a visible "Saved" state, and survives a reload. Changing a choice replaces it.
- A Reject or Query without a comment is allowed but the screen suggests adding one.
- The first decision moves the claim from "submitted" to "in review".
Tests: tests/api/claims.review.test.ts, tests/e2e/review.smoke.test.ts

### REQ-REV-03 — Overall decision; lock afterwards [MUST] [draft]
Acceptance:
- "Finish review" is available once every item is approved or rejected (a query is not a decision). It shows the outcome before it is confirmed: **approved** (all approved), **rejected** (all rejected), **partially approved** (a mix), and takes an overall comment (up to 2,000 characters).
- After it is confirmed the claim is locked: further item decisions and finishing again are refused (409) and the page says so with the decision and time.
- The sample claim (REQ-DEMO-03) is the one exception: finishing it shows the outcome and then resets it, so the demo can be run again.
Tests: tests/api/claims.review.test.ts, tests/e2e/review.smoke.test.ts

### REQ-REV-04 — Proof viewer [MUST] [draft]
Acceptance:
- Each item's proofs open large: images fit the screen and open full size on tap; PDFs open in the browser's viewer; message text is shown as text. The proof type (UPI screenshot, card alert, invoice ...) is shown beside each.
- Proofs load only when asked for (not all at once), and only for a valid token.
Tests: tests/api/claims.review.test.ts, tests/e2e/review.smoke.test.ts

### REQ-REV-05 — Approved total recomputed [SHOULD] [draft]
The reviewer sees a running total of approved items and of rejected/queried ones, recomputed after every choice; the owner sees the same.

### REQ-REV-06 — Reviewer PDF download [COULD] [draft]
Not part of M3.

### REQ-REV-07 — Link security [MUST] [draft]
Acceptance:
- Review and owner tokens are 256 bits of randomness from the platform's secure generator, written in URL-safe text; they are different from each other; neither can be derived from the other or from the claim id. The sample claim's link is the one fixed, public exception.
- Every page and API response for a link carries `X-Robots-Tag: noindex, nofollow`; `/robots.txt` disallows `/review/` and `/claim/`.
- Requests are rate-limited per client address: submissions (10 a minute), reading and reviewing (120 a minute), and failed token lookups (20 a minute) — beyond that the answer is 429 with Retry-After.
- Tokens never appear in logs or error messages.
Tests: tests/api/claims.security.test.ts

## Requirements — Privacy (the claim path; see SPEC §9)

### REQ-PRIV-01 — Nothing leaves the device before Submit [MUST]
Acceptance (browser test): across creating a grant and trip, adding expenses and proofs, importing and matching a statement, previewing and downloading the PDF, no request goes anywhere except to fetch the app's own files; the first and only request carrying data is the Submit.
### REQ-PRIV-02 — Only the selected items and their attachments [MUST]
Acceptance (API and unit tests): the submitted payload contains only the fields listed in "How it works"; no expense that was excluded, no statement row that was not paired or ticked, no balance or account figure; every attachment sent belongs to a sent item or a chosen grant document.
### REQ-PRIV-03 — Pre-submit "what the reviewer will see" [MUST]
Acceptance: Submit cannot be pressed until the confirmation box is ticked, and the request body equals the data the preview was drawn from.
### REQ-PRIV-05 — No third-party requests [MUST]
Acceptance (browser test): in every flow above, every request is to the app's own origin.

## Data and API
Server tables (D1): `claims` (id, status, submitted_at, review_token, owner_token, idempotency_key, payload JSON, overall_comment, decided_at, is_demo), `claim_files` (claim_id, file_id, name, mime, sha256, size, kind, proof_type, data), `item_reviews` (claim_id, item_id, decision, comment, updated_at), `rate_limits`. The server is written against a `ClaimRepo` interface so API tests run without Cloudflare.
`POST /api/claims` · `GET /api/review/:token` · `GET /api/review/:token/files/:fileId` · `PUT /api/review/:token/items/:itemId` · `POST /api/review/:token/decision` · `GET /api/owner/:token` · `GET /api/health`

## Decisions this draft makes (change any of them)
1. **The grant position is shown to the reviewer** (sanctioned total, used before, other trips, this claim, left): it is the context a grant officer needs, and it is shown to the claimant first. The grant's rules (caps, eligibility) are not sent.
2. **Errors block submission, warnings do not**, including "not yet verified": every bank-paid item must be matched to the statement first. Cash items go through with a justification.
3. **Offline Submit explains instead of queueing** in M3 (the outbox, REQ-OFF-04, is later).
4. **The server stores the flags the device computed** and checks the shape and limits of the data; it does not re-run the rules in M3.
5. **The PDF writes "Rs."** (standard PDF fonts have no ₹).
6. **The sample claim resets itself** when its review is finished, so the demo can be repeated.
7. **Declaration wording is generic** until the owner supplies the authority's (D-4).
8. **No passcode on the link** (D-5): possession of the link is the access.

## Open questions
- Should the reviewer be able to request changes that the researcher answers with a revision? (Later, with REQ-CLM-06.)
