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
- iPhone photos (HEIC/HEIF) are accepted: where the browser can open them (Safari on iPhone, iPad and Mac) each is converted to a JPEG as it is added (named .jpg, orientation applied, GPS and camera metadata dropped), so everything stored and shown later is an ordinary JPEG. Where the browser cannot open HEIC (for example Chrome), the photo is skipped with a message saying so and suggesting Safari or sharing as JPEG; other files in the same selection are still added.
- Given an unsupported type (e.g. .docx), Then it is skipped with a message listing accepted types (PDF, JPG, PNG, WebP, HEIC); valid files in the same selection are still added.
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
- Given an unreadable image, or recognition that cannot run, Then the form stays empty and the expense can still be saved, and a red warning (text, ⚠ icon and the brand's red, never colour alone) says what happened, gives the reason (for example "the recognition data could not be downloaded"), and offers "Try again". A read that has not finished after two minutes is stopped and reported the same way.
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

### REQ-CAP-07 — Duplicate detection [SHOULD] [built]
Acceptance:
- On save or confirm, a warning "Looks like a duplicate of <payee ₹amount date> (<why>)" appears when any expense of the same grant (all its trips, since one invoice claimed under two trips is still claimed twice) has (a) the same non-empty reference, or (b) the same amount, currency, date and payee (ignoring case and punctuation), or (c) a proof with the same SHA-256. A pasted or shared message counts as a proof: it is fingerprinted by its text.
- The warning is non-blocking and appears before anything is saved: the user can Save anyway, or Discard (in the Inbox this asks for the usual confirmation; when adding by hand it leaves without saving). When editing a saved expense the second button reads "Keep editing" and an expense is never compared with itself. Changing any field clears the warning. An expense that is excluded from the claim still counts, and the warning says it is excluded.
- The warning is amber with an icon and words (never colour alone).
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
- Image and PDF files are stored as Blobs in IndexedDB (not base64 in localStorage). In a browser that cannot keep a Blob in IndexedDB (found in WebKit's test browser; Safari has done this in some modes) the same file is kept as bytes plus its type and returned as an identical Blob when read; the user notices no difference.
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

### REQ-CAP-15 — Suggested values for each field [MUST] [built]
The system shall offer, under each of Amount, Date, Payee and Reference, up to three suggested values taken from the recognised or pasted text, best first, and let the user apply one with a single tap. The best suggestion is prefilled and marked "Check". It never shows the whole recognised text as a list of words to pick from: a real invoice can read as hundreds of words, and the user's job must stay no bigger than copying details from a paper invoice. (This replaces the earlier tap-the-words design, which was removed after trying it on a real receipt photo.)
Acceptance:
- **Date:** every date found, with real month names matched approximately ("22-hugust-2026" reads as 22 Aug 2026) and look-alike characters repaired (O→0, l→1, and a day such as "72" offers 12 and 22). Dates inside the trip window (REQ-RULE-02) come first, then dates near the word "date". Each chip shows the date and the words it was found next to.
- **Amount:** numbers with two decimals or a currency marker. A number on a line with "total", "amount", "paid" or "payable" ranks first; numbers on lines with "tax", "GST", "discount" or "rate" rank last; a value that appears on several lines ranks higher. Given an invoice whose lines show 560.00 four times and one garbled "60.00", Then 560.00 is the first suggestion.
- **Payee:** (1) a payee the user has confirmed before that closely matches a line of the text, shown with the user's own spelling and labelled "Used before" (REQ-CAP-16); (2) the merchant after "at", "@", "paid to"; (3) the first name-like lines of the text. Lines that are addresses, phone numbers, web addresses or words like INVOICE, TAX, BILL are never suggested.
- **Reference:** the value after "Invoice no", "Bill no", "Receipt no", "Txn", "Ref", "UTR", "UPI transaction ID".
- A chip equal to the current field value is not shown. Nothing plausible found means no chips and an empty field; the user types.
- Chips are buttons at least 44 px tall. The page never needs scrolling to see the suggestions of a field next to that field. The raw text sits in a collapsed "What was read" section with a Copy button, closed by default.
- Applying a chip counts as the user's edit: the "Check" mark on that field goes away. Nothing is saved until the user confirms the expense.
- Card digits, available limits and balances are scrubbed from the text before any suggestion is made (REQ-CAP-13).
Tests: tests/unit/suggest.test.ts, tests/unit/dates.test.ts, tests/e2e/ocr.smoke.test.ts, tests/e2e/inbox.smoke.test.ts

### REQ-CAP-16 — Learn from corrections [SHOULD] [built]
The system shall remember what the user confirmed so that the same vendor or message format needs fewer corrections next time. All of it stays on the device.
Acceptance:
- **Spelling memory.** When an expense is saved, its payee name is remembered (alongside the existing payee → category memory). When a later recognised text has a line that closely matches a remembered payee (at least 80 % similar after ignoring case and punctuation), the remembered spelling is the first Payee suggestion, labelled "Used before". Given the user once saved "Blossom Book House" and OCR now reads "Blossom Bock Rouse", Then "Blossom Book House" is suggested first.
- **Format memory.** When an expense is confirmed from a text (pasted SMS, or text read from an image) that contains the confirmed payee, reference, amount or date exactly once, the system stores for that field the up to two words before it and the one word after it. Given the next text has the same words around its payee, Then that payee is suggested first, even when the generic rules cannot read the format. Given the user's SMS "Rs 2399 spent@ SHOP ONE on 25OCT26" is confirmed, Then a later "Rs 150 spent@ OTHER CAFE on 01NOV26" reads payee OTHER CAFE.
- **Never stored:** amounts, dates, reference numbers, message bodies or images are not kept for learning. Payee names are kept (they are already kept for categories).
- **Control:** Settings shows how many payee spellings and message formats are remembered and has a "Forget what ExpRes has learned" button, with confirmation. Forgetting does not touch expenses. The memory will be part of the backup (REQ-CAP-12).
- Learning never changes a saved expense and never fills a field without the "Check" mark.
Tests: tests/unit/learn.test.ts, tests/unit/db.test.ts, tests/e2e/learning.smoke.test.ts

### REQ-CAP-17 — Payee autocomplete and payee list [SHOULD] [built]
The system shall offer payees the user has saved before while typing in a payee field, and list them in Settings so a wrong spelling can be corrected or removed.
Acceptance:
- The payee field offers every remembered payee (the browser's own suggestion list, so it also works on a phone keyboard).
- Settings → Payees lists each remembered payee A to Z with its remembered category and how many times it was saved.
- **Rename** corrects the remembered spelling and moves the remembered category with it. If the new name is already remembered the two are merged (counts added; the existing category wins). An empty name is refused with a message. Changing only capitals or spacing keeps the same entry.
- **Remove** asks for confirmation and forgets that one payee's spelling and category.
- Neither action changes a saved expense: the list is about what ExpRes suggests, and a typo that was saved on an expense is corrected by editing that expense.
- Rows keep a readable name and 44 px buttons at 360 px wide.
Tests: tests/unit/db.test.ts, tests/e2e/payees.smoke.test.ts

## Open questions
- Which UPI/bank apps and card-alert SMS formats matter most (D-3)? (Not blocking: the demo uses synthetic fixtures.)
- Should confirming an expense warn immediately if it breaks a rule? (Yes, via REQ-RULE flags shown inline.)
