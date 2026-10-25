# 02 — Live Tracking (Segment A)

Status: **AGREED v0.3.1** — reviewed and approved by the owner on 2026-10-25.
Covers: capturing expenses from proofs (UPI/bank screenshots, card SMS text or screenshots, invoices, tickets), the inbox, the expense list. Parent: `../SPEC.md`.

Conventions: the *Inbox* holds unconfirmed proofs; *confirming* an item creates an Expense. All data is local (IndexedDB) and works offline. Accepted file types: JPG, PNG, WebP, PDF.

## Requirements

### REQ-CAP-01 — Manual add expense [MUST] [built]
The system shall let the user add an expense with original amount and currency (INR by default; for other currencies the estimated rate, REQ-SET-06), date, payee, category, optional note and reference, with or without an attachment.
Acceptance:
- Fields: amount (required, > 0), currency (default INR; common list + any 3-letter code), date (required, default today), payee (required, ≤ 80 chars), category (optional at save, required for claiming), payment mode (bank / cash, default bank), note, reference, trip (defaults to the most recently used trip).
- Money input accepts `2,450.50`, `2450.5` and `₹ 1,200`; rejects `0`, `-5`, `abc` and more decimals than the currency allows, with an inline message and no save.
- Given INR ₹2,450.50, When saved, Then `originalMinor` = `inrMinor` = 245050, status `pending`, and the balance drops by ₹2,450.50 immediately.
- Given a date after today, Then a non-blocking warning is shown.
- Given a non-INR currency, Then the trip's default rate is prefilled and editable (REQ-SET-06).
- Works offline.
Tests: tests/unit/expense-form.test.ts, tests/e2e/capture.smoke.test.ts

### REQ-CAP-02 — Picker / camera / files import (multi-select) [MUST] [built]
The system shall let the user select or capture one or more images or PDFs (screenshots, invoice photos, e-tickets), each becoming an Inbox item. Works on every supported browser, offline.
Acceptance:
- Given 3 images selected at once, Then 3 Inbox items appear (thumbnails, in selection order) and the nav badge shows 3.
- On a phone the picker offers camera capture as well as the gallery and files.
- Given an unsupported type (e.g. .docx, .heic where unsupported), Then it is skipped with a message listing accepted types; valid files in the same selection are still added.
- Given a PDF larger than 1 MB, Then it is accepted into the Inbox with the note "Too large to include in a claim (max 1 MB)" shown until replaced.
- Given the picker is cancelled, Then nothing changes.
Tests: tests/unit/import.test.ts, tests/e2e/capture.smoke.test.ts

### REQ-CAP-03 — OS share-sheet import [SHOULD] [built]
The system shall appear in the OS share sheet for images, PDFs and text (Web Share Target; the app must be installed) where the platform supports it, and add shared files to the Inbox and shared text to the text parser (REQ-CAP-13). Handled by the service worker so it works offline. Unsupported platforms use REQ-CAP-02.
Acceptance: as REQ-OFF-03 (handler behaviour), plus:
- Given the installed app on Android Chrome, When the user shares a screenshot from the gallery or text from the SMS app to RET, Then the app opens at the Inbox showing the item, also in airplane mode (manual check, M1b).
- Given a platform without support (e.g. iOS Safari), Then RET is simply not offered in the share sheet and REQ-CAP-02 / REQ-CAP-13 remain available; the Inbox page shows a one-line hint about them.
Tests: tests/unit/share-target.test.ts; manual device check

### REQ-CAP-04 — Inbox [MUST] [built]
The system shall list unconfirmed proofs and let the user tag each with a proof type (UPI screenshot, card alert, invoice, ticket, other); opening one shows it beside an editable expense form; confirming creates the expense and removes the Inbox item; the user can discard an item.
Acceptance:
- The Inbox lists items newest first (items added in one import keep their selection order, REQ-CAP-02) with thumbnail (or text snippet), proof type and received time; the nav badge shows the count.
- Opening an item shows the proof (zoomable on a phone) next to the form (stacked on narrow screens). The trip defaults to the one whose dates include today, else the last used.
- Confirming requires amount, date and payee (category may be left empty and is flagged later by REQ-RULE-12). On confirm: the Expense is created with the proof attached (`kind: 'proof'` + proof type), the Inbox item is removed, the balance updates, and the next Inbox item opens.
- Discard asks for confirmation and permanently deletes the item and its file.
- Unconfirmed items survive reload and offline periods (REQ-CAP-11).
- Given an item with text only (SMS), Then the form is prefilled by the text parser (REQ-CAP-13) and no image is shown.
Tests: tests/e2e/inbox.smoke.test.ts

### REQ-CAP-05 — OCR prefill for screenshots [MUST] [built]
The system shall run on-device OCR on an inbox image and prefill amount, date, payee, reference where found. Fields are always user-confirmed; failure leaves the form empty and never blocks.
Acceptance:
- Given the demo UPI-style screenshot (REQ-DEMO-05), Then amount, date, payee and reference are prefilled correctly.
- Given an unreadable image, Then the form stays empty and the expense can still be saved.
- OCR runs in a Web Worker so the page stays responsive; a "Reading screenshot…" indicator is shown and can be dismissed; the demo fixture finishes in ≤ 10 s on a desktop browser.
- Prefilled fields are visibly marked "check" until the user edits or confirms them.
- OCR runs on the original-resolution image; the stored copy is the compressed one (REQ-CAP-10). The raw OCR text is kept only in memory while the form is open.
- Works offline once the recognition data is cached (REQ-OFF-05).
Tests: tests/unit/receipt-parser.test.ts (text samples), tests/e2e/ocr.smoke.test.ts (fixtures)
Notes: parser is `parseReceiptText(text)` in `src/shared`, tested on synthetic text samples. Reliable scope: UPI/bank screenshots and card SMS/alert text (₹/Rs/INR amounts, dd Mon yyyy dates, "Paid to", UTR/Txn ID, "spent on card … at MERCHANT"). Foreign invoices and receipts vary too much: OCR may suggest a number, but the user types/confirms amount and currency. Card alerts often show available limit and card digits, so redaction (REQ-PRIV-06) matters for them.

### REQ-CAP-06 — Expense list [MUST] [built]
The system shall list a trip's expenses grouped by day with filters (category, flagged), and allow edit, exclude, delete and viewing the attachment.
Acceptance:
- Expenses are grouped under date headings (newest first) with a day total; each row shows payee, category chip, INR amount (foreign items also show the original amount), a status chip (*Pending* / *Confirmed*), and a proof thumbnail. A flagged row shows a chip naming the flag; in M1 the only flag is REQ-RULE-02 (date outside the trip window), the rest arrive with the rules engine in M2.
- Filters: category, status, *flagged only*. Active filters are shown and can be cleared; the header totals (trip total, pending, confirmed) reflect the whole trip, not the filter.
- Tapping a row opens the detail: edit all fields, view the proof full size, exclude/include, delete (with confirmation).
- Exclude: the row is dimmed and labelled "Excluded", the balance is recomputed, and the item is left out of the claim.
- Empty trip: a message explains how to add the first expense.
Tests: tests/e2e/expense-list.smoke.test.ts, tests/unit/grouping.test.ts

### REQ-CAP-07 — Duplicate detection [SHOULD] [agreed]
Acceptance:
- On confirm, a warning "Looks like a duplicate of <payee ₹amount date>" appears when the trip already has an expense with (a) the same non-empty reference, or (b) the same amount, date and payee (case-insensitive), or (c) a proof with the same SHA-256.
- The warning is non-blocking: the user can Save anyway or Discard.
Tests: tests/unit/duplicates.test.ts

### REQ-CAP-08 — Supporting documents [SHOULD] [agreed]
Acceptance:
- From an expense's detail the user can attach up to 5 extra files (invoice, ticket, boarding pass), each with a proof type; they are listed, viewable and removable.
- Any attached proof or supporting document satisfies REQ-RULE-06; all are included in the pack.
Tests: tests/unit/attachments.test.ts

### REQ-CAP-09 — Paste / drag-drop [COULD] [agreed]
Acceptance:
- On the Inbox page, pasting an image from the clipboard (Ctrl/Cmd+V) or dropping files creates Inbox items.

### REQ-CAP-10 — Compression + EXIF stripping [SHOULD] [agreed]
Max edge 1600 px, JPEG ~0.8, metadata dropped (also REQ-PRIV-04).
Acceptance:
- Given a 4000×3000 JPEG with GPS EXIF, When imported, Then the stored copy has longest edge 1600 px, contains no EXIF/GPS segment (byte scan for the Exif marker finds none), and is ≤ 1 MB (quality steps down to 0.6, then edge to 1200 px, until it fits).
- PDFs are stored untouched. Images smaller than 1600 px are re-encoded but not enlarged.
Tests: tests/unit/image.test.ts (runs with a canvas implementation in the test environment)

### REQ-CAP-11 — Local persistence [MUST] [built]
All data survives reload, browser restart and offline periods (IndexedDB).
Acceptance:
- Given grants, trips, expenses, Inbox items, grant documents, payee-category memory and CSV column mappings, When the page is reloaded, the browser is restarted, or the device goes offline, Then all of it is present.
- Image and PDF files are stored as Blobs in IndexedDB (not base64 in localStorage).
- The database is versioned with migrations, so a newer app version opens older data without loss.
- If a write fails (e.g. storage quota), the user sees an error message; nothing fails silently.
Tests: tests/unit/db.test.ts (fake-indexeddb), tests/e2e/capture.smoke.test.ts

### REQ-CAP-12 — Backup export/import [SHOULD] [agreed]
Acceptance:
- Settings → Export downloads one JSON file containing all data and files; Import (with a "this replaces everything" confirmation) restores it.
- Given export, then clear all data, then import, Then every record and file is identical.
Tests: tests/unit/backup.test.ts

### REQ-CAP-13 — Paste or share SMS/notification text [MUST] [built]
The system shall accept pasted text, or text shared through the share sheet, from a card or bank SMS/notification and run the same parser as OCR output (`parseReceiptText`) to prefill the Inbox form. No OCR is involved, so this is the most accurate path for card SMS and the fallback if OCR is unavailable. Card digits, "available limit" and account-balance ("Bal") figures are discarded before saving, never stored.
Acceptance:
- Given the text "INR 2,450.00 spent on card XX1234 at HOTEL SAMPLE on 12-Nov-26", Then amount ₹2,450.00, date 2026-11-12 and payee "HOTEL SAMPLE" are prefilled, and the card digits are not stored.
- Given a text with "Avl Lmt INR 85,000.00", Then that figure appears nowhere in the stored expense or the claim.
- Given text the parser cannot read, Then an empty form opens with the text shown beside it for manual entry.
- Given two amounts in one text, Then the amount next to "spent/paid/debited" wins; if unclear, the field stays empty.
- Given "Rs 2399 spent@ ABDUSROLLS on 25OCT26 12:59 Bal Rs.123456 Ref 34567", Then amount ₹2,399.00, date 2026-10-25, payee "ABDUSROLLS" and reference "34567" are prefilled, and the balance 123456 is stored nowhere.
- Formats vary by bank, so the parser accepts: merchant after "at", "@" or "spent@"; dates as 25OCT26, 25-OCT-26, 25 Oct 2026, Oct 25, 2026, 25/10/2026, 2026-10-25; amounts as Rs 2399, Rs.2,399.00, INR 2399, ₹2399; references after Ref, UTR, Txn ID, UPI Ref (must contain a digit). Anything it cannot read stays empty; the user always confirms.
- A "Paste text" button on the Inbox page works on every browser, including iOS.
Tests: tests/unit/receipt-parser.test.ts

### REQ-CAP-14 — Category suggestion [MUST] [built]
The system shall suggest a category from the payee/merchant text using a keyword table (airline/railway names → Airfare / Rail-bus; ride-hailing → Local transport; hotel/stay names → Accommodation; restaurant/food-delivery → Meals; conference/society names → Registration) and remember the user's choice per payee so repeat merchants are pre-selected next time. A suggestion is never applied silently: the user confirms it on the expense form with one tap. Unknown payees (for example a person's name) get no suggestion.
Acceptance:
- Given payee "IRCTC" Then Rail / bus is suggested; given "Uber" Then Local transport; given "R. Kumar" Then no suggestion.
- Given the user previously set "CAFE SAMPLE" to Meals, Then the next "CAFE SAMPLE" expense pre-selects Meals; the remembered choice wins over the keyword table.
- Ambiguous aggregators (e.g. "MakeMyTrip") show up to 2 candidate categories as chips rather than one pre-selected choice.
- The suggestion appears as a highlighted chip; nothing is stored as the category until the user taps it or picks another.
- Given no category chosen, Then the expense cannot be claimed (REQ-RULE-12).
Tests: tests/unit/categoriser.test.ts

### REQ-CAP-15 — Tap to assign text to a field [MUST] [built]
The system shall show the text of an Inbox item (pasted or shared SMS now; text read from a screenshot by REQ-CAP-05) as tappable words, and let the user assign any selection to Amount, Date, Payee or Reference. This is the guarantee for bank formats the parser does not recognise: the parser only prefills, and a few taps always complete the form.
Acceptance:
- Given the text "Alert 2399 INR XYZ MART 25/10/26 thanks", where the parser finds no amount or payee, When the user taps "XYZ" and "MART" and chooses Payee, Then the Payee field is "XYZ MART" and the selection clears.
- Selecting "2399" and choosing Amount sets the amount to 2399; selecting "Rs.2,399.00" or "INR 2399" also sets the currency; selecting a date such as "25OCT26" and choosing Date sets 2026-10-25.
- Given a selection that cannot be read as the chosen field (for example "hello" as Amount or Date), Then a message says so and the form is unchanged.
- Words are tappable buttons with a pressed state, at least 44 px tall (REQ-NFR-01), usable by keyboard; the four assign buttons are disabled until something is selected; Clear empties the selection.
- Text that was scrubbed (card digits, balances) is not shown, so it cannot be assigned (REQ-CAP-13).
- Assigning never saves anything: the user still confirms the expense.
Tests: tests/unit/assign.test.ts, tests/e2e/inbox.smoke.test.ts

### REQ-CAP-16 — Learn from corrections [SHOULD] [agreed]
After the user confirms an expense made from text, the system shall remember the words that surrounded each confirmed value (for example "spent@ ⟨payee⟩ on", "Ref ⟨reference⟩") and use them first on the next message in the same format. Only anchor words are stored, never amounts, merchants, dates or references; the memory stays on the device, can be cleared in Settings and is part of the backup (REQ-CAP-12). Acceptance criteria to be written when this is scheduled (after M1b).

## Open questions
- Which UPI/bank apps and card-alert SMS formats matter most (D-3)? (Not blocking: the demo uses synthetic fixtures.)
- Should confirming an expense warn immediately if it breaks a rule? (Yes, via REQ-RULE flags shown inline.)
