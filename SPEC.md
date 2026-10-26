# ExpRes — Global Specification

*Breeze through grant-handling grunt work.* (Product name: ExpRes. Slogan appears only on the loading screen, see `specs/07-branding.md`.)

| | |
|---|---|
| Status | **DRAFT v0.4** — hosting, deadline, demo scope and branding decided; details to be filled per sub-spec |
| Owner | Abinav |
| Created | 2026-10-25 |
| Deadline | **Final deploy by Mon 2026-10-26 22:00 IST** |
| Read order | `SPEC.md` → `specs/*.md` → `brand/BRAND.md` → `PLAN.md` → `CLAUDE.md` |

---

## 1. Problem and vision

**Problem.** A researcher on a grant must prove conference-travel spending to the granting authority. Today they hand over whole bank statements, which exposes unrelated personal transactions. Proof is assembled weeks later from memory, and while travelling they do not know how much of the grant is left.

**Vision.** A privacy-first web app that works offline and has two segments:

- **Segment A — Live tracking (provisional ledger).** Link a conference to a grant. During the trip, capture *proof* of each expense: a UPI/bank "payment successful" screenshot, a card SMS or wallet-notification screenshot, an invoice, e-ticket or receipt photo/PDF. Foreign-currency spend is entered in the original currency with an estimated rate. The app shows the grant balance remaining, with confirmed and estimated amounts kept separate.
- **Segment B — Statement claim (reconcile + one-shot).** After the trip, upload a bank-statement CSV. Tracked expenses are matched to their statement debits, which replaces estimates with the real INR amount; other relevant transactions can be ticked in directly. The granting authority accepts the **statement INR debit** as the claimed amount, so Segment B produces the final claim. A user who tracked nothing can use Segment B alone.

Both segments produce the same thing: a **claim pack** (PDF + online review link) that reveals *only* the selected expenses. A **reviewer** (grant officer) opens the link, checks each item and approves or rejects it.

**Demo runthrough (the acceptance test for the whole project; it must work end to end on the deployed URL):**
1. Open the public URL → *Researcher* → create a grant (name, sanctioned amount typed by the user, which is trusted) and attach grant documents (sanction letter etc.; stored only, never read or recognised).
2. Create a trip linked to the grant.
3. Add expenses from proofs: a UPI-style screenshot (recognised, form prefilled), a card SMS (pasted/shared text or screenshot, recognised) and a foreign-currency invoice (amount typed, estimated rate). Each time the app suggests a category, the user confirms, and the balance indicator drops and shows what is pending verification.
4. Upload the (fake) bank-statement CSV → reconcile: tracked expenses match their debits, estimates become real INR amounts, the balance updates; tick any further relevant rows; unrelated rows never leave the device.
5. Review the claim preview ("what the reviewer will see"), resolve flagged items, export the claim pack PDF, submit.
6. Open the review link (another device or browser): see the pack, approve/reject items with comments, give an overall decision; the researcher sees the status.
7. (Optional) Airplane mode: add an expense offline and watch the balance update.

## 2. Roles

| Role | Description | Auth |
|---|---|---|
| Researcher | Owns grants, trips, expenses. Uses the PWA. | None. Data lives on their device. Owner link per submitted claim. |
| Reviewer | Grant officer. Reviews one submitted claim. | None. Unguessable review link (REQ-REV-07). |

## 3. Scope

### 3.1 In scope
- Grant (with stored grant documents) and conference/trip setup, category rules, balance indicator (`01`)
- Proof capture (share-to-app, picker, OCR assist), foreign-currency estimates, expense list (`02`)
- CSV import, reconcile with tracked expenses, selection (`03`)
- Rule checks and flags (`04`)
- Claim pack PDF, submission, reviewer view (`05`)
- Installable offline PWA (`06`)

### 3.2 Out of scope (do not build, mention as future work)
Bank/UPI/Account-Aggregator integrations; real accounts/passwords; multi-institution tenancy; native mobile apps; payments; email notifications; PDF/XLS bank statement parsing (CSV only); cloud sync of researcher data across devices; accounting-grade multi-currency.

## 4. Principles (tie-breakers when requirements conflict)

1. **Privacy by minimisation.** Nothing leaves the device until the user taps Submit, and then only the selected items and their attachments.
2. **Local-first.** The researcher's data lives in the browser (IndexedDB). The server only stores *submitted* claims.
3. **Human confirms extracted data.** OCR and CSV parsing prefill; the user always confirms.
4. **One pipeline.** Live tracking and CSV import both produce a `ClaimDraft`; rules, PDF and submission are shared.
5. **Rules are data.** Caps, eligibility and windows come from grant configuration, not hard-coded constants.
6. **Pure core.** Money, dates, rules and parsers are pure TypeScript in `src/shared`, unit-tested without a browser.
7. **The statement is the source of truth for INR.** The claimed amount of an expense is its statement INR debit (the authority's rule). Until a bank-paid expense is matched to a statement row its amount is *pending verification* and is labelled as such.

## 5. Architecture

```
Researcher device (web app, works offline)            Cloud (Cloudflare Worker + D1)
┌──────────────────────────────────────────────────┐          ┌─────────────────────────────┐
│ React UI                                         │          │ Hono API                    │
│  ├─ Segment A: live tracking                     │  submit  │  POST /api/claims           │
│  └─ Segment B: statement claim                   │ ───────► │  GET  /api/review/:token    │
│ src/shared: money, dates, rules, receipt parser  │ (online; │  POST /api/review/:token    │
│ Dexie/IndexedDB: grants, trips, expenses, blobs, │  queued  │  GET  /api/owner/:token     │
│   inbox, outbox                                  │  if      │ D1 SQLite (claims, receipts)│
│ Service worker: cache, share-target, retry       │  offline)│ Serves the built PWA too    │
│ Tesseract.js (OCR) · jsPDF (PDF) · PapaParse     │          └──────────────▲──────────────┘
└──────────────────────────────────────────────────┘                         │
                                                         Reviewer browser (online) ┘
```

### 5.1 Stack (decided; rationale for a first-time stack user: one language, few moving parts, one deploy)

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language; types shared between client and server |
| Client | React + Vite + React Router + Tailwind CSS | Most-documented combo; fastest for Claude Code to get right |
| PWA / offline | `vite-plugin-pwa` (Workbox, custom service worker) | Offline cache + Web Share Target in one place |
| Local data | Dexie (IndexedDB wrapper) | Stores structured data and image blobs offline |
| OCR | `tesseract.js`, assets self-hosted | Runs on-device, offline, no API keys |
| CSV | Papa Parse | Robust in-browser parsing |
| PDF | jsPDF + jspdf-autotable | Client-side, so claim PDFs work offline |
| Validation | zod | Same schemas validate client forms and server input |
| Brand | Tokens in `brand/tokens.css`; Bricolage Grotesque (display) + Inter (UI, amounts) self-hosted via Fontsource | Enforced by REQ-BRAND-01..04 |
| Server | Hono on Cloudflare Workers (also serves the built PWA) | Tiny, TypeScript-native, free, no idle sleep |
| Server DB | Cloudflare D1 (SQLite); receipts as BLOB (or base64 text) rows | Free, persistent, no separate DB service; 2 MB per-row limit (REQ-NFR-07) |
| Tests | Vitest (unit + API), Playwright (a few smoke tests) | Spec-to-test traceability |
| Deploy | `wrangler deploy` to Cloudflare (free plan); GitHub holds source only | HTTPS is required for PWA install and Share Target |

Build plumbing that belongs to the tools above (not separate choices): `@tailwindcss/vite` (Tailwind v4), `@cloudflare/vite-plugin` (runs the Hono Worker and local D1 inside `vite dev`/`preview`), `workbox-*` (the service worker of vite-plugin-pwa), `@fontsource-variable/*` (brand fonts), `@playwright/test`.

Not chosen: Next.js (server-component complexity, poor offline story), separate Postgres/Supabase (more accounts and keys), native apps (time), GitHub Pages (static files only: cannot store submitted claims for the reviewer), Render free tier (local files and SQLite are wiped on every spin-down, so review links would vanish). Server code is written against a small `ClaimRepo` interface so API tests run without Cloudflare and the host can be swapped later.

### 5.2 Repository layout

```
Research-Expense-Tracker/
├── SPEC.md               # this file: what/why, architecture, model, requirement index
├── PLAN.md               # milestones, schedule, cut-line, prompts for Claude Code
├── brand/                # BRAND.md, logo SVGs, tokens.css: source of truth for the look
├── CLAUDE.md             # standing instructions for Claude Code
├── README.md             # how to run / deploy (filled in M0)
├── specs/                # detailed requirements + acceptance criteria
│   ├── 01-setup-and-balance.md
│   ├── 02-live-tracking.md
│   ├── 03-statement-claim.md
│   ├── 04-rules-engine.md
│   ├── 05-claim-and-review.md
│   ├── 06-offline-pwa.md
│   └── 07-branding.md
├── src/
│   ├── shared/           # pure TS: types, money, dates, rules, receipt-text parser, csv helpers
│   ├── client/           # React PWA: app/, features/{setup,live,statement,claim}/, db/, sw/, lib/
│   └── server/           # Hono API, SQLite, seed data
├── tests/{unit,api,e2e}/ # test titles contain REQ IDs
├── migrations/           # D1 SQL migrations
├── wrangler.jsonc        # Cloudflare deploy config
├── fixtures/             # synthetic sample CSV, synthetic screenshots, OCR text samples
└── scripts/              # trace.ts (spec→test coverage check), seed helpers
```

Module rules: `shared` imports nothing from `client` or `server`. `client` and `server` import from `shared` only. No real personal or bank data in `fixtures/`.

## 6. Domain model (source of truth: `src/shared/types.ts`, mirrored here)

Conventions: money is an **integer in paise** (never floats); dates are calendar dates `YYYY-MM-DD` with no timezone conversion; ids are UUIDs.

```ts
type CategoryId = 'registration' | 'airfare' | 'rail_bus' | 'local_transport'
                | 'accommodation' | 'meals' | 'visa_insurance' | 'other';

interface Grant {
  id; name; sponsor; currency: 'INR';
  totalMinor: number;            // sanctioned amount
  utilisedBeforeMinor: number;   // already spent before using RET
  startDate; endDate;
  rules: GrantRules;
}
interface GrantRules {
  travelBufferDays: number;      // allowed days before/after the conference
  categories: Record<CategoryId, { eligible: boolean; capPerTripMinor?: number; requiresProof: boolean }>;
}
interface Trip { id; grantId; name; city; country; startDate; endDate; budgetMinor?;
  fxRatesMicro?: Record<string, number> }   // default estimated INR per 1 unit of currency × 1,000,000

interface GrantDocument { id; grantId; name; mime; sizeBytes; sha256; blobKey; includeInPack: boolean }   // stored only, never parsed

interface Expense {
  id; tripId; date; payee; categoryId; note?; reference?;   // reference = UPI/UTR/txn id
  // Original amount as paid (minor units per ISO 4217; e.g. paise, cents, JPY has none):
  originalMinor: number; originalCurrency: string;          // 123450 'INR'  or  8900 'EUR'
  // INR amount used for the balance:
  inrMinor: number;              // = originalMinor if INR; else originalMinor × estimatedRateMicro / 1e6 (integer math, half-up); replaced by the statement debit once matched
  inrStatus: 'pending' | 'confirmed';     // pending = from proof/estimate, not yet matched to a statement row; confirmed = matched (REQ-CSV-08)
  paymentMode: 'bank' | 'cash';           // cash items have no statement row (REQ-RULE-13)
  estimatedRateMicro?: number;   // INR per 1 unit of originalCurrency × 1,000,000 (user-entered)
  statementRef?: StatementRef;   // set when matched to a statement row → inrMinor = debit, inrStatus 'confirmed'
  source: 'proof' | 'manual' | 'statement';
  attachments: Attachment[]; excluded: boolean; createdAt; updatedAt;
}
interface StatementRef { date; narration; debitMinor; refNo?; rowHash }   // only these fields ever leave the device
interface Attachment { id; kind: 'proof' | 'supporting_doc';
  proofType?: 'upi_screenshot' | 'card_alert' | 'invoice' | 'ticket' | 'other';
  mime; sha256; width?; height?; blobKey }
interface InboxItem { id; kind: 'file' | 'text'; receivedAt; proofType?;      // shared proofs awaiting confirmation
  blobKey?; name?; mime?; sizeBytes?; sha256?; tooLarge?;                     // file items
  text? }                                                                      // text items: already scrubbed of card digits and available-limit text (REQ-CAP-13)

interface Flag { ruleId; severity: 'info' | 'warn' | 'error'; message; itemId }
interface ClaimItem { id; date; description;
  amountMinor: number;                       // statement INR debit (REQ-CLM-08)
  originalMinor?: number; originalCurrency?: string;   // shown for information on foreign items
  categoryId; reference?; statementRef?: StatementRef; attachmentIds: string[]; justification? }
interface ClaimDraft { grant: Grant; trip: Trip; claimant: { name; email; employeeId? }; items: ClaimItem[]; grantDocIds: string[] }

interface SubmittedClaim {
  id; revision; status: 'submitted' | 'in_review' | 'approved' | 'partially_approved' | 'rejected';
  submittedAt; draft: ClaimDraft; flags: Flag[];
  reviews: Record<string /*itemId*/, { decision: 'approved' | 'rejected' | 'query'; comment? }>;
  overallComment?; decidedAt?; reviewToken; ownerToken;
}
```

**Balance formulas (REQ-BAL-01, REQ-BAL-06):**
`confirmedSpent = Σ inrMinor of non-excluded expenses with inrStatus = 'confirmed'`
`pendingSpent = Σ inrMinor of non-excluded expenses with inrStatus = 'pending'`
`remaining = grant.totalMinor − grant.utilisedBeforeMinor − confirmedSpent − pendingSpent` (shown with the pending part called out, e.g. "₹58,400 left · ₹6,200 of spend is pending verification")

**Claim amount rule (REQ-CLM-08):** a claim item's amount is the *statement INR debit*. Every bank-paid expense (domestic or foreign) must be matched to a statement row before it can be claimed (REQ-RULE-11). Cash expenses have no statement row; they are allowed with a warning and a written justification (REQ-RULE-13).

## 7. Core flows

**A. Live tracking.** Setup grant (+ grant documents) + trip → share/pick/paste proof (UPI screenshot, card SMS text or screenshot, invoice, ticket) → lands in *Inbox* → recognition prefills amount, date, payee, reference where it can → the app *suggests* a category from the merchant name (REQ-CAP-14) and the user confirms (foreign spend: original amount + currency + estimated rate) → expense saved, balance updates (confirmed vs pending) → rule flags inline.

**B. Statement claim.** Choose/create grant + trip → upload CSV → map columns → table filtered to trip window → **reconcile**: tracked expenses are matched to statement debits and become *confirmed* → tick any other relevant rows, assign categories, optionally redact descriptions/attach receipts → flags → claim preview. Works without any Segment A data (statement-only).

**Matching (details in `specs/03`):** INR items match on exact amount with date within ±2 days; foreign items are *suggested* by nearest INR amount to the estimate and always need the user's confirmation.

**Shared end.** Claim preview ("what the reviewer will see") → export PDF (offline-capable) → Submit (queued if offline) → review link + owner link → reviewer decides → researcher sees status.

## 8. Requirement index

Priority: **M**ust / **S**hould / **C**ould. Status: draft → agreed → built → verified. Statements and acceptance criteria live in the sub-spec.

| ID | Title | Pri | Spec |
|---|---|---|---|
| REQ-SET-01 | Create/edit/delete grant | M | 01 |
| REQ-SET-02 | Create trip linked to one grant | M | 01 |
| REQ-SET-03 | Categories with eligibility, caps, proof flag | M | 01 |
| REQ-SET-04 | Edit grant rules in UI | S | 01 |
| REQ-SET-05 | Several trips per grant | S | 01 |
| REQ-SET-06 | Foreign-currency expense with estimated rate | M | 01 |
| REQ-SET-07 | Grant documents: store files against a grant (no recognition) | M | 01 |
| REQ-SET-08 | Choose which grant documents go into the claim pack | S | 01 |
| REQ-BAL-01 | Grant balance calculation and live update | M | 01 |
| REQ-BAL-02 | Balance indicator states (text + colour) | M | 01 |
| REQ-BAL-03 | Per-category cap bars | S | 01 |
| REQ-BAL-04 | Trip budget remaining | S | 01 |
| REQ-BAL-05 | "Balance after this expense" preview on confirm | C | 01 |
| REQ-BAL-06 | Confirmed vs pending-verification split | M | 01 |
| REQ-CAP-01 | Manual add expense | M | 02 |
| REQ-CAP-02 | Add proof via picker/camera/files (multi) | M | 02 |
| REQ-CAP-03 | Receive proof (images, PDFs, text) via OS share sheet | S | 02 |
| REQ-CAP-04 | Inbox of unconfirmed proofs | M | 02 |
| REQ-CAP-05 | On-device OCR prefill for screenshots (reliable on UPI/SMS-style formats) | M | 02 |
| REQ-CAP-06 | Trip expense list: group, edit, delete, view | M | 02 |
| REQ-CAP-07 | Duplicate detection | S | 02 |
| REQ-CAP-08 | Extra supporting documents per expense | S | 02 |
| REQ-CAP-09 | Paste / drag-drop proof on desktop | C | 02 |
| REQ-CAP-10 | Image compression and EXIF stripping | S | 02 |
| REQ-CAP-11 | Local persistence across reload/offline | M | 02 |
| REQ-CAP-12 | Backup export/import (JSON) | S | 02 |
| REQ-CAP-13 | Paste or share SMS/notification text → parse (no OCR needed) | M | 02 |
| REQ-CAP-14 | Category suggestion from merchant, learned per payee; user confirms | M | 02 |
| REQ-CAP-15 | Up to three suggested values per field from recognised text, one tap to apply | M | 02 |
| REQ-CAP-16 | Learn payee spellings and message formats from confirmed expenses | S | 02 |
| REQ-CSV-01 | Upload and parse CSV in-browser | M | 03 |
| REQ-CSV-02 | Column mapping and date format | M | 03 |
| REQ-CSV-03 | Transaction table: search, window filter, select | M | 03 |
| REQ-CSV-04 | Assign category (bulk) | M | 03 |
| REQ-CSV-05 | Selected rows become a ClaimDraft | M | 03 |
| REQ-CSV-06 | Edit/redact description per row | S | 03 |
| REQ-CSV-07 | Attach receipt per selected row | S | 03 |
| REQ-CSV-08 | Reconcile tracked expenses with statement rows (confirms INR) | M | 03 |
| REQ-CSV-09 | Tolerate preamble, bad rows, delimiters | M | 03 |
| REQ-CSV-10 | Bundled synthetic sample CSV | M | 03 |
| REQ-RULE-01 | Pure, deterministic `evaluate()` shared client/server | M | 04 |
| REQ-RULE-02 | DATE_OUT_OF_WINDOW | M | 04 |
| REQ-RULE-03 | OVER_CATEGORY_CAP | M | 04 |
| REQ-RULE-04 | OVER_GRANT_BALANCE | M | 04 |
| REQ-RULE-05 | CATEGORY_NOT_ELIGIBLE | M | 04 |
| REQ-RULE-06 | MISSING_PROOF | M | 04 |
| REQ-RULE-07 | DUPLICATE | S | 04 |
| REQ-RULE-08 | FOREIGN_CURRENCY_NO_RATE | M | 04 |
| REQ-RULE-09 | Severity model and justification text | M | 04 |
| REQ-RULE-10 | Thresholds come from grant config | S | 04 |
| REQ-RULE-11 | UNVERIFIED_AMOUNT (bank-paid expense not matched to a statement debit) | M | 04 |
| REQ-RULE-12 | UNCATEGORISED | M | 04 |
| REQ-RULE-13 | CASH_NOT_IN_STATEMENT (warn; needs justification) | S | 04 |
| REQ-CLM-01 | Claim preview = exactly what reviewer sees | M | 05 |
| REQ-CLM-02 | Claim pack PDF (client-side) | M | 05 |
| REQ-CLM-03 | Claimant details and declaration | M | 05 |
| REQ-CLM-04 | Submit; queued when offline | M | 05 |
| REQ-CLM-05 | CSV export of claim items | S | 05 |
| REQ-CLM-06 | Submitted claim immutable; resubmit as revision | S | 05 |
| REQ-CLM-07 | Researcher sees claim status | S | 05 |
| REQ-CLM-08 | Claim amount = statement INR debit; statement line shown per item | M | 05 |
| REQ-REV-01 | Reviewer opens link, read-only pack | M | 05 |
| REQ-REV-02 | Per-item approve/reject/query + comment | M | 05 |
| REQ-REV-03 | Overall decision; lock after decision | M | 05 |
| REQ-REV-04 | Receipt image viewer | M | 05 |
| REQ-REV-05 | Approved total recomputed | S | 05 |
| REQ-REV-06 | Reviewer PDF download | C | 05 |
| REQ-REV-07 | Unguessable tokens, noindex, rate limit | M | 05 |
| REQ-OFF-01 | Installable PWA (optional "Add to Home Screen") | S | 06 |
| REQ-OFF-02 | Segments A and B fully work offline | M | 06 |
| REQ-OFF-03 | Share Target handled offline by service worker | S | 06 |
| REQ-OFF-04 | Outbox with retry and visible state | S | 06 |
| REQ-OFF-05 | OCR assets self-hosted and precached | S | 06 |
| REQ-OFF-06 | Update prompt for new versions | S | 06 |
| REQ-OFF-07 | Online/offline indicator | M | 06 |
| REQ-OFF-08 | Request persistent storage | S | 06 |
| REQ-PRIV-01 | Nothing leaves device before explicit Submit | M | SPEC §9 |
| REQ-PRIV-02 | Only selected items + attachments transmitted | M | SPEC §9 |
| REQ-PRIV-03 | Pre-submit "what reviewer will see" screen | M | SPEC §9 |
| REQ-PRIV-04 | Strip image metadata | S | SPEC §9 |
| REQ-PRIV-05 | No third-party scripts/CDNs/analytics at runtime | M | SPEC §9 |
| REQ-PRIV-06 | Black-box redaction on screenshots | C | SPEC §9 |
| REQ-BRAND-01 | Logo lockup in the header of every page (one AppShell) | M | 07 |
| REQ-BRAND-02 | Brand fonts, self-hosted, ₹-safe, tabular amounts | M | 07 |
| REQ-BRAND-03 | Colours only from brand tokens | M | 07 |
| REQ-BRAND-04 | Loading screen with slogan, shown only while loading | M | 07 |
| REQ-BRAND-05 | Branded PDF, manifest, icons | S | 07 |
| REQ-DEMO-01 | Public HTTPS URL + landing page with two entry points | M | SPEC §10 |
| REQ-DEMO-02 | "Load demo data" (watermarked synthetic screenshots) | M | SPEC §10 |
| REQ-DEMO-03 | Seeded sample claim with fixed review link | M | SPEC §10 |
| REQ-DEMO-04 | Sample CSV download | M | SPEC §10 |
| REQ-DEMO-05 | Demo fixtures recognised by the parser (synthetic UPI-style screenshot, card SMS) | M | SPEC §10 |
| REQ-NFR-01 | Mobile-first (works from 360 px wide) | M | SPEC §11 |
| REQ-NFR-02 | Accessibility basics | S | SPEC §11 |
| REQ-NFR-03 | Performance targets | S | SPEC §11 |
| REQ-NFR-04 | Integer money arithmetic only | M | SPEC §11 |
| REQ-NFR-05 | Dates are calendar dates, no TZ shifts | M | SPEC §11 |
| REQ-NFR-06 | Every MUST has a test citing its ID | M | SPEC §11 |
| REQ-NFR-07 | Input validation and upload limits | M | SPEC §11 |
| REQ-NFR-08 | Browser support matrix honoured | M | SPEC §11 |

## 9. Cross-cutting: privacy requirements

- **REQ-PRIV-01** — The system shall not transmit expenses, screenshots, CSV contents or grant data to any server before the user explicitly taps *Submit claim*.
- **REQ-PRIV-02** — On submit, the system shall transmit only the selected claim items, their attachments and the claimant/grant/trip fields shown in the preview. For statement evidence only the selected rows' date, (user-editable) narration, debit amount and reference are transmitted; the balance column, account number, other columns and unselected rows are never transmitted.
- **REQ-PRIV-03** — Before submit the system shall show the exact content the reviewer will see and require explicit confirmation.
- **REQ-PRIV-04** — Images shall be re-encoded on import so EXIF/location metadata is dropped.
- **REQ-PRIV-05** — At runtime the app shall load no third-party scripts, fonts, analytics or CDN assets.
- **REQ-PRIV-06** (could) — The user can draw black boxes over parts of a screenshot (e.g., account balance) before attaching it.

Acceptance (all): verified by an API test that inspects the submit payload and by an offline/network-inspector check in M4.

## 10. Cross-cutting: demo and deployment

- **REQ-DEMO-01** — A public HTTPS URL serves the app. The landing page has *Researcher* and *Reviewer (sample claim)* entry points and a one-paragraph explanation.
- **REQ-DEMO-02** — *Load demo data* creates a sample grant (with a sample grant document), trip and expenses (domestic INR items, one card-SMS item and one foreign-currency card expense, all left *pending verification*) with synthetic proofs, each clearly watermarked "SAMPLE". No real brand screens or real data.
- **REQ-DEMO-03** — On first boot the server seeds a sample submitted claim reachable via a fixed review link shown on the landing page (so the reviewer view can be demoed even if the DB resets).
- **REQ-DEMO-04** — A synthetic sample bank CSV can be downloaded from the statement segment. It has a preamble block, domestic debits, unrelated personal rows, and debits matching every demo bank-paid expense (the foreign one with an INR amount different from its estimate), so reconcile and privacy filtering can be demoed.
- **REQ-DEMO-05** [built] — `fixtures/` contains a generic UPI-style payment-success screenshot, a card-alert SMS (text and image) and a foreign invoice image, all synthetic and watermarked. The recognition step extracts amount, date, payee and reference from the first two correctly (this is the demo's recognition proof). Fixtures use generic layouts, never copies of real bank or UPI app screens.
- **Hosting (D-1, resolved).** Cloudflare free plan: one Worker serves the built PWA and the API, and a D1 database stores submitted claims. HTTPS is included (needed for PWA install, Share Target and the service worker). GitHub holds the source only: GitHub Pages serves static files and cannot store claims. Free-plan limits that matter: 2 MB per row, 100,000 row-writes per day, 50 queries per request (use `batch`). REQ-DEMO-03 still seeds the sample claim so the reviewer view works on an empty database. Confirm at signup that no payment card is needed.

## 11. Cross-cutting: non-functional requirements

- **REQ-NFR-01** Mobile-first; usable from 360 px width; touch targets ≥ 44 px.
- **REQ-NFR-02** Form labels, keyboard focus, contrast ≥ 4.5:1, status never conveyed by colour alone.
- **REQ-NFR-03** First load under ~3 s on a good 4G connection (excluding OCR assets); OCR of one screenshot under ~10 s on a mid-range phone (targets, measure in M4).
- **REQ-NFR-04** [built] All money is integer minor units (paise for INR); no floating-point arithmetic on amounts. FX estimates use integer micro-rates (rate × 10⁶) with half-up rounding; formatting only at the UI edge.
- **REQ-NFR-05** Dates are `YYYY-MM-DD` calendar dates compared as strings; times are display-only (default Asia/Kolkata).
- **REQ-NFR-06** [built] `npm run trace` reads the MUST list from this index and reports how many have a test whose title contains their ID. It fails if a requirement marked `built` or `verified` has no such test, or if a test title cites an ID that is not in this index. `npm run trace -- --strict` fails if *any* MUST has no test; it is the M5 gate (a plain `trace` cannot be green from M0 on, because unbuilt MUSTs have no tests yet).
- **REQ-NFR-07** All server input validated with zod; each stored file ≤ 1 MB after compression (D1 allows 2 MB per row), ≤ 40 attachments and ≤ 25 MB per claim.
- **REQ-NFR-08** Primary: Chrome/Edge on Android and desktop. Supported with fallbacks: Safari on iOS (no share-to-app; use picker). Best effort: Firefox.

### Device support matrix (verify on real devices in M4)

| Capability | Android Chrome (installed PWA) | iOS Safari (Add to Home Screen) | Desktop Chrome/Edge |
|---|---|---|---|
| App works offline after first visit | Yes | Yes (browser may evict storage; see REQ-OFF-08) | Yes |
| Share proof (image/PDF/text) into app | Yes (Web Share Target) | **No**, as far as known; use picker / paste text | n/a: paste / drag-drop |
| On-device OCR offline | Yes | Yes (slower) | Yes |
| Build PDF offline | Yes | Yes | Yes |
| Submit / reviewer view | Needs internet | Needs internet | Needs internet |

## 12. Spec-driven workflow and traceability

**Loop (Claude chat for specs, Claude Code for code):**
1. Discuss a feature area in Claude chat → write/refine its sub-spec in `specs/`. Set requirement status to *agreed*.
2. In Claude Code: "Implement REQ-XXX-nn..nn from specs/NN-*.md" — Claude Code reads `CLAUDE.md`, `SPEC.md`, and that sub-spec only.
3. Tests are written from the acceptance criteria; test titles contain the REQ ID.
4. `npm test` and `npm run trace` pass → set status *built*; after a manual check on a real device/browser → *verified*.
5. Commit with the IDs in the message (`REQ-BAL-01, REQ-BAL-02: grant balance gauge`).

**Change protocol.** If the code reveals the spec is wrong, edit the spec first (add a Changelog line), then change the code. Never leave code that no requirement justifies.

**Requirement template (use in sub-specs):**

```
### REQ-XXX-NN — Title                         [MUST|SHOULD|COULD] [draft|agreed|built|verified]
The system shall ...
Acceptance:
- Given ... When ... Then ...
Notes: rationale, edge cases
Tests: tests/unit/<file>.test.ts
```

## 13. Milestones
See `PLAN.md` (M0 skeleton+deploy → M1 setup & live tracking → M1b share target & OCR → M2 rules & CSV → M3 claim, PDF, review → M4 offline hardening & device test → M5 freeze & submission).

## 14. Open decisions

| # | Decision | Default if unanswered |
|---|---|---|
| D-1 | ~~Hosting~~ **Resolved 2026-10-25:** Cloudflare Workers + D1 free plan (confirm no card needed at signup); GitHub for source | — |
| D-2 | ~~Currency scope~~ **Resolved 2026-10-25:** foreign-currency spend is in scope (MUST); claimed amount = statement INR debit (authority's rule) | — |
| D-3 | (Optional, after the demo works) Which UPI/banking apps and card-alert SMS formats do you use? Typing out the text of 3–5 messages/screens with names and numbers replaced is enough to tune the parser (do not commit real ones) | Generic patterns: ₹ amount, date, "Paid to", UTR/Txn ID, card-SMS "INR x spent on card … at MERCHANT"; the demo uses synthetic fixtures |
| D-4 | What does your real grant authority require in a claim (fields, sanction number, declaration wording)? | Generic wording in REQ-CLM-03 |
| D-5 | Reviewer access: link only, or link + passcode | Link only |
| D-6 | ~~App name~~ **Resolved 2026-10-25:** ExpRes, slogan "Breeze through grant-handling grunt work" (loading screen only) | — |
| D-7 | ~~Deadline and deliverables~~ **Resolved 2026-10-25:** final deploy by Mon 2026-10-26 22:00 IST; deliverable = the working app passing the demo runthrough (§1) | — |
| D-8 | Must every bank-paid expense (INR too) be matched to a statement row before it is claimed? | **Yes (applied in v0.3):** the statement debit is the claimed amount; cash items are allowed with a warning + justification. Say if you want proof-alone for INR instead |
| D-9 | ~~Proof types~~ **Resolved 2026-10-25:** the authority accepts card SMS/notification screenshots and invoices; the reviewer sees the proof type | — |

## 15. Glossary

**Grant** funding sanction with a total amount and rules. **Trip** a conference visit linked to one grant. **Claim pack** the PDF + online record of selected expenses submitted to a reviewer. **Proof** any evidence attached to an expense: UPI/bank screenshot, card SMS/notification screenshot, invoice, ticket or receipt. **Statement INR debit** the INR amount the bank debited, as shown on the statement; the amount the authority accepts. **Reconcile** match tracked expenses to statement rows so pending amounts become confirmed INR amounts. **Pending verification** an amount taken from a proof or an estimate that is not yet matched to a statement row. **Flag** a rule-check result on a claim item. **Inbox** shared proofs not yet confirmed as expenses. **Outbox** claims waiting to be sent when online. **PWA** a website that can be installed and run offline.

## Changelog

- 2026-10-26 v0.4.11 — Reproduced the owner's stuck phone and laptop: a device that held release A and received B (updates wait for a tap) stayed on A for ever, because A's page has no update bar. Service workers now ask open pages whether they can offer an update and take over at once when none can; verified by simulating A→B, A→C and A→B→C against real builds. Settings shows the build and has "Refresh app files". One extra reload is still needed to leave the stuck state.
- 2026-10-26 v0.4.10 — Two defects found on the owner's devices. (1) Inbox rows put the thumbnail, text, a 176 px dropdown and a link on one line, so on a phone the text got 0 px width and printed one letter per line: the text now has its own row above the controls. (2) After a release the desktop kept showing the old version until a second reload, because the service worker swapped versions silently: REQ-OFF-06 is built, so a bar says "New version available" and the new version is applied only when the user taps Reload. A one-time double reload is still needed to move off the old behaviour.
- 2026-10-26 v0.4.9 — iPhone (HEIC) photos are accepted and converted to JPEG on import where the browser can open them (REQ-CAP-02, REQ-SET-07); elsewhere they are skipped with a clear message. Trying it on WebKit, the engine of Safari on iOS, showed that some browsers cannot keep a Blob in IndexedDB, so files are then kept as bytes (REQ-CAP-11). The browser suite now also runs on WebKit (`npm run test:e2e:safari`); 109 of 110 tests passed on first run.
- 2026-10-26 v0.4.8 — Recognition problems are now shown as a red warning with the reason and a "Try again" button (found when a read failed on the owner's device without saying why); a stuck read stops after two minutes. The same-invoice-twice case showed that REQ-CAP-07 (duplicate detection) is still unbuilt.
- 2026-10-26 v0.4.7 — REQ-CAP-15 (suggested values per field) and REQ-CAP-16 (learning) `built`. Checked on the owner's real receipt photo (kept out of the repository): the total, shop, date and invoice number now come out, where the unprepared read lost the shop name and misread 560.00 as 60.00. A date whose day had to be guessed ("72" for 22) is offered as chips and never prefilled. Alternatives for the amount must be plausible next to the leading one. A synthetic degraded receipt (`fixtures/receipt-photo.jpg`: shadow, tilt, blur, grain) replaces real invoices in the tests. Dexie schema is now version 2 (payee spellings, message formats), migrating existing data in place.
- 2026-10-26 v0.4.6 — Tried on a real photographed receipt: the tap-the-words design (REQ-CAP-15) showed hundreds of words and made more work than paper, so it is replaced by up to three suggested values per field. The photo also read badly (`560.00` as `60.00`, "August" as "hugust"), so recognition now preprocesses images (contrast stretch and adaptive threshold, orientation and size handled), matches month names approximately and repairs look-alike characters. REQ-CAP-16 now has acceptance criteria (payee spelling memory and message-format memory, local, with a Settings control) and is built now, ahead of the original schedule.
- 2026-10-26 v0.4.5 — M1b. REQ-CAP-05 (recognition), REQ-OFF-05 (self-hosted, background-cached recognition data), REQ-DEMO-05 (fixtures) and REQ-CAP-03 / REQ-OFF-03 (share target; phone check pending) marked `built`. OFF-02 precache wording reconciled with OFF-05 (recognition data is cached in the background, not at install). Tesseract drops the ₹ sign, so the parser accepts a standalone money-formatted number when no marked amount exists. The share target needs a real Android check before it can be `verified`.
- 2026-10-26 v0.4.4 — Banks' SMS formats cannot all be anticipated, and sending text to a model would break REQ-PRIV-01. Added REQ-CAP-15 (tap words to assign them to a field: the guarantee, MUST) and REQ-CAP-16 (learn anchor words from corrections: SHOULD, scheduled after M1b).
- 2026-10-26 v0.4.3 — Owner's real SMS ("Rs 2399 spent@ ABDUSROLLS on 25OCT26 … Bal Rs.123456 Ref 34567") exposed format-specific parsing: payee after "@", dates without separators, short references, and balance figures left in the stored text. Parser widened and balances now scrubbed (REQ-CAP-13). Same session: REQ-RULE-02 built early, so a date outside the trip window warns in the form and flags the expense (REQ-CAP-06 chip and filter, REQ-SET-02 re-evaluation).
- 2026-10-26 v0.4.2 — M1 build. REQ-SET-01/02/03/06/07, BAL-01/02/06, CAP-01/02/04/06/11/13/14 marked `built`. Edits: flag icon and *flagged only* filter (CAP-06) and date-window flags on trip edit (SET-02) move to M2 with the rules engine; BAL-02 contrast is checked for the light theme (the brand has no dark theme); `InboxItem` gained `kind`, `text`, `proofType`, `name`, `mime`, `sizeBytes`, `sha256`, `tooLarge`; a confirmed text proof is stored as a `text/plain` attachment. REQ-DEMO-02 is partly built (sample grant, document, trip and four pending expenses; SMS proof is text, screenshot recognition arrives in M1b).
- 2026-10-25 v0.4.1 — M0 build. REQ-NFR-06 reworded so `npm run trace` can stay green during the build (fails on built-but-untested requirements; `--strict` checks all MUSTs at M5); statuses `built` recorded inline for NFR-04 and NFR-06; build-plumbing packages listed under §5.1. REQ-BRAND-04 slogan rule clarified in `specs/07-branding.md` (loading markup is in `index.html`, outside `src/`).
- 2026-10-25 v0.1 — Initial structure, stack, model, requirement index.
- 2026-10-25 v0.4 — Branding: product named ExpRes; logo, colour and type prototype approved as the starting point; added `brand/` and `specs/07-branding.md` (REQ-BRAND-01..05); D-6 resolved.
- 2026-10-25 v0.3.1 — The app is a hosted website; nothing needs installing. Installability (OFF-01) and share-to-app (CAP-03, OFF-03) demoted to SHOULD because of a budget of 3 Android checks; offline use (OFF-02) stays MUST via the service worker. Specs 01, 02, 06 agreed.
- 2026-10-25 v0.3 — Decisions: Cloudflare Workers + D1 hosting (GitHub for source), final deploy Mon 22:00 IST, deliverable = demo runthrough (§1). Added grant documents (SET-07/08), SMS text path (CAP-13), category suggestion (CAP-14), OCR to MUST (CAP-05), UNCATEGORISED/CASH rules (RULE-12/13), DEMO-05. Every bank-paid expense must match a statement row (D-8): `inrStatus` is now `pending|confirmed`, RULE-11 renamed UNVERIFIED_AMOUNT. OFF-04 outbox demoted to SHOULD. New schedule in PLAN.md.
- 2026-10-25 v0.2 — Foreign spend rework: proof-based tracking (not only UPI), foreign-currency estimates (SET-06 → MUST), reconcile with statement (CSV-08 → MUST), new BAL-06, RULE-11, CLM-08; claimed amount = statement INR debit; sub-spec 03 renamed `03-statement-claim.md`; D-2 resolved, D-8/D-9 added.
