# ExpRes: viva sheet

*Research Expense Tracker · prepared 27 October 2026 · specification v0.6.5. Written from the repository (SPEC.md, the sub-specs, the changelog and the git log). The test numbers come from a run on 27 October.*

## 1. The idea in 60 seconds

A researcher on a grant has to prove conference-travel spending to the granting authority. Today they hand over whole bank statements, which exposes unrelated personal spending. The proof is put together weeks later from memory, and while travelling they do not know how much of the grant is left.

**ExpRes** is a web app that fixes this in two segments:

- **Live tracking (Segment A).** During the trip you add proof of each expense: a UPI "payment successful" screenshot, a card SMS, an invoice or a ticket. The phone reads the proof on the device (OCR), suggests the amount, date, payee and category, and you confirm. A balance gauge shows what is left of the grant, with confirmed and still-to-be-verified amounts kept apart.
- **Statement claim (Segment B).** After the trip you load your bank-statement CSV. The app matches your tracked expenses to their statement debits, because the authority accepts the **statement INR debit** as the claimed amount. You can tick other relevant rows, and rows you do not choose never leave the device.

Both segments produce one **claim pack**: a PDF plus a private review link that shows *only* the selected items. The grant officer opens the link and approves or rejects each item.

Three ideas to land:

1. **Privacy by minimisation.** Nothing leaves the device until you press Submit, and then only the selected items.
2. **The statement is the source of truth for rupees.** A proof gives an estimate; the bank debit gives the claimable amount.
3. **A human confirms everything a machine reads.** OCR and CSV parsing prefill, they never decide.

A fourth is about the process: the whole project was built **spec first**, with every requirement given an ID that the tests cite.

## 2. Who uses it

| Role | What they do | How they get in |
|---|---|---|
| Researcher | Owns grants, trips and expenses; builds and submits the claim | No account. The data lives in their browser. Each submitted claim gives them a private owner link. |
| Reviewer (grant officer) | Checks one submitted claim, item by item | No account. A private review link (REQ-REV-07). |

Out of scope on purpose: bank or UPI integrations, real accounts, multiple institutions, native apps, payments, e-mail, PDF or Excel statements, and syncing a researcher's data between devices.

## 3. The demo, step by step

The acceptance test for the whole project is this runthrough on the deployed site (SPEC §1):

1. Open the site, choose *Researcher*, create a grant (name, sanctioned amount) and attach grant documents. These are stored but never read.
2. Create a trip linked to the grant.
3. Add expenses from proofs: a UPI-style screenshot (recognised, form prefilled), a card SMS (pasted or shared, recognised), and a foreign-currency invoice (amount typed, estimated rate). Each time the app suggests a category, you confirm, and the balance drops and shows what is pending verification.
4. Load the fake bank-statement CSV and reconcile: tracked expenses match their debits, estimates become real INR amounts, and the balance updates. Tick any other relevant rows. Unrelated rows never leave the device.
5. Open the claim preview ("what the reviewer will see"), fix flagged items, export the PDF and submit.
6. Open the review link on another device: approve or reject items with comments and give an overall decision. The researcher sees the status.
7. Optionally, switch to airplane mode, add an expense offline and watch the balance update.

## 4. Architecture

```
Researcher's device (works offline)                   Cloudflare (free plan)
┌─────────────────────────────────────────────┐      ┌───────────────────────────┐
│ React app (Vite, Tailwind, React Router)    │      │ Hono API on one Worker    │
│  ├─ Segment A: live tracking                │      │  POST /api/claims         │
│  └─ Segment B: statement claim              │ ───► │  GET  /api/review/:token  │
│ Pure TypeScript core (src/shared): money,   │submit│  POST /api/review/:token  │
│   dates, rules, receipt parser, reconcile   │online│  GET  /api/owner/:token   │
│ IndexedDB via Dexie: grants, trips,         │ only │ D1 (SQLite): claims and   │
│   expenses, proof files, inbox              │      │   receipts, as rows       │
│ Service worker: offline cache, share target │      │ Also serves the built app │
│ Tesseract.js · jsPDF · PapaParse            │      └─────────────▲─────────────┘
└─────────────────────────────────────────────┘                    │
                                                    Reviewer's browser (link only)
```

What leaves the device, and when:

- **Before Submit: nothing.** There are no analytics, no CDNs, no external fonts and no OCR service. A test checks that the client makes no third-party requests (REQ-PRIV-05).
- **At Submit: only the selected claim items** and their attachments, plus the claimant, grant and trip fields shown in the preview. For statement evidence only the chosen rows' date, narration, debit and reference are sent. The balance column, the account number and every other row stay behind (REQ-PRIV-02).
- **Images are re-encoded before sending**, so camera metadata such as location is dropped (REQ-PRIV-04).

## 5. The stack and why

The stack was fixed up front (SPEC §5.1) for a first-time web developer: one language, few moving parts, one deploy.

| Concern | Choice | Why | Not chosen |
|---|---|---|---|
| Language | TypeScript 7 everywhere | One language; types shared by client and server | |
| Client | React 19, Vite 8, React Router, Tailwind 4 | The most documented combination, so the easiest to get right | Next.js: server-component complexity and a weaker offline story |
| Offline | `vite-plugin-pwa` (Workbox) with a custom service worker | Offline cache and the share-target in one place | |
| Local data | Dexie 4 over IndexedDB | Structured data and image blobs, offline | `localStorage`: too small, no blobs |
| OCR | Tesseract.js 7, assets self-hosted | On-device, offline, no keys | A cloud OCR or LLM: breaks the privacy rule |
| CSV | Papa Parse | Robust in-browser parsing | |
| PDF | jsPDF + autotable | Built on the device, so it works offline | |
| Validation | zod 4 | The same schemas check client forms and server input | |
| Server | Hono on a Cloudflare Worker, D1 (SQLite) | Tiny, TypeScript-native, free, no idle sleep, one deploy | Supabase or Postgres: more accounts and keys. Render's free tier: SQLite is wiped on every spin-down, so review links would vanish. GitHub Pages: static files only, cannot store claims |
| Tests | Vitest (unit and API), Playwright (browser) | Spec-to-test traceability | |
| Deploy | `wrangler deploy`; GitHub holds the source | HTTPS is required for installing the app and for share-to-app | |

Versions are pinned exactly in `package.json`, on Node 24 (the current LTS). The server code is written against a small `ClaimRepo` interface, so API tests run without Cloudflare and the host could be swapped later.

## 6. Decisions in the data model

These small choices shape the whole codebase:

- **Money is an integer number of paise.** There is no floating point on amounts anywhere (REQ-NFR-04). Foreign-currency estimates use an integer *micro-rate* (INR per unit × 1,000,000) with half-up rounding. Formatting happens only at the screen edge.
- **Dates are `YYYY-MM-DD` strings** compared as strings, never as `Date` objects, so a time zone can never move an expense to another day (REQ-NFR-05).
- **Every expense is `pending` or `confirmed`.** *Pending* means the amount came from a proof or an estimate. *Confirmed* means it has been matched to a statement debit and carries the bank's amount. The balance shows both:
  `remaining = sanctioned − already used − confirmed − pending`
- **Rules are data.** Caps, eligibility and the travel buffer come from the grant's configuration, not from constants in the code.
- **A pure core.** Money, dates, rules, parsers and matching live in `src/shared` as plain TypeScript with no browser or Node APIs, so they are unit-tested without a browser. `src/shared` may not import from `client` or `server`.
- **One pipeline.** Live tracking and CSV import both produce the same `ClaimDraft`, so the rules, the PDF and the submission are written once.
- **Cash is allowed but visible.** Cash items have no statement row, so they pass with a warning and a written justification (REQ-RULE-13).

## 7. The OCR

### 7.1 Why it runs on the device

Three reasons, in order of weight:

1. **Privacy.** A payment screenshot shows account details. Sending it, or the text of a bank SMS, to a cloud OCR or a language model would break the rule that nothing leaves the device before Submit. The changelog records this as the reason for rejecting that route (v0.4.4).
2. **Offline use.** The researcher is travelling, often with poor signal.
3. **No keys, no cost, no server to run.**

The price is accuracy: Tesseract is weaker than a cloud vision model. The design makes up for that with image preparation, a cautious parser, ranked suggestions and, above all, a human who confirms every value.

### 7.2 The pipeline

```
screenshot, photo or pasted SMS text
   │   iPhone HEIC photos are converted to JPEG first (where the browser can open them);
   │   pasted text skips straight to the scrubber
   ▼
prepare the image     apply orientation · scale down to at most 4 megapixels · greyscale ·
                      stretch contrast (2nd to 98th percentile) · local adaptive threshold
   ▼
Tesseract.js in a Web Worker     English model, WebAssembly, served from our own origin
   pass 1: automatic page layout
   pass 2, only if no amount or no date was found: sparse-text layout, result appended
   ▼
scrub                 card digits, "available limit" and balance figures are removed
   ▼
parse and suggest     amount · date · payee · reference, up to three ranked suggestions each
   ▼
you confirm           best guess prefilled and marked "Check"; one tap applies another suggestion
   ▼
learn                 remember payee spellings and the words around values, on the device only
```

### 7.3 What each stage does and why

| Stage | What it does | Why it is there |
|---|---|---|
| Web Worker | Recognition runs off the page's main thread, with a "Reading screenshot…" indicator and a two-minute stop | The page stays responsive; a stuck read cannot hang the app |
| Self-hosted assets | The worker, the WebAssembly core and the English model (about 15 MB in the build, about 7 MB downloaded per device) come from our own origin and are cached in the background after the first load | Recognition works offline later (REQ-OFF-05) and no third party sees a request |
| Core selection | `wasm-feature-detect` picks the relaxed-SIMD, SIMD or plain core for the device | Fast where possible, working everywhere |
| Image preparation | Contrast stretch, then a **Sauvola local threshold** with a window about 1/14 of the image width | A photographed receipt has shadows and creases, where one global brightness cut-off fails. If preparation fails, the original image is read instead |
| Two layout passes | "Automatic" finds blocks and columns; "sparse" finds scattered lines | Receipts and screenshots sometimes lose lines under automatic layout |
| Scrub | Card digits, available-limit and balance figures are removed **before** anything is kept or suggested | They must never be stored or sent (REQ-CAP-13) |
| Memory only | The raw recognised text lives in memory while the form is open. A browser test confirms the stored inbox item holds neither the payee nor the reference | Minimisation |
| Fallback | If recognition cannot run or fails, the form stays empty and still works. A red warning gives the reason and a "Try again" button | OCR must never block the user |

### 7.4 How the parser behaves when it is unsure

`parseReceiptText` is deliberately conservative: a field it is unsure about stays empty.

- **Amount.** The number next to a spend word ("spent", "paid", "debited") wins. Two amounts with no clear winner give an empty field. Figures near "limit" or "balance" are ignored.
- **The rupee sign is often lost by OCR**, so "₹1,200" can arrive as "1,200", "?1,200" or "=1,200". When no marked amount exists, a line that is only a money-formatted number is accepted, and it is still marked "Check". Plain digit runs (ids, references, dates) are never taken.
- **Payee.** It is read after "paid to", "at", "@" or "spent@", and stops at a date or at words such as "on", "ref" and "bal".
- **Reference.** It follows "UTR", "Txn ID", "Ref" or "UPI transaction ID" and must contain a digit, so ordinary words are not taken.
- **Dates.** Accepted forms include `25OCT26`, `25-OCT-26`, `25 Oct 2026`, `Oct 25, 2026`, `25/10/2026` and `2026-10-25`.

### 7.5 Suggestions: ranking instead of guessing

Real invoices read as hundreds of words, so the form offers **up to three suggested values per field**, best first (REQ-CAP-15):

- **Amount.** A number on a line with "total", "amount", "paid" or "payable" ranks first. Lines with "tax", "GST", "discount" or "rate" rank last. A value that repeats ranks higher, so an invoice showing `560.00` four times and one garbled `60.00` suggests 560.00.
- **Date.** Real month names are matched approximately ("hugust" reads as August), and look-alike characters are repaired (O→0, l→1). Dates inside the trip window come first. A date whose day had to be guessed (a "72" could be 12 or 22) is offered as a chip and **never prefilled**.
- **Payee.** First a payee you confirmed before, shown with your own spelling and labelled "Used before". Then the merchant after "at", "@" or "paid to". Then the first name-like lines. Addresses, phone numbers, web addresses and words like INVOICE or TAX are never suggested.
- **Learning (REQ-CAP-16).** On confirmation the app remembers the payee spelling and, for each field, the up to two words before and one word after the value. A later message in the same format is then read even if the generic rules cannot read it. Amounts, dates, references and message bodies are never kept for learning. A Settings button forgets everything.

### 7.6 Where it is weak

- Recognition quality depends on the image. Low-resolution, stylised or heavily compressed screens read worse.
- The parser is tuned on generic UPI and card-alert layouts and on a few real messages. The specific apps and SMS formats of a real user are an open question (D-3 in the spec).
- Foreign invoices vary too much to rely on: the spec says the user types or confirms amount and currency.
- There is no tool yet to black out parts of a screenshot (REQ-PRIV-06, a "could").

## 8. The bank statement and reconcile

This is the second place where robustness mattered, because every bank writes its CSV differently.

**Reading the file** (REQ-CSV-01, -02, -09). The reader copes with:

- a preamble of account details above the header, and footer or total lines in the middle;
- comma, semicolon, tab and pipe delimiters, and quoted fields that contain commas or line breaks;
- amounts such as `1,23,456.78`, `₹ 560.00`, `Rs.560`, `560.00 INR`, `Dr 560.00`, `(560.00)`, `-560.00`, a Unicode minus and a trailing minus; a decimal comma (`1.234,56`) is detected, and an ambiguous `5 600.00` is refused, never guessed;
- files in UTF-16 or Windows-1252; files that are really PDFs, Excel sheets or pictures get a plain message;
- files with **no header row** or unusual column names, read from the contents of the columns;
- two date columns, where the transaction date wins over the value date.

Rows it cannot read are **listed with their line numbers**, not dropped silently. The column layout is remembered per bank.

**Matching** (REQ-CSV-08). Pure and deterministic in `reconcile.ts`:

- An INR expense matches a debit of exactly the same amount within **2 days**.
- A foreign-currency expense is matched to debits within **±15 %** of the estimated rupee amount and within **5 days**. It is never confirmed automatically, because the narration rarely shows the original amount. The user picks.
- Candidate pairs are ranked together (smallest date gap, then closest amount, then oldest expense) and taken greedily. Two identical expenses and one matching row therefore give exactly one pair, every time.
- Every choice is a draft with a ✕ to take it back, and one final **Confirm** saves them all (REQ-CSV-12). Un-linking returns the expense to pending at its own amount.

**Privacy of the statement.** Rows that are not ticked or paired are never saved. Credits and refunds are not claimable in this version, and the table says so.

## 9. How robustness was built: fake first, then real

The method, repeated through the build:

1. **Start with invented data.** An invented UPI screenshot, a card SMS image, a foreign invoice and several invented bank-CSV layouts. They use generic layouts, are watermarked "SAMPLE", and are never copies of real apps. Because they are synthetic they can be committed and tested.
2. **Run it on real things.** A real bank SMS, a real photographed receipt, my phone, my laptop, an iPhone. The real inputs found problems the invented ones could not.
3. **Fix the cause, not the instance.** For example a general ranking of amounts, not a special case for one shop.
4. **Freeze the failure as a synthetic test.** The real receipt photo is kept out of the repository; a generated degraded receipt (shadow, tilt, blur, grain) took its place in the tests.
5. **Spec first.** Each round is a dated changelog entry, so the reasons are on record.

The rounds, from the changelog:

| When | Input | What happened | What changed |
|---|---|---|---|
| 26 Oct, v0.4.3 | **Real** bank SMS | The parser, written against invented text, missed the payee after `@`, dates with no separators (`25OCT26`), short references, and **left a balance figure in the stored text**, which is a privacy defect | Parser widened; balances, limits and card digits are scrubbed before saving |
| 26 Oct, v0.4.4 | Design review | Banks' formats cannot all be anticipated, and sending text to a model would break the privacy rule | Decided on on-device suggestions and learning (REQ-CAP-15, -16) |
| 26 Oct, v0.4.5 | Fake screenshots through real OCR | Tesseract drops the ₹ sign | A lone money-formatted number is accepted when no marked amount exists |
| 26 Oct, v0.4.6 to 0.4.7 | **Real** photographed receipt | The first design (tap the words you want) showed hundreds of words and was more work than paper. OCR read `560.00` as `60.00` and "August" as "hugust", and lost the shop name | Replaced by up to three ranked suggestions per field. Added image preparation, fuzzy month names, look-alike repair and payee-spelling memory. The total, shop, date and invoice number now came out. A synthetic degraded receipt replaced the real one in tests |
| 26 Oct, v0.4.8 | **My device** | A read failed without saying why | A red warning with the reason and a "Try again" button; a stuck read stops after two minutes |
| 26 Oct, v0.4.9 | **iPhone photos, Safari engine** | HEIC photos could not be read; WebKit cannot keep a Blob in IndexedDB in some modes | HEIC converted to JPEG where the browser can; files kept as bytes where it cannot. The browser suite now also runs on WebKit (109 of 110 passed first time) |
| 26 Oct, v0.4.10 and 0.4.11 | **My phone and laptop** | On a phone the text of an inbox row got 0 px of width and printed one letter per line. After a release the desktop showed the old version, and a device that missed one update stayed stuck on it | Layout fixed. A "New version available" bar. Service workers take over when no open page can offer the bar. Verified by simulating A→B, A→C and A→B→C against real builds |
| 26 Oct, v0.4.12 | **Me adding the same invoice twice** | No warning | Duplicate detection across the whole grant: same reference, same amount, date and payee, or same file fingerprint |
| 26 Oct, v0.5.3 | Five invented bank layouts (three Indian-bank styles, a signed amount, an amount with Dr/Cr) | The statement screen worked on all five. The tests found a cramped description on phone widths and a rejected proposal that vanished instead of moving to the by-hand list | Both fixed |
| 26 Oct, v0.5.4 | Wider range of statement files | Real exports vary in encoding, headers, number formats and dates | Hardening: 35 new unit tests and 3 browser tests. **A browser test found a defect no unit test could**: a React hook placed after an early return crashed the statement page |
| 27 Oct, v0.6.5 | **Me using the statement screen** | A debit proposed for a tracked expense could also be ticked as a second expense | Every choice is a draft with a ✕, one final Confirm saves them (REQ-CSV-12) |

The pattern worth saying aloud: **synthetic data proves the logic; real data finds the gaps; the gap becomes a synthetic test.** That keeps real bank data out of the repository, which would contradict the project's own privacy principle.

## 10. Other decisions along the way

| Decision | What was chosen | Why |
|---|---|---|
| Hosting (D-1) | Cloudflare Workers and D1 on the free plan; GitHub holds source only | One deploy, HTTPS included, no idle sleep. GitHub Pages cannot store claims; Render's free tier loses its SQLite file on spin-down |
| Where data lives | In the researcher's browser (IndexedDB); the server stores only submitted claims | Local-first and private. The cost: no sync between devices |
| Accounts | None. A private link per claim (D-5) | Simplest for a one-off claim; possession of the link is the access |
| Link security | 256-bit random tokens made on the device, stored on the server only as SHA-256 hashes; `noindex` headers; rate limits (10 submits, 120 reads and 20 failed lookups a minute) | A copy of the database does not contain working links. Making them on the device lets a retried Submit show the same links |
| Claimed amount (D-8) | The statement INR debit. Every bank-paid expense, domestic too, must be matched to a statement row before it can be claimed | It is the authority's rule, and the bank's number is evidence |
| Foreign currency (D-2) | In scope, with a user-entered estimated rate that the statement debit later replaces | Conference spending is often abroad |
| Errors and warnings | Errors block Submit; warnings do not. "Not yet verified" is an error for bank-paid items; cash passes with a justification | Forces reconcile, allows real-world cash |
| Rules on the server | The server stores the flags the device computed and checks shape, limits and arithmetic. It cannot re-run the rules, because it never receives the grant's rules | Minimisation again |
| Offline Submit | Explains that you need a connection, rather than queueing (the outbox, REQ-OFF-04, is not built) | Time; the PDF and all tracking still work offline |
| Sample claim | Built into the Worker from synthetic data; a visitor's decisions stay in their own browser | Works on an empty database, and anonymous visitors cannot write to it |
| PDF currency sign | The PDF writes "Rs." | Standard PDF fonts have no ₹ |
| iOS | No share-to-app, so the file picker and pasted text are the fallbacks | Safari does not support the Web Share Target, as far as is known |
| Brand | Colours and fonts only from `brand/tokens.css`; a script in `npm test` fails the build on a hard-coded hex, font-family or a second copy of the slogan | A brand change is a file swap in `brand/` |

## 11. How it was built

**Spec-driven, with two tools.** Claude chat (Cowork) was used to discuss and write the specification; **Claude Code** wrote the code. `CLAUDE.md` is the standing brief for Claude Code, and it sets the rules:

- No code without a requirement. If something needed is not specified, stop and propose a spec edit with a changelog line.
- If code and spec disagree, fix the spec first, in a visible diff.
- **Tests carry IDs**: a test title contains the requirement ID, such as `REQ-RULE-02`.
- A requirement is *done* when its acceptance criteria are met, `npm test` and `npm run trace` pass, its status is `built`, and, for interface work, it has been opened and used in a browser.
- The stack is fixed and versions are pinned. No new library without asking.
- Synthetic fixtures only; never commit real bank data or real payment screenshots.
- One commit per requirement group, with the IDs at the start of the message.

**Traceability.** `npm run trace` reads the MUST list from the spec and checks that each one has a test citing its ID. It fails if a requirement marked built has no test, or if a test cites an ID that is not in the spec. `--strict` is the final gate.

**My part** was the decisions (hosting, currency scope, the claim-amount rule, proof types), answering the design questions on 26 October, trying every milestone on real devices and with real documents, and the change requests recorded as v0.6.3 to v0.6.5.

**Timeline** (commit times, local):

| When | What landed |
|---|---|
| Sun 25 Oct, evening | **M0 walking skeleton**: Vite, React, Tailwind, Hono on a Worker, D1, the brand shell, `npm test`, `npm run trace`, deploy |
| Mon 26 Oct, 00:30 to 00:39 | Pure core and local storage; grants, trips, balance gauge, expense form, inbox, expense list (M1) |
| Mon 26 Oct, 01:12 to 01:59 | SMS parser hardening, share target, on-device OCR (M1b) |
| Mon 26 Oct, 11:42 to 13:42 | Receipt-photo robustness and learning; device-driven fixes (warnings, HEIC, WebKit, update bar, duplicates) |
| Mon 26 Oct, 13:45 to 16:59 | M2 specs agreed; rules engine; statement screen |
| Mon 26 Oct, 20:48 to 21:14 | Statement hardening; M3 spec and claim server |
| Tue 27 Oct, 03:22 | M3: claim page, PDF, submit, reviewer and owner pages, sample claim |
| Tue 27 Oct, 03:40 to 11:06 | M4: offline indicator, install button; browser tests pass on Chromium and WebKit; strict trace green |
| Tue 27 Oct, 13:00 to 13:21 | My change requests: cash-only expense button, final brand, "Back to…" links and box-shaped links, statement drafts with one Confirm |

**Plan against actual.** The plan set the final deploy for Monday 26 October at 22:00. The M4 commit with the strict trace green is Tuesday 11:06, so the schedule ran about half a day over. All 67 MUST requirements have tests; what stayed unbuilt are 21 SHOULD and COULD requirements (see section 13).

## 12. The evidence

| What | Result | Source |
|---|---|---|
| Unit and API tests | **448 passing**, in 42 files | `npm test`, run on 27 October 2026 |
| MUST requirements with a test | **67 of 67** | `npm run trace -- --strict`, run on 27 October 2026 |
| Browser tests | 203 test cases in 23 files, run on Chromium and WebKit | Last recorded passing run is commit `2ac567b`; not re-run for this sheet |
| Requirements marked `built` | 86 (68 in the sub-specs, 18 in the cross-cutting sections) | The spec files |
| Requirements marked `verified` | **0**: that status needs a manual check on a real device | The spec files |
| Tests about recognition | 78 (63 unit, 15 browser) | `receipt-parser`, `suggest`, `dates`, `image-prep`, `learn`, `ocr.smoke` |
| Tests about statement reading | 61 unit tests on parsing and column mapping, plus reconcile and plan tests | `statement-parse`, `statement-map`, `statement-robust` |
| Size | About 8,500 lines of TypeScript in `src/`, about 7,500 lines of tests | `wc -l` |
| History | 35 commits, 25 to 27 October 2026 | `git log` |

## 13. Limitations and future work

Said plainly, because an examiner will ask:

- **Data lives in one browser.** The backup export and import (REQ-CAP-12) and the request for persistent storage (REQ-OFF-08) are agreed but not built, so a browser that evicts storage, iOS in particular, can lose unsubmitted data.
- **No requirement is marked `verified`.** The share-to-app feature has been built and tested in a browser, but no real-Android check is recorded in the spec.
- **OCR is a helper, not an authority.** It is as good as the image, and the real-world formats of a particular user's apps and banks (D-3) are untuned.
- **Statements must be CSV.** PDF and Excel statements are out of scope, and credits and refunds are not claimable.
- **Submit needs a connection.** There is no outbox yet (REQ-OFF-04).
- **No passcode on a review link** (D-5): whoever holds the link can review.
- **The declaration wording is generic** until the real authority's wording is supplied (D-4).
- **Not built, by priority:** supporting documents on an existing expense (CAP-08), image compression at capture (CAP-10), editing grant rules in the interface (SET-04), several trips per grant in the interface (SET-05), per-category cap bars (BAL-03), CSV export of claim items (CLM-05), immutable claims with revisions (CLM-06), the reviewer's PDF download (REV-06), keeping a statement on the device (CSV-11), blacking out parts of a screenshot (PRIV-06).
- **Future work named in the spec:** bank or Account-Aggregator integration, real accounts and institutions, native apps, syncing across devices.

## 14. Likely questions

**Why not simply send the whole statement, as people do now?**
Because it exposes unrelated personal spending. ExpRes sends only the selected rows' date, narration, debit and reference. Everything else stays on the device, and a test inspects the submit payload to prove it.

**Why is the claim amount the bank debit and not the receipt?**
It is the authority's rule, and the debit is third-party evidence. A proof only gives an estimate, so until a bank-paid expense is matched to a statement row it is labelled *pending verification* and cannot be claimed.

**Why OCR on the device instead of a cloud service or a language model?**
Payment screenshots show account details. Sending them out would break the rule that nothing leaves the device before Submit. On-device OCR also works offline and needs no keys. The cost is lower accuracy, which the design handles with image preparation, cautious parsing, ranked suggestions and a human who confirms.

**What happens when the OCR is wrong?**
Every prefilled value is marked "Check" until the user edits or confirms it. The parser leaves a field empty when unsure, and the user can apply another of up to three suggestions with one tap. If recognition fails, the form still works and a red warning explains why.

**How do you know it works on real documents?**
Not from the invented ones alone. The method was fake first, then real: a real bank SMS, a real photographed receipt, and real phones and laptops each exposed failures (a balance left in stored text, `560.00` read as `60.00`, a layout that broke on phones). Each failure was fixed at the cause and frozen as a synthetic test. See section 9.

**Why integers for money and strings for dates?**
Floating point cannot represent most decimal amounts exactly, and a time zone can move a `Date` to the neighbouring day. Integer paise and `YYYY-MM-DD` strings remove both classes of bug, and the tests cover them (REQ-NFR-04, REQ-NFR-05).

**How does reconcile cope with foreign-currency spending?**
The expense carries an estimate. Reconcile offers debits within ±15 % of the estimated rupee amount and within 5 days, ranked by closeness, and the user picks. It is never automatic, because narrations rarely show the original amount. The chosen debit then replaces the estimate.

**How is the review link protected?**
It carries 256 bits of randomness, made on the device. The server stores only a SHA-256 hash, so a database copy holds no working links. Responses carry `noindex`, `robots.txt` disallows the paths, and requests are rate-limited. There is no passcode, by decision D-5.

**Why Cloudflare and not GitHub Pages?**
GitHub Pages serves static files and cannot store submitted claims, which the reviewer needs. Cloudflare's free plan gives a Worker, a SQLite database (D1) and HTTPS in one deploy. GitHub holds the source, and these viva pages are the one place it is used for hosting.

**What did the AI do, and what did you do?**
Claude chat helped write the specification and Claude Code wrote the code, bound by `CLAUDE.md`. I made the decisions, answered the design questions, tested on real devices with real documents, and reported what broke. The traceability rules (requirement IDs in tests, the `trace` gate) are how the work stayed checkable instead of trusted.

**Where did the AI-written code go wrong, and how was it caught?**
Two examples from the record: a React hook placed after an early return crashed the statement page, which unit tests could not see and a browser test did; and the first OCR design (tap the words) made more work than paper, which only a real receipt showed.

**What would you do next?**
Build the backup and persistent-storage requests, tune the parser on real app formats (D-3), do the real-Android check for share-to-app, add the outbox for offline Submit, and replace the generic declaration with the authority's wording.
