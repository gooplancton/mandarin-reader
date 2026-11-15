/*
 * Service worker: makes the app work offline.
 * VERSION and ASSETS are written by `node tools/build.mjs` — run it after changing any file.
 * A new VERSION makes browsers download the new files and drop the old cache.
 */
const VERSION = '10db8422acf1';
const ASSETS = [
  "./",
  "css/style.css",
  "docs/template.json",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "index.html",
  "js/db.js",
  "js/flashcards.js",
  "js/format.js",
  "js/library.js",
  "js/main.js",
  "js/reader.js",
  "js/srs.js",
  "js/ui.js",
  "js/views/cards.js",
  "js/views/library.js",
  "js/views/read.js",
  "js/views/review.js",
  "manifest.webmanifest",
  "texts/library.js"
];

const CACHE = 'mandarin-reader-' + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mandarin-reader-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App navigation: always answer with the cached shell (routing happens in the #hash).
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  // Cache first; anything not precached goes to the network (and is cached for next time).
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
