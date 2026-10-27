# CLAUDE.md — standing instructions for Claude Code

You are building **ExpRes** by strict spec-driven development. The owner is new to web development: explain commands briefly, keep changes small, never assume tools are installed.

## Read first (every session)
1. `SPEC.md` (architecture, model, requirement index, principles)
2. Only the sub-spec in `specs/` for the requirements you were asked to build
3. `PLAN.md` for the current milestone and cut-line

## Rules
- **No code without a requirement.** Every change maps to REQ IDs in the spec. If something needed isn't specified, stop, propose a spec edit (with a Changelog line), and wait for approval.
- **Spec first.** If code and spec disagree, fix the spec in a visible diff before changing code.
- **Tests carry IDs.** Test titles must contain the REQ ID, e.g. `it('REQ-RULE-02: flags a date outside the trip window', ...)`. Write tests from the acceptance criteria.
- **Definition of done** for a requirement: acceptance criteria met, tests pass (`npm test`), `npm run trace` passes, spec status updated (`built`), and, for UI work, you opened it in a browser and used it.
- **Stack is fixed** (SPEC §5.1). Don't add libraries or switch tools without asking. Pin exact versions. Use the current Node LTS.
- **Layering:** `src/shared` is pure TypeScript with no browser/Node APIs and imports nothing from `client`/`server`. Money = integer paise. Dates = `YYYY-MM-DD` strings.
- **Statement is the source of truth for INR (SPEC principle 7):** a claim item's amount is the statement INR debit; unmatched (pending) bank-paid amounts are never claimable; cash items need a justification.
- **Brand is enforced (specs/07-branding.md, `brand/BRAND.md`):** the logo comes only from the shared AppShell header; colours and fonts only from `brand/tokens.css` and the Tailwind theme built from it (never hard-code a hex or font-family); the slogan lives only in the loading screen. `scripts/check-brand.ts` runs inside `npm test`.
- **Brand assets are final as of 2026-10-27** (Mandelbrot mark with a cut-out rupee; aubergine and magenta palette), but still swappable. Consume them ONLY through (a) a Tailwind theme generated from `brand/tokens.css` and (b) one `<Logo/>` component that imports the SVG files in `brand/`; never copy colour values or SVG paths elsewhere. Then a palette or logo change is a swap of files in `brand/`. Re-read `brand/` if it changes on disk.
- **Privacy is a feature:** no network calls from the client except to our own server, and only on explicit Submit (REQ-PRIV-01..05). No analytics, CDNs or external fonts.
- **Fixtures are synthetic.** Never commit real bank data or real payment screenshots. Demo screenshots are generated and watermarked "SAMPLE".
- Keep files small and named by feature. Prefer boring code over clever code.

## Workflow
- Work one requirement group at a time; run the app and the tests before declaring done.
- Initialise git in M0. Commit per requirement group; message starts with the IDs (e.g. `REQ-BAL-01, REQ-BAL-02: grant balance gauge`).
- Report at the end of each task: what changed, which REQ IDs are now `built`, anything you couldn't verify, and the single next step.
- Deploy early and keep the deployed URL working at every milestone.

## Commands (create in M0, keep working)
`npm run dev` · `npm test` · `npm run trace` · `npm run build` · `npm run deploy` (Cloudflare, via wrangler)
