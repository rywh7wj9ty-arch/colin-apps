/* LUMEN service worker.
   - Every file is precached into ONE versioned cache; pages and assets are served only from that cache, so a page never
     mixes files from two releases.
   - A new release installs in the background and waits. The page tells it to take over only when you are not mid-game,
     then reloads once, so the whole app switches version atomically.
   - All paths are relative, so it works at / or under a sub-path. */
const VERSION = '2026.10.09-1';
const CACHE = 'lumen-' + VERSION;
const ASSETS = [
  './', 'index.html', 'style.css', 'game.js', 'manifest.webmanifest',
  'js/rules.js', 'js/worlds.js', 'js/bg.js', 'js/render.js', 'js/audio.js', 'js/input.js', 'js/stats.js',
  'fonts/outfit.woff2', 'fonts/cormorant-italic.woff2',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/favicon-32.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('lumen-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => { if (event.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      const hit = (await cache.match('index.html')) || (await cache.match('./'));
      if (hit) return hit;
      return fetch(req);
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    return fetch(req);
  })());
});
