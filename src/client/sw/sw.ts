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

// But waiting only makes sense if some open page can show the update bar. A tab still running an older release of the app
// has no bar, so a new version would wait for ever and the device would stay stuck on the old one. So when a version installs,
// every open page is asked "can you offer an update?"; if none answers, the new version takes over at once.
const ASK_TIMEOUT_MS = 1000;
function canOfferUpdate(client: Client): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), ASK_TIMEOUT_MS);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      resolve(true);
    };
    client.postMessage({ type: 'CAN_OFFER_UPDATE' }, [channel.port2]);
  });
}
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const answers = await Promise.all(pages.map(canOfferUpdate));
      if (!answers.some(Boolean)) await self.skipWaiting(); // nobody to ask (first visit) or nobody can answer (older release)
    })(),
  );
});
clientsClaim();
