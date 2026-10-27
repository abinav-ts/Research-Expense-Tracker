# ExpRes — brand

**Name:** ExpRes (Expense + Research; "express")
**Slogan:** Breeze through the grunt work of managing conference grant claims — shown **only on the loading screen**.
**Prototype (private Claude Design canvas):** https://claude.ai/artifact/6jm2AEYdonTVwRtkgktPMW

## Logo
The Mandelbrot set (a research-figure shape) with the Indian rupee sign cut out of its main body. No streaks, no paper.

| File | Use |
|---|---|
| `logo-mark.svg` | Mark on light grounds: dark set #2A1245, rupee transparent (a mask, so it shows the ground) |
| `logo-mark-dark.svg` | Mark on dark (ink) grounds: white set, rupee drawn in ink #2A1245 (the one `<g>` is animated on the loading screen) |
| Wordmark | "Exp" Bricolage Grotesque 500 + "Res" 800, letter-spacing −0.035em, set as live text |

Lockup = square mark (36 px in the app header) + wordmark at 26 px, gap 8 px. The rupee is drawn from a reference glyph: two full-width bars, round bowl, diagonal leg, round caps.
Minimum sizes: mark 24 px alone; smallest lockup has a 22 px wordmark. App icon: mark on an ink rounded square (corner radius ≈ 22%); a simplified 16 px favicon is still to do.
Rules: no recolouring, no stretching, no other colours, no slogan beside the logo.

## Colour (see `tokens.css`)
Ink #2A1245 · Ink soft #5E4A74 · Magenta ("breeze") #C026A3 (accent, 5.2:1 on white) · Magenta deep #8A1C7C (links, verified state, accent text) · Ground #F8F5FB · Surface #FFFFFF · Line #E3DAEC. Spare accents: saffron #D96F00 / #FFB020 (not used by the logo).
Balance states keep green, amber and red with words and icons: Healthy #17706B, Low #A85500, Overspent #B42318, so meaning never depends on the brand hue.
Contrast (computed): ink on ground 15.3:1; ink soft on ground 7.2:1; magenta deep on white 8.3:1; magenta on white 5.2:1; Healthy, Low and Overspent on ground 5.5, 4.9 and 6.1:1.

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
