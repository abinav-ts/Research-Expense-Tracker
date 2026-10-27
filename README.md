# ExpRes

*Breeze through the grunt work of managing conference grant claims.*

Privacy-first, offline-capable expense tracking and claim generation for researchers spending grant money on conference travel.

- Read **SPEC.md** for the product, architecture and requirement index.
- Read **PLAN.md** for the schedule and milestones.
- Detailed requirements live in **specs/**.

## Run it on your computer

Needs Node.js 24 or newer (the current LTS) and Git.

```bash
npm install          # once: downloads the libraries into node_modules/
npm run db:local     # once: creates the local database tables (a throwaway copy on your machine)
npm run dev          # starts the app at http://localhost:5173 (stop with Ctrl+C)
```

| Command | What it does |
|---|---|
| `npm run dev` | App + API with live reload. No service worker in dev. |
| `npm test` | Brand checks, then unit and API tests. |
| `npm run test:e2e` | Browser smoke tests (Playwright). First time: `npx playwright install chromium`. Builds the app itself. |
| `npm run test:e2e:safari` | The same browser tests on WebKit, the engine of Safari on iPhone (first time: `npx playwright install webkit`). |
| `npm run trace` | Checks spec → test traceability (see REQ-NFR-06). `npm run trace -- --strict` is the final gate. |
| `npm run typecheck` | TypeScript check of client, server and tooling. |
| `npm run build` | Production build into `dist/`. |
| `npm run icons` | Regenerates `public/icons/` from `brand/` (needs Playwright's Chromium). |
| `npm run fixtures` | Regenerates the synthetic, SAMPLE-watermarked demo proofs in `fixtures/` (needs Playwright's Chromium). |
| `npm run deploy` | Build, apply database migrations to the live database, deploy to Cloudflare. |

Screenshot recognition runs on the device with Tesseract. Its files (~15 MB, of which each device downloads ~7 MB) are copied from `node_modules` into `public/ocr/` automatically before `dev` and `build`; that folder is not committed.

The statement screen reads a bank's CSV on the device; `fixtures/sample-statement.csv` is a synthetic example (also downloadable from that screen).

A claim is prepared on the trip's **Prepare claim** screen (preview, PDF made on the device, Submit). Submitting stores the claim on the server and gives two private links: `/review/<token>` for the grant officer and `/claim/<token>` for the researcher. `/review/sample` is a built-in sample claim made of invented data (`node scripts/make-sample-assets.ts` rebuilds its picture from `fixtures/`). Specs: `specs/05-claim-and-review.md`.

Never commit real receipts or invoices: `IMG_*.jpeg` is excluded locally in `.git/info/exclude`, and tests use the synthetic images in `fixtures/` (`npm run fixtures`).

Check that the server and database work: with `npm run dev` running, open http://localhost:5173/api/health. It should show `{"ok":true,"db":{"hits":…}}`, and `hits` goes up on every reload.

## Deploy to Cloudflare (free plan)

One-time setup:

1. Create a free account at https://dash.cloudflare.com/sign-up (no card is needed for Workers or D1; stop and tell the maintainer if it asks for one).
2. `npx wrangler login` opens a browser tab; click **Allow**.
3. `npx wrangler d1 create expres` prints a `database_id`. Paste it into `wrangler.jsonc` (replacing the zeros) and save.

Every deploy:

```bash
npm run deploy
```

It asks once to confirm the database migration (type `y`), then prints your public address, `https://expres.<your-subdomain>.workers.dev`. Open `/api/health` on that address to check the live database.
