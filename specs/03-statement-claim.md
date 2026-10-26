# 03 — Statement Claim (Segment B): reconcile + one-shot

Status: **AGREED v0.5 — the owner answered the design decisions on 2026-10-26** (a sample of their bank's CSV is still wanted; until then the mapper is tested on three common layouts)
Covers: CSV import, reconciliation with tracked expenses, and selection producing a ClaimDraft. The claimed amount is always the statement INR debit (REQ-CLM-08). Parent: `../SPEC.md`.

## How it works
A **Statement** screen on each trip: choose the bank's CSV file → check the column mapping (guessed for you, remembered for next time) → see the debits inside the trip's dates → **reconcile**: ExpRes pairs each tracked expense with its debit; you confirm the pairs → tick any other debit that belongs to the trip → give those a category. A tracked expense that is paired becomes *confirmed* at the statement's amount; a ticked debit becomes an expense (source "statement"). Rows you do not tick are never saved anywhere.

What is kept on the device: the column mapping, and for each pair or ticked row only the fields of `StatementRef` (date, narration, debit, reference, row fingerprint). The CSV file and its other rows, balances and account details are read in memory and dropped when you leave the screen.

## Requirements

### REQ-CSV-01 — Parse CSV in the browser [MUST] [built]
The file is read and parsed locally with Papa Parse; it is never uploaded (REQ-PRIV-01/02).
Acceptance:
- Given the sample statement, When it is chosen, Then the rows appear within 1 second and no request leaves for any server (checked in the browser tests).
- Given a UTF-8 file with a byte-order mark, Then the first header is read correctly.
- Given a file over 5 MB or with more than 50,000 lines, Then it is refused with a message saying so and nothing is parsed.
- Given a file that is not text, Then a message says what it is and what to do instead, decided from its first bytes (a PDF, an Excel .xlsx or .xls file, a picture) or its name, however it was renamed; an empty file says it is empty.
- Text is read as UTF-8 (with or without a byte-order mark), UTF-16 (Excel's "Unicode Text", marked or not) or old Windows-1252, whichever fits.
Tests: tests/unit/statement-parse.test.ts, tests/e2e/statement.smoke.test.ts

### REQ-CSV-02 — Column mapping [MUST] [built]
The user maps the columns and the date format; ExpRes guesses first. The mapping is remembered per "bank profile" (identified by the header row), so the next statement from the same bank needs one tap.
Acceptance:
- Required: **date**, **description**, and either (a) a **debit** column (with an optional **credit** column), (b) one **signed amount** column (negative = money out), or (c) one **amount** column with a **Dr/Cr** column. Optional: **reference**. A **balance** column may be marked but is never read, stored or sent.
- Date styles offered (four families, each with any separator and a 2- or 4-digit year): day first (12/11/2026, 12-11-26), month first (11/12/2026), year first (2026-11-12), and with the month name (12-Nov-2026, 12 Nov 2026). A time after the date is ignored. The guess looks at the whole column: a day above 12 in the first position means day-first. The user can change it, and a preview shows the first three rows as they will be read.
- Given headers such as "Txn Date / Narration / Chq./Ref.No. / Withdrawal Amt. / Deposit Amt. / Closing Balance", Then date, description, reference, debit, credit and balance are guessed correctly (tested on three synthetic layouts).
- Given a mapping the user confirmed once, When another file with the same header row is chosen, Then the mapping and date format are applied without asking again, with a "Change" link.
- Mapping is incomplete (no date or no amount column) → the table is not shown and the message says what is missing.
- Columns are recognised by many spellings (Withdrawals, Paid out, Debit Amount (INR), Dr Amount, Narrative, Particulars, Instrument No, UTR No ...); the transaction date wins over the value date wherever each sits. A type column with words (WITHDRAWAL, DEPOSIT, PAYMENT, REFUND) gives the direction of a single amount column.
- When the headers cannot be understood, or the file has no header row at all, the columns are worked out from what is in them (the column of dates; numeric columns with pence; the wordiest column is the description; a long run of digits is a reference, not an amount). The user always confirms them, so a wrong guess costs one tap and never wrong data.
- A fifth date style, month name first (Nov 12, 2026), is offered.
Tests: tests/unit/statement-map.test.ts

### REQ-CSV-03 — Transaction table [MUST] [built]
Shows the debits with search, a date range that defaults to the trip window ± the grant's buffer, a checkbox per row and "select all shown".
Acceptance:
- Given the sample statement and a trip 10–14 Nov 2026 (buffer 2), Then only debits dated 8–16 Nov appear first, with a count ("12 of 40 debits"), and the date range can be widened.
- Search matches narration and reference, ignoring case.
- Credits are not shown; their count is, with the reason beside it: "3 credits hidden: credits and refunds are not part of a claim." (the note sits in the table's summary line, where the count is).
- Each row shows date, narration, amount (₹, tabular), reference; a row already paired with an expense shows "Paired with <payee>" and cannot be ticked; a row ticked shows in a running total ("4 selected · ₹21,640.00").
- "Select all shown" ticks only the rows currently shown (after search and date range), never hidden ones, and never paired rows.
- At 360 px wide each row is readable: narration on its own line, amount and checkbox below (no vertical text).
Tests: tests/unit/statement-filter.test.ts, tests/e2e/statement.smoke.test.ts

### REQ-CSV-04 — Assign category (bulk) [MUST] [built]
Acceptance:
- With rows ticked, one category choice applies to all of them; each ticked row can also be changed alone. The category suggestion (REQ-CAP-14) is offered per row from its narration, and applied only when the user taps it.
- Rows without a category can still be added; they are flagged REQ-RULE-12.
Tests: tests/e2e/statement.smoke.test.ts

### REQ-CSV-05 — Ticked rows become expenses and a ClaimDraft [MUST] [built]
Acceptance:
- "Add N selected to this trip" creates one expense per ticked row: source "statement", payee = the narration with the bank's boilerplate left as written (editable on the expense page), date = the row's date, amount = the debit, status **confirmed**, payment mode bank, the chosen category, and the row's `StatementRef`. The balance changes at once (REQ-BAL-06).
- A row can only be added once: adding the same file again shows those rows as "Already added" (matched by row fingerprint).
- `buildClaimDraft(grant, trip, expenses)` (REQ-RULE-01) turns the trip's non-excluded expenses into one `ClaimDraft`; each item carries its statement line (REQ-CLM-08). The claim preview, PDF and submission arrive in M3.
- Works with no tracked expenses at all (statement-only use).
Tests: tests/unit/claim-draft.test.ts, tests/e2e/statement.smoke.test.ts

### REQ-CSV-06 — Edit / redact description [SHOULD] [draft]
Not part of M2 (cut-line).

### REQ-CSV-07 — Attach receipt per row [SHOULD] [draft]
Not part of M2 (cut-line). Until then a receipt is added from the expense page like any proof.

### REQ-CSV-08 — Reconcile tracked expenses with statement rows [MUST] [built]
The system shall match the trip's tracked expenses to statement debit rows, show proposed pairs for confirmation, and on confirmation set `statementRef`, replace `inrMinor` with the debit amount and set `inrStatus = 'confirmed'`. Unmatched tracked expenses and unmatched statement rows both stay visible.
Matching:
- INR expense: same amount and statement date within ±2 days of the expense date → proposed automatically.
- Foreign-currency expense: candidates are debits within ±15% of the estimated INR amount and within ±5 days of the expense date, sorted by closeness; never auto-confirmed, the user picks the pair.
- A statement row confirms at most one expense and vice versa; the user can unlink a pair.
- Cash expenses (`paymentMode = 'cash'`) are skipped.
- Pairs are decided together, not one by one: all candidate pairs are ranked (smallest date gap first, then closest amount, then oldest expense) and taken greedily, so two identical expenses and one matching row give exactly one pair, deterministically.
Acceptance:
- Given an INR expense ₹1,200.00 on 2026-11-11 and statement debits of ₹1,200.00 on 2026-11-12 and on 2026-11-20, Then only the 11-12 row is proposed.
- Given a €89.00 expense estimated at ₹8,455.00 and a debit of ₹8,612.34 inside the window, Then it is offered as a candidate; after the user confirms, the expense shows ₹8,612.34, status confirmed, and the balance changes per REQ-BAL-06.
- Given two expenses with the same amount and date and one matching row, Then only one pair can be confirmed.
- **Manual link:** for an expense with no proposal (an INR expense whose amount differs, a foreign one outside the band) the user can pick any unpaired debit by hand; the statement amount is then used and the screen says so.
- **Unlink** returns the expense to *pending* at its own amount again (the estimate for a foreign expense, the typed amount for an INR one), clears `statementRef`, and frees the row.
- Pairs are shown side by side (expense: payee, date, amount; debit: narration, date, amount) with the reason ("same amount, 1 day apart" / "₹157.34 more than your estimate"). "Confirm all" confirms every automatic (INR) proposal; foreign ones are confirmed one by one.
- An expense that is already confirmed is never re-proposed. Expenses of other trips are not touched.
- After confirming, the "unpaired" lists remain: tracked expenses with no debit, and debits with no expense.
Notes: fallback if this slips is the statement-only path (tick rows, attach proof), but then foreign expenses tracked live cannot be claimed.
Tests: tests/unit/reconcile.test.ts, tests/e2e/statement.smoke.test.ts

### REQ-CSV-09 — Tolerate real-world CSVs [MUST] [built]
Handles preamble lines before the header, comma / semicolon / tab / pipe delimiters, quoted fields, thousands separators, footer lines, blank or malformed lines (reported, not fatal).
Acceptance:
- Given 8 lines of account details before the header, Then the header row is found (the first row with at least three non-empty cells that looks like column names: it names a date and an amount or debit column).
- Given a semicolon-separated file, Then it is read like a comma one (delimiter guessed from the header row).
- Given amounts written `1,23,456.78`, `1,234.56`, `₹ 560.00`, `Rs.560`, `560.00 INR`, `Dr 560.00`, `560.00cr`, `(560.00)`, `-560.00`, `−560.00` or `560.00-`, with ordinary, non-breaking or thin spaces, Then each reads as the right number of paise (integer arithmetic only, REQ-NFR-04). A file written with a decimal comma (`1.234,56`, `1 234,56`) is detected and read the same way; an ambiguous `5 600.00` is refused, never guessed.
- Dates may carry a leading weekday, a time, an ISO `T` time or quotes; all are ignored.
- Given a quoted field containing a comma or a line break, Then it stays one field.
- Given rows that cannot be read (no valid date, no amount) and footer lines ("Closing balance", totals), Then they are skipped and listed: "3 lines could not be read" with their line numbers and a reason. The rest still loads.
- A file with no readable rows at all says so plainly.
Tests: tests/unit/statement-parse.test.ts

### REQ-CSV-11 — Optionally keep the statement on this device [COULD] [draft]
Off by default and not part of M2. A choice on the Statement screen, "Keep this statement on this device", for people who would rather not choose the file each time. It would store every row of the file, including personal ones, on the device only, with a plain explanation, a list of kept statements with a delete button in Settings, and inclusion in the backup (REQ-CAP-12). Estimated at 1 to 1.5 hours on top of the core; nothing in the core has to change.

### REQ-CSV-10 — Bundled synthetic sample CSV [MUST] [built]
`fixtures/sample-statement.csv` (synthetic): a preamble block, domestic debits, one foreign-currency card debit whose INR amount differs from the demo estimate, unrelated personal rows (groceries, subscriptions, a salary credit), a footer. Downloadable in-app from the Statement screen (REQ-DEMO-04) and used by the tests.
Acceptance:
- It contains a debit matching each bank-paid demo expense (the IRCTC ticket, the cab, the hotel and, at ₹17,230.55 instead of the ₹17,100.00 estimate, the €180 registration), so loading the demo data and then the sample statement reconciles all four, and the balance moves as in REQ-BAL-06.
- It contains no real names, account numbers or merchants.
Tests: tests/unit/statement-parse.test.ts, tests/e2e/statement.smoke.test.ts

## Decisions (agreed by the owner, 2026-10-26)
1. **Rows you do not tick are never saved**; each visit starts from the file. *Later, optional (REQ-CSV-11, not in M2): a "Keep this statement on this device" choice, off by default, for people who prefer not to choose the file each time. It would store every row of the file, including personal ones, on the device only, with a clear explanation, a list with a delete button in Settings, and inclusion in the backup. Estimated at 1 to 1.5 hours on top of the core, and nothing in the core has to change to allow it.*
2. **Ticked rows become expenses of the trip** (source "statement") so lists, balance and rules all work the same for every expense.
3. **Credits and refunds are not claimable in this version**, and the table says so next to the hidden-credits count.
4. **Foreign card spends are matched by amount band and date, never by the narration**, because narrations rarely show the original amount.
5. **One statement screen per trip**, opened from the trip page.

## What I need from you (to test on a real layout, not only invented ones)
Your bank's name and one real CSV **header row plus the lines above it**, and two or three example rows, with every name, account number, amount and merchant replaced. Which date format does it use (for example `12/11/2026` or `12-Nov-2026`)? Is the money split into Debit / Credit columns, or one signed column? Please do not send a real statement.
