# 07 — Branding (ExpRes)

Status: **DRAFT v0.4.1** (REQ-BRAND-01..04 built in M0) — written from the approved prototype; awaiting owner review.
Parent: `../SPEC.md`. Source of truth for the look: `../brand/BRAND.md`, `../brand/tokens.css`, `../brand/logo-mark*.svg`.

## Requirements

### REQ-BRAND-01 — Logo on every page [MUST] [built]
The system shall render the ExpRes lockup (mark + wordmark) in the header of every screen through one shared `AppShell`. No route renders outside it.
Acceptance:
- Given the list of all routes in `src/client/app/routes.ts` (home, trips, inbox, statement claim, claim preview, settings, not-found, share-error, reviewer page), When each is opened, Then exactly one element with `data-testid="brand-logo"` is present in the header and has the accessible name "ExpRes".
- The lockup is the mark (36×36 px) plus the wordmark at 26 px; below 320 px viewport width the wordmark hides and the mark stays.
- On researcher pages the lockup links to home; on the reviewer page it is not a link.
- The page `<title>` always ends with "ExpRes".
Tests: tests/e2e/brand.smoke.test.ts (iterates the route list)

### REQ-BRAND-02 — Brand fonts, self-hosted [MUST] [built]
The system shall use Bricolage Grotesque for the wordmark, titles and headings and Inter for interface text and all amounts, with tabular figures on amounts.
Acceptance:
- Fonts come from Fontsource variable packages bundled with the app (latin and latin-ext subsets), `font-display: swap`; no request goes to Google Fonts or any third-party host (REQ-PRIV-05).
- The font files contain the ₹ sign (U+20B9); a unit test fails otherwise. "₹1,23,456.00" renders in Inter with `font-variant-numeric: tabular-nums`.
- Only the two stacks from `brand/tokens.css` exist; `scripts/check-brand.ts` fails if `font-family` appears outside `src/client/brand/` or if a Google Fonts URL appears anywhere in `src/` or `index.html`.
Tests: tests/unit/fonts.test.ts, tests/unit/check-brand.test.ts

### REQ-BRAND-03 — Colours only from tokens [MUST] [built]
The system shall take every UI colour from the brand tokens.
Acceptance:
- The Tailwind theme replaces the default palette with the tokens in `brand/tokens.css`.
- `scripts/check-brand.ts` fails on any hex/rgb colour literal in `src/client` outside `src/client/brand/` and the logo SVGs.
- Balance states Healthy, Low and Overspent use the state tokens and always show a word and an icon (REQ-BAL-02).
Tests: tests/unit/check-brand.test.ts

### REQ-BRAND-04 — Loading screen with slogan, only while loading [MUST] [built]
The system shall show a loading screen while the app boots, with the animated mark, the wordmark and the slogan "Breeze through the grunt work of managing conference grant claims", and show the slogan nowhere else.
Acceptance:
- The loading markup and its CSS are inline in `index.html`, so it paints before the JavaScript bundle loads; it is removed when the app mounts.
- It becomes visible only if boot takes longer than 300 ms (no flash on fast or cached loads) and, once visible, stays at least 700 ms.
- The mark animates (the cut-out rupee fades in and out); with `prefers-reduced-motion: reduce` it is static. It has `role="status"` and the text "Loading ExpRes" for screen readers.
- The slogan string appears exactly once across `src/` and `index.html` combined, and that one place is the loading-screen markup in `index.html`; `scripts/check-brand.ts` fails otherwise.
- It also shows on an offline cold start, served from the cache.
Tests: tests/e2e/brand.smoke.test.ts (throttled boot shows it; fast boot does not), tests/unit/check-brand.test.ts

### REQ-BRAND-05 — Branded outputs [SHOULD] [draft]
Acceptance:
- The claim pack PDF has the lockup on the cover and the mark in the running header, using brand colours; the reviewer page has the lockup (REQ-BRAND-01).
- The web app manifest has name "ExpRes", `theme_color` #2A1245 and icons made from the app icon (mark on an ink rounded square); the favicon uses the mark.
Tests: tests/unit/claim.test.ts, tests/e2e/pwa.smoke.test.ts

## Open questions
- A simplified mark for 16 px favicons (the rupee is a few pixels at that size; consider a bolder rupee).
- Whether the PDF should embed Inter and Bricolage (larger file) or use the mark plus a standard font for body text.
