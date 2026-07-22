// EOS Planner service worker — makes the app installable and usable offline.
// Bump CACHE_VERSION whenever the cached file list changes so old caches get
// cleaned up automatically; browsers won't do that for you.
const CACHE_VERSION = 'eos-planner-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './lib/xlsx.full.min.js',
  './lib/msal-browser.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept POSTs (e.g. the Ask Claude function call)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave CDN/API requests to the network as normal

  // Navigations (loading the app itself) — network-first, so anyone online
  // always gets the latest version; falls back to the cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static assets (lib/, icons, manifest) — cache-first, refreshed in the
  // background, since these barely change and shouldn't block on the network.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
