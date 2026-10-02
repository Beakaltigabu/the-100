import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// True when this SW is replacing an existing one (a new release), false on the
// very first install. We only force-reload open tabs on RELEASES — a brand-new
// visitor should not get an automatic reload on their first visit.
let updatingExisting = false;
self.addEventListener('install', (event) => {
  updatingExisting = !!self.registration.active;
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const manifest = self.__WB_MANIFEST;

cleanupOutdatedCaches();
precacheAndRoute(manifest);

// On every new release (new SW activation): drop stale runtime caches, take
// control of all open tabs, and force them to reload so everyone gets the new
// version without a manual refresh. `cleanupOutdatedCaches` already removes old
// precaches; the navigation below makes the update apply automatically.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await cleanupOutdatedCaches();
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('google-fonts-'))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
      if (!updatingExisting) return;
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.all(clients.map((client) => client.navigate(client.url).catch(() => {})));
    })()
  );
});

// SPA shell — navigation falls back to index.html. Only meaningful once the
// precache manifest is populated (production); in dev the manifest is empty and
// the dev server serves index.html directly.
if (manifest && manifest.length > 0) {
  registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));
}

// Google Fonts (kept from the previous generateSW config).
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({ cacheName: 'google-fonts-css' })
);
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 })
    ]
  })
);

// Web push: render a notification from the payload sent by the server.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // non-JSON payload → show with the app name only
  }
  const title = data.title || 'THE 100';
  const options = {
    body: data.body || '',
    icon: '/icons/pwa-192.png',
    badge: '/icons/pwa-192.png',
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tap a notification → focus the app, navigating to the push target URL.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })()
  );
});