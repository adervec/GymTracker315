/* GymTracker service worker (feat 93) — offline-first app shell.
   BUILD is stamped from APP_BUILD by the deploy workflow; the changed file content is what
   signals the browser that a new version is available (which bumps the cache + purges the old). */
const BUILD = '__BUILD__';
const CACHE = 'gt-cache-' + BUILD;
const SHELL = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-512-maskable.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()) // never fail the install over one missing asset
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gt-cache-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return; // leave cross-origin (Google APIs / CDNs) alone

  if (req.mode === 'navigate') {
    // network-first for the app document: freshest app when online, cached shell when offline
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./', copy)).catch(() => {}); return res; })
        .catch(() => caches.match('./').then((h) => h || caches.match(req)))
    );
    return;
  }

  // cache-first for same-origin static assets (icons, manifest, …)
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }))
  );
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
