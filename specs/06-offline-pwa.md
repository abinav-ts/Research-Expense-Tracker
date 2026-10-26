# 06 — Offline and PWA

Status: **AGREED v0.3.1** — reviewed and approved by the owner on 2026-10-25.
Parent: `../SPEC.md`. Device matrix: SPEC §11.

## Requirements

### REQ-OFF-01 — Installable PWA [SHOULD] [agreed]
The app is a normal website; installing it is optional and needs no app store, APK or signing. A valid manifest, icons and HTTPS (provided by Cloudflare) let Chrome offer "Install app" / "Add to Home Screen".
Acceptance:
- The manifest has `name`, `short_name`, `start_url` "/", `display` "standalone", theme/background colours, icons at 192 and 512 px (one maskable), and the `share_target` of REQ-OFF-03.
- On the deployed HTTPS URL, Chrome (desktop and Android) offers installation, and Chrome DevTools → Application → Manifest reports no installability errors (manual check, M0 and M4).
- Where the browser exposes `beforeinstallprompt`, the app shows an "Install app" button; on iOS Safari it shows a hint "Share → Add to Home Screen".
- The installed app opens in its own window without browser chrome.
Tests: tests/e2e/pwa.smoke.test.ts (manifest fields, service worker registered)

### REQ-OFF-02 — Segments A and B work offline [MUST] [agreed]
After one online visit, with the network off: setup, expense capture, list, balance, CSV import, reconcile, rules, preview and PDF all work. Only *Submit* needs the network.
Acceptance:
- Given the app loaded once online and the service worker active (the app shows "Ready for offline use"), When the network is turned off and the app is closed and reopened (cold start), Then it loads and shows existing data.
- Offline, the user can: create a grant and trip; add a manual expense; add a pasted SMS; import the sample CSV, reconcile and select rows; see flags; open the claim preview; export the PDF. Each completes without errors.
- Offline, *Submit* explains "You're offline — submit when connected" (or queues it, REQ-OFF-04).
- During the whole offline flow, no request leaves for a third-party origin (network log shows only our own origin).
- Client routes (e.g. `/inbox`, `/trip/…`) load offline via a navigation fallback to the app shell; `/api/*` is never served from the fallback.
- The precache contains the app shell, JS/CSS, self-hosted fonts and icons, the sample CSV and demo fixtures. The OCR assets (~7 MB) are not part of the install precache: they are cached in the background by REQ-OFF-05, so a first visit stays small.
Tests: tests/e2e/offline.smoke.test.ts (Playwright `context.setOffline(true)` after first load); manual airplane-mode check in M4

### REQ-OFF-03 — Share Target handled by service worker [SHOULD] [built]
Manifest `share_target` accepts image, PDF and text by POST; the service worker stores them in IndexedDB and redirects to the Inbox, with no network needed.
Acceptance:
- Manifest: `action` "/share-target", `method` "POST", `enctype` "multipart/form-data", `params` {title, text, url, files: [{name "files", accept ["image/*", "application/pdf"]}]}.
- Given a POST with 2 image files and some text, When the service worker handles it, Then 3 Inbox records are created (2 file items, 1 text item), and the response is a 303 redirect to `/inbox?shared=3`. Works offline.
- Text may arrive in `text` or `title` (Android often leaves `url` empty): the handler concatenates non-empty values.
- Given an IndexedDB write failure, Then the redirect goes to `/inbox?error=share` and a visible message says nothing was saved; nothing is dropped silently.
- Given an unsupported file type, Then it is skipped with a message in the Inbox.
- On Android Chrome with the app installed, sharing a gallery image or SMS text to RET opens the Inbox with the item (manual check on phone, M1b). Not available on iOS; picker and paste are the fallback.
Tests: tests/unit/share-target.test.ts (handler with a mocked FormData and IndexedDB); manual device check

### REQ-OFF-04 — Outbox with retry [SHOULD] [agreed]
Queued submissions persist across restarts; automatic retry on reconnect; visible states (queued / sending / sent / failed).
Acceptance:
- Given the user submits while offline, Then the claim is stored in the Outbox as *queued* and the nav shows a count.
- When connectivity returns (or the app starts online), queued claims are sent one at a time; states move queued → sending → sent; on success the review and owner links are shown.
- A failed send shows the error and a Retry button; a queued claim survives closing and reopening the app.
- Each submission carries a client-generated idempotency key; the server returns the existing claim if it receives the same key twice (no duplicates).
Tests: tests/unit/outbox.test.ts, tests/api/claims.submit.test.ts

### REQ-OFF-05 — OCR assets self-hosted and precached [SHOULD] [built]
Acceptance:
- The Tesseract worker, WASM core and English language data are served from our own origin (no CDN) and are added to the cache in the background after first install, without blocking the UI.
- The Inbox shows "Recognition ready" or "Downloading recognition data (x MB)…". The download starts about 3 seconds after the user opens any researcher screen (not the landing page or the reviewer), only when online, and only fetches the one wasm core this device needs.
- If the data is not yet cached and the device is offline, OCR is disabled with a clear message and paste-text parsing (REQ-CAP-13) still works.
Tests: tests/e2e/ocr.smoke.test.ts

### REQ-OFF-06 — Update prompt [SHOULD] [built]
Acceptance:
- When a new service worker is waiting, a bar says "New version available" with a Reload button; Reload activates it. Until then the running version is left alone (the new one waits), so the app never swaps itself under a half-filled form. The app looks for a new version every 30 minutes and whenever the tab becomes visible again, not only on reload.
- The app never reloads automatically while a form has unsaved changes.
Tests: tests/e2e/pwa.smoke.test.ts

### REQ-OFF-07 — Online/offline indicator [MUST] [agreed]
Acceptance:
- The header shows "Online" or "Offline" with an icon (not colour alone). It updates within 2 seconds of the connection changing, using the browser online/offline events.
- Changes are announced to screen readers through a polite live region.
- Actions that need the network (Submit, fetching review status) are visibly disabled or explained when offline.
Tests: tests/e2e/offline.smoke.test.ts

### REQ-OFF-08 — Request persistent storage [SHOULD] [agreed]
Acceptance:
- After the first data entry the app calls `navigator.storage.persist()` once; Settings shows "Persistent storage: yes / no / unsupported".
- If not granted, Settings suggests installing the app and exporting a backup (REQ-CAP-12).
Tests: tests/unit/storage.test.ts (mocked API)

## Open questions
- Which phone(s) will you test on? iOS has no share-to-app; confirm the picker and paste-text fallbacks are acceptable for the demo.
