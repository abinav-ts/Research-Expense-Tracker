# PLAN — schedule to final deploy (Claude chat for specs, Claude Code for implementation)

**Final deploy: Mon 2026-10-26 22:00 IST.** Deliverable: the deployed app passing the **demo runthrough** in SPEC §1 (grant + grant documents → proofs/SMS recognised, balance moves → fake bank statement verification → pack export → reviewer view).

## What changes when Claude does the coding

| Before | Now |
|---|---|
| Hours were limited by typing code | Hours are limited by **your decisions, reviewing, and testing on a real phone** |
| Deploy at the end | **Deploy at the end of M0** and keep it live; HTTPS is required for install and share-to-app, so phone testing starts early |
| Big-bang build | **Vertical slices**: each milestone ends with something you can demo on the live URL |
| Spec written once | Spec is a living contract: each milestone starts by finalising its sub-spec in chat |
| Tests at the end | Tests are written with each requirement; `npm run trace` guards coverage |

## Schedule (IST)

| When | Milestone | Requirements | Exit check |
|---|---|---|---|
| Sun 17:00–19:00 | **P0 Spec + setup** (chat) | Acceptance criteria for specs 01, 02, 06; install tools; create accounts | Node.js LTS + Git installed; GitHub and Cloudflare accounts ready |
| Sun 19:00–21:30 | **M0 Walking skeleton** | NFR-04/06; BRAND-01..04 | Scaffold, branded AppShell + loading screen, `npm test/trace/build/deploy`, Worker + D1 deployed, landing page with two entry points, offline-capable app shell (service worker), `/api/health`, live URL opens on your phone |
| Sun 21:30–01:30 | **M1 Setup + live tracking** | SET-01..03,06,07; BAL-01,02,06; CAP-01,02,04,06,11,13,14; partial DEMO-02 | Create grant + documents + trip; add manual, pasted-SMS and foreign-currency expenses; balance moves; category suggested |
| Mon 01:30–08:00 | **Sleep** | | No unattended agent runs |
| Mon 08:00–10:00 | **M1b Recognition (+ optional share)** | CAP-05; OFF-05; DEMO-05; CAP-03/OFF-03 as one time-boxed attempt | Synthetic UPI-style screenshot is recognised; paste works. Share-to-app tried once on Android (phone check 1); cut if it fails |
| Mon 10:00–13:30 | **M2 Rules + statement claim** | RULE-01..06,08,09,11,12; CSV-01..05,08,09,10 | Fake statement CSV reconciles tracked expenses; balance updates; flags shown |
| Mon 13:30–16:30 | **M3 Claim, PDF, submit, review** | CLM-01..04,08; REV-01..04,07; PRIV-01..03; DEMO-03 | Submit → review link → decisions visible to the researcher |
| Mon 16:30–18:30 | **M4 Offline + demo data + device test** | OFF-02,07 (+ OFF-01 if time); DEMO-01,02,04; airplane-mode test | Full runthrough on phone and laptop. **Feature freeze 18:30.** |
| Mon 18:30–21:00 | **M5 Rehearse + polish** | NFR-06 `npm run trace -- --strict` green; README | Three clean runthroughs on the deployed URL in a fresh browser |
| Mon 21:00–22:00 | **Final deploy + check** | | Deployed, verified from a second device, nothing new merged |

**Checkpoint Mon 13:30:** if M2 is not done, apply the cut-line before starting M3.

## Phone checks (budget: 3 Android sessions)
The app is a website: nothing is downloaded or installed unless you choose to. Use Chrome's desktop "device toolbar" for layout checks; spend Android time only on what a laptop can't show.
1. **Mon ~10:00 (after M1b):** open the live URL on Android, add a photo via the picker and a pasted SMS, and try share-to-app once (needs "Add to Home Screen" first). Decide keep or cut share-to-app.
2. **Mon ~17:00 (M4):** full demo runthrough on the phone, including airplane mode.
3. **Mon ~20:00 (M5):** final check on the deployed URL.

## Human tasks (Claude can't do these)
- **P0:** install Node.js LTS and Git; create a GitHub account/repo and a Cloudflare account (confirm the free plan needs no card).
- **Every milestone:** open the deployed URL on your phone and click through the milestone's exit check.
- **M4:** airplane-mode test, and test on every device you have (iPhone differs, see SPEC §11).
- Optional, after the demo works: type out 3–5 real SMS/screen texts (names and numbers replaced) to tune the parser (D-3).

## Cut-line (if behind, cut in this order)
1. All COULD items.
2. SHOULD items: SET-08, CAP-07/08/10/12, CSV-06/07, CLM-05/06/07, BAL-03/04, RULE-13, OFF-04/05/06/08.
3. Share-to-app (CAP-03, OFF-03) if the single Android attempt fails: picker and paste cover the same need.
4. OCR (CAP-05): paste-text parsing (CAP-13) still shows recognition; tell the professor the screenshot path is not included.
5. Never cut: privacy core (PRIV-01..03), balance indicator, reconcile (CSV-08), MUST rules, claim PDF, reviewer view, deployed demo.

## Risks and mitigations
- **Tighter schedule (no buffer after 22:00):** the demo runthrough defines the MUST set; use the cut-line early rather than late.
- **Cloudflare/D1 specifics are new to Claude Code sessions:** M0 proves deploy + a D1 read/write before anything else depends on it. Server code uses a `ClaimRepo` interface; fallback is Node + SQLite on another host.
- **iOS has no share-to-app:** picker and paste-text fallbacks; say so in the demo.
- **Reconcile complexity:** keep matching in a pure, tested function (`reconcile.ts`); statement-only path is the fallback.
- **OCR accuracy:** demo uses synthetic fixtures with generic layouts; real apps need tuning with samples (D-3). The confirm form always works.
- **Claude Code scope creep:** it must cite REQ IDs (CLAUDE.md); review the summary after each task.
- **Claude usage limits during a long push:** focused prompts, one sub-spec at a time, fresh session between milestones.

## Prompts to paste into Claude Code

**M0:** "Read CLAUDE.md, SPEC.md and PLAN.md. Implement milestone M0 exactly as described: scaffold the stack in SPEC §5.1 (Vite+React+Tailwind PWA, Hono on Cloudflare Workers with static assets, D1 with a migration, wrangler config), npm scripts dev/test/build/deploy/trace (trace checks every MUST REQ ID in SPEC.md appears in a test title), a landing page with two entry points, an installable PWA with offline shell, `/api/health` that does a D1 read and write, one money utility with a test citing REQ-NFR-04, and the branding in specs/07-branding.md and brand/BRAND.md (AppShell with the logo on every route, tokens-only Tailwind theme, self-hosted fonts, loading screen with the slogan, scripts/check-brand.ts). Then walk me through deploying it, telling me each step I must do myself."

**Later milestones:** "Read CLAUDE.md and SPEC.md, then specs/0N-*.md. Implement REQ-… (list). Write tests from the acceptance criteria first. Run tests and trace, use the app in a browser, update statuses, commit, and report."
