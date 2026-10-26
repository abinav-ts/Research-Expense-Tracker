# 01 — Setup and Balance

Status: **AGREED v0.3.1** — reviewed and approved by the owner on 2026-10-25.
Covers: grants, grant documents, trips, categories, balance indicator. Parent: `../SPEC.md`.

Conventions used below: amounts are typed in rupees (Indian digit grouping and plain digits both accepted, e.g. `1,00,000.50` or `100000.5`) and stored as integer paise. "Reload" means a full page reload. Tests named here are the expected files; each test title must contain its REQ ID.

## Requirements

### REQ-SET-01 — Grant CRUD [MUST] [built]
The system shall let the user create, edit and delete a grant with name, sponsor, sanctioned total, amount already utilised, start and end dates. Deleting a grant with trips requires confirmation and deletes its trips, expenses and grant documents.
Acceptance:
- Given no grants, When the user creates "DST Sample Grant" (sponsor "Sample Agency", total ₹1,00,000.00, utilised before ₹20,000.00, 2026-04-01 to 2027-03-31), Then it appears on the home screen with ₹80,000.00 remaining and survives a reload.
- Validation: name required (≤ 80 chars); total > 0; utilised ≥ 0 and ≤ total; end date ≥ start date; at most 2 decimals; each failure shows an inline message next to the field and nothing is saved.
- Given an existing grant, When the user changes the total to ₹1,50,000.00, Then the home screen shows ₹1,30,000.00 remaining immediately.
- Given a grant with 2 trips, 7 expenses and 1 document, When the user taps Delete, Then a confirmation states "2 trips, 7 expenses and 1 document will be deleted"; Cancel deletes nothing; Confirm removes everything, and the grant stays gone after reload.
- Grants are INR only (currency is not editable).
Tests: tests/unit/grant.test.ts (validation, money parsing), tests/e2e/setup.smoke.test.ts

### REQ-SET-02 — Trip linked to one grant [MUST] [built]
The system shall let the user create a trip (conference name, city, country, start and end date, optional budget) linked to exactly one grant.
Acceptance:
- Given at least one grant, When the user creates "SampleConf 2026" in "Lisbon, Portugal" on 2026-11-10 to 2026-11-14 under the grant, Then it is listed under that grant and opens a trip screen.
- Given no grants exist, When the user taps "Add trip", Then they are asked to create a grant first.
- Validation: name, city, country required; end ≥ start; budget (optional) > 0.
- Given trip dates outside the grant's start–end period, Then an inline warning is shown but saving is allowed.
- Given a trip's dates are edited, Then date-window flags on its expenses are re-evaluated immediately (REQ-RULE-02). *(Delivered for REQ-RULE-02 in M1: flags are derived from the current trip dates, so they change as soon as the trip is saved.)*
- Given a trip with 5 expenses is deleted after confirmation, Then its expenses go and the grant balance rises accordingly without reload.
- The trip form has an optional "Default rates" section: add a currency code and an INR rate (used by REQ-SET-06).
Tests: tests/unit/trip.test.ts, tests/e2e/setup.smoke.test.ts

### REQ-SET-03 — Categories with eligibility, caps, proof flag [MUST] [built]
The system shall provide the default categories (SPEC §6) and store per grant: eligible (yes/no), optional per-trip cap, requires proof (yes/no), plus `travelBufferDays`. Defaults are seeded; UI editing is REQ-SET-04.
Acceptance:
- Given a new grant, Then it has exactly the 8 categories (Registration, Airfare, Rail/bus, Local transport, Accommodation, Meals, Visa/insurance, Other), each eligible = yes, requires proof = yes, no cap, and `travelBufferDays` = 2.
- Given stored grant data missing a category or field (older version), When loaded, Then missing values are filled with the defaults and nothing else changes.
- Given a category id not in the list, When saving, Then it is rejected (zod validation).
Tests: tests/unit/grant-rules.test.ts

### REQ-SET-04 — Edit rules in UI [SHOULD] [agreed]
Acceptance:
- Given a grant, When the user marks "Meals" not eligible, sets "Local transport" cap to ₹3,000.00 and buffer days to 3, Then the values persist after reload and flags on existing expenses update immediately.
- Clearing a cap field removes the cap. Buffer days accepts 0–7 only.
Tests: tests/e2e/rules-ui.test.ts

### REQ-SET-05 — Several trips per grant [SHOULD] [agreed]
Acceptance:
- Given a grant with trips A and B, Then the grant balance includes expenses from both, and each trip screen shows its own list and totals.
- A trip switcher on the trip screen moves between trips of the same grant.
Tests: tests/unit/balance.test.ts

### REQ-SET-06 — Foreign-currency expense with estimated rate [MUST] [built]
The system shall let the user record an expense in any ISO currency (original amount + currency) with an estimated INR rate. The trip stores a default estimated rate per currency (`fxRatesMicro`), prefilled on new expenses and editable per expense. `inrMinor` is computed with integer arithmetic (half-up rounding) and marked `pending`. Minor-unit exponent follows ISO 4217.
Acceptance:
- Given a trip default of 1 EUR = ₹95.00 and an expense of €89.00, Then `inrMinor` = 845500 paise (₹8,455.00) and status is `pending`.
- Given that expense is later matched to a statement debit of ₹8,612.34, Then `inrMinor` = 861234 and status is `confirmed` (REQ-CSV-08).
- Given an INR expense, Then no rate is asked and status is `pending` until matched to a statement row.
- Given a currency with no minor unit (JPY) and ¥12,000 at ₹0.63 (rate 630000 micro), Then `inrMinor` = 756000 paise (₹7,560.00).
- Rounding is half-up on the paise: €0.01 at ₹95.50 (rate 95500000 micro) is 95.5 paise, which rounds to 96 paise (₹0.96); €0.01 at ₹95.40 is 95.4 paise, which rounds to 95 paise.
- Given a non-INR expense with no rate, Then saving is blocked with the message "Enter an estimated INR rate" (REQ-RULE-08 protects imported data).
- The rate is an estimate and is labelled "Estimated" wherever the INR amount is shown until confirmed.
Tests: tests/unit/fx.test.ts

### REQ-SET-07 — Grant documents (store only) [MUST] [built]
The system shall let the user attach files (PDF/images, e.g. sanction letter, budget sheet) to a grant, list them, open them and remove them. Files are stored locally; nothing is read, parsed or recognised, and the sanctioned amount is the user's manual entry (trusted).
Acceptance:
- Given a grant, When the user adds a PDF and a JPG, Then both are listed with name, type and size, open after reload and offline, and can be removed (with confirmation).
- Given a file over 1 MB after compression (images) or over 1 MB (PDFs), Then it is stored locally but marked "Too large to include in a claim (max 1 MB)" and cannot be toggled into the pack (REQ-SET-08).
- Given an unsupported type (e.g. .docx), Then it is rejected with a message listing accepted types (PDF, JPG, PNG, WebP, HEIC). HEIC photos from an iPhone are converted to JPEG on import, as in REQ-CAP-02.
- No OCR or text extraction runs on grant documents.
Tests: tests/unit/grantdocs.test.ts

### REQ-SET-08 — Choose grant documents for the pack [SHOULD] [agreed]
Each grant document has an "include in claim pack" toggle (default on) shown in the preview (REQ-CLM-01); included documents are appended to the PDF and visible to the reviewer.
Acceptance:
- Given 2 documents with one toggled off, Then the preview lists only the included one and the PDF appendix contains only it.
Tests: tests/unit/claim.test.ts

### REQ-BAL-01 — Balance calculation and live update [MUST] [built]
The system shall compute `remaining = totalMinor − utilisedBeforeMinor − Σ(INR amount of non-excluded expenses across all trips of the grant)` and update it immediately after any expense is added, edited, excluded or deleted, on the home and trip screens.
Acceptance:
- Given a grant of ₹1,00,000 with ₹20,000 utilised before, and expenses of ₹15,000 and ₹5,000 on one trip, When the home screen is shown, Then remaining is ₹60,000.
- Given the above, When the ₹5,000 expense is excluded, Then remaining becomes ₹65,000 without reload.
- Given the above, When the ₹15,000 expense is edited to ₹16,500, Then remaining becomes ₹58,500; When it is deleted, Then ₹65,000.
- Given a second trip on the same grant with ₹10,000 expenses, Then remaining reflects both trips.
- Given amounts that would produce a float error (₹0.10 + ₹0.20), Then the result is exact (integer paise).
- The balance function is pure and takes no clock or storage input.
Tests: tests/unit/balance.test.ts

### REQ-BAL-02 — Indicator states [MUST] [built]
The indicator shall show amount remaining, % remaining (of the sanctioned total) and a state label: *Healthy* (≥ 20%), *Low* (< 20% and ≥ 0), *Overspent* (< 0). State is conveyed by text and icon as well as colour.
Acceptance:
- Given total ₹1,00,000: remaining ₹20,000.00 (exactly 20%) → Healthy; ₹19,999.99 → Low; ₹0.00 → Low; −₹0.01 → Overspent (shown as "Overspent by ₹0.01").
- Each state has a distinct word and icon, text contrast ≥ 4.5:1 (checked on the brand tokens for the light theme; the brand defines no dark theme yet), and an accessible label such as "Grant balance: ₹60,000 remaining, 60 percent, Healthy".
- The indicator appears on the home screen (per grant) and the trip screen, and changes within one render after any expense change.
Tests: tests/unit/balance.test.ts (state function), tests/e2e/balance.smoke.test.ts

### REQ-BAL-03 — Per-category cap bars [SHOULD] [agreed]
Acceptance:
- Given "Local transport" cap ₹3,000 and spend ₹2,400, Then a bar shows 80% with "₹600 left"; at ₹3,250 it shows "Over by ₹250" in text. Pending and confirmed amounts both count.
- Categories without a cap show spend only.
Tests: tests/unit/balance.test.ts

### REQ-BAL-04 — Trip budget remaining [SHOULD] [agreed]
Acceptance:
- Given a trip budget ₹50,000 and trip spend ₹32,000, Then "₹18,000 of trip budget left" is shown; no budget → the line is absent.
Tests: tests/unit/balance.test.ts

### REQ-BAL-05 — Balance-after preview on confirm [COULD] [agreed]
Acceptance:
- While typing an amount on the confirm form, "Balance after this: ₹X" updates; editing an existing expense accounts for its old amount.

### REQ-BAL-06 — Confirmed vs pending-verification split [MUST] [built]
The indicator shall show how much of the spent amount is pending verification (expenses entered from proofs or estimates and not yet matched to a statement debit), e.g. "₹58,400 left · ₹6,200 of spend is pending verification". Matching a statement debit moves the amount from pending to confirmed and changes the remaining balance by the difference (zero for an exact INR match).
Acceptance:
- Given remaining ₹60,000.00 including one pending expense of ₹8,455.00 (an estimate), When it is matched to a statement debit of ₹8,612.34, Then remaining is ₹59,842.66, pending spend drops by ₹8,455.00 and confirmed spend rises by ₹8,612.34.
- Given a pending INR expense of ₹1,200.00 matched to a debit of ₹1,200.00, Then remaining is unchanged and the amount is confirmed.
- Given no pending spend, Then the "pending verification" phrase is not shown.
Tests: tests/unit/balance.test.ts

## Open questions
- Is "amount already utilised" one number per grant, or do users want to enter prior trips? (Default: one number.)
- Do sanctioned amounts have a separate travel head with its own total? (Default: no.)
- Should the default estimate include a safety margin for forex markup (e.g. +3%)? (Default: no; user edits the rate.)
