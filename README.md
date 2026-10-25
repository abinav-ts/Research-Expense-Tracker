# ExpRes

*Breeze through grant-handling grunt work.*

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
| `npm run trace` | Checks spec → test traceability (see REQ-NFR-06). `npm run trace -- --strict` is the final gate. |
| `npm run typecheck` | TypeScript check of client, server and tooling. |
| `npm run build` | Production build into `dist/`. |
| `npm run icons` | Regenerates `public/icons/` from `brand/` (needs Playwright's Chromium). |
| `npm run deploy` | Build, apply database migrations to the live database, deploy to Cloudflare. |

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
