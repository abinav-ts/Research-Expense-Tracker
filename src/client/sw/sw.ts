/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { createRepo } from '../db/repo.ts';
import { ExpResDb } from '../db/schema.ts';
import { handleShare } from './share-target.ts';

declare const self: ServiceWorkerGlobalScope;

// Offline app shell: everything the build emits is precached (list injected at build time).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Client routes (/trips, /review/…) open offline via the shell; /api/* is never answered from the cache.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

// Web Share Target (REQ-OFF-03): the OS share sheet POSTs here; the app must be installed for it to be offered.
const shareRepo = createRepo(new ExpResDb());
registerRoute(({ url }) => url.pathname === '/share-target', ({ request }) => handleShare(request, shareRepo), 'POST');

// Recognition data (REQ-OFF-05): downloaded into this cache by the page in the background; served from it offline.
registerRoute(({ url }) => url.pathname.startsWith('/ocr/'), new CacheFirst({ cacheName: 'expres-ocr-v1' }));

// REQ-OFF-06: a new version waits until the user taps "Reload" in the update bar (it then sends SKIP_WAITING), so the app
// never swaps itself under a half-filled form. The very first install has nothing to wait for and starts at once.
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') void self.skipWaiting();
});
clientsClaim();
