/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

// Offline app shell: everything the build emits is precached (list injected at build time).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Client routes (/trips, /review/…) open offline via the shell; /api/* is never answered from the cache.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

// M0: take over immediately. The "New version available" prompt is REQ-OFF-06 (later).
self.skipWaiting();
clientsClaim();
