// Cache-first service worker. Bump CACHE when shipping new assets.

const CACHE = 'jokerdeck-v3';

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'css/fonts.css',
  'js/main.js',
  'js/ui.js',
  'js/game.js',
  'js/poker.js',
  'js/cards.js',
  'js/jokers.js',
  'js/consumables.js',
  'js/blinds.js',
  'js/shop.js',
  'js/decks.js',
  'js/save.js',
  'js/audio.js',
  'js/util.js',
  'js/art.js',
  'js/anim.js',
  'js/tutorial.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-180.png',
  'icons/icon-maskable-512.png',
  'icons/favicon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // One bad URL must not fail the whole install, so add them individually.
      .then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        // Refresh in the background so the next launch has the newer file.
        fetch(req).then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        }).catch(() => { /* offline */ });
        return hit;
      }
      return fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match('index.html'));
    })
  );
});
