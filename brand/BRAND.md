# ExpRes — brand

**Name:** ExpRes (Expense + Research; "express")
**Slogan:** Breeze through grant-handling grunt work — shown **only on the loading screen**.
**Prototype (private Claude Design canvas):** https://claude.ai/artifact/6jm2AEYdonTVwRtkgktPMW

## Logo
A research paper (folded corner, two text lines) stands still while a slanted rupee in saffron breezes past it, leaving three teal wind streaks (one curls at the tail).

| File | Use |
|---|---|
| `logo-mark.svg` | Mark on light grounds |
| `logo-mark-dark.svg` | Mark on dark (ink) grounds |
| Wordmark | "Exp" Bricolage Grotesque 500 + "Res" 800, letter-spacing −0.035em, set as live text |

Lockup = mark (4:3) + wordmark at 0.7× mark height cap alignment, gap ≈ 8–24 px depending on size.
Minimum sizes: mark 24 px wide alone; smallest lockup has a 22 px wordmark. App icon: mark on an ink rounded square (corner radius ≈ 22%); a simplified 16 px favicon is still to do.
Rules: no recolouring, no stretching, no other colours, no slogan beside the logo.

## Colour (see `tokens.css`)
Ink #0E2A3B · Ink soft #4B6272 · Breeze #2BB3A9 (graphic only) · Breeze deep #17706B · Rupee #D96F00 (graphic only) · Rupee bright #FFB020 (on dark) · Ground #F5F8F7 · Surface #FFFFFF · Line #D7E1DF.
Balance states use words and icons as well as colour: Healthy #17706B, Low #A85500, Overspent #B42318.
Contrast: ink on ground 13.9:1; ink soft on ground 6.0:1; bright rupee on ink 8.1:1.

## Type
- **Bricolage Grotesque** (display): wordmark, titles, headings.
- **Inter** (UI): interface text and every amount, with tabular figures.
Both self-hosted (Fontsource variable packages, latin + latin-ext so ₹ renders). No Google Fonts requests at runtime.

| Role | Face | Size/line |
|---|---|---|
| Display | Bricolage 700 | 40/44 |
| Title | Bricolage 700 | 28/34 |
| Heading | Bricolage 600 | 20/26 |
| Body | Inter 400 | 16/24 |
| Label | Inter 600, caps, +0.06em | 13/18 |
| Amount | Inter 700, tabular | 32/36 |
| Amount in lists | Inter 600, tabular | 16/24 |

## Enforcement
Defined in `specs/07-branding.md` (REQ-BRAND-01..05): one AppShell with the lockup on every route, tokens-only colours and fonts checked by `scripts/check-brand.ts`, slogan in exactly one component (the loading screen), a test that visits every route and finds the logo.
