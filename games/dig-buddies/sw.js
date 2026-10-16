/* Dig Buddies service worker: versioned precache, offline after the first visit.
   Pages are network-first (4 s timeout, then the precached shell); versioned files (?v=) are only answered
   with that exact version, so a release never mixes with another; the previous cache is kept one release. */
const VERSION = '__V__';
const CACHE = 'digbuddies-' + VERSION;
const ASSETS = [
  './', 'index.html', 'style.css?v=' + VERSION, 'game.js?v=' + VERSION, 'logic.js?v=' + VERSION, 'levels.js?v=' + VERSION, 'audio.js?v=' + VERSION, 'render.js?v=' + VERSION,
  'manifest.webmanifest?v=' + VERSION, 'fredoka.ttf', 'vendor/three/three.module.js',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/favicon-32.png',
];
self.addEventListener('install', event => {
  event.waitUntil((async () => { const cache = await caches.open(CACHE); await cache.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))); await self.skipWaiting(); })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const old = (await caches.keys()).filter(k => k.startsWith('digbuddies-') && k !== CACHE).sort();
    const keep = old.filter(k => k < CACHE).pop();
    await Promise.all(old.filter(k => k !== keep).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
const timeout = ms => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
async function page(req) {
  const cache = await caches.open(CACHE); const shell = async () => (await cache.match('./')) || (await cache.match('index.html'));
  try { const res = await Promise.race([fetch(req), timeout(4000)]); if (res && res.ok && !res.redirected) return res; return (await shell()) || res; }
  catch (err) { const s = await shell(); if (s) return s; throw err; }
}
self.addEventListener('fetch', event => {
  const req = event.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== self.location.origin) return; if (url.pathname.includes('/.netlify/')) return;
  if (req.mode === 'navigate') { event.respondWith(page(req)); return; }
  const v = url.searchParams.get('v');
  if (v && v !== VERSION) { event.respondWith((async () => (await caches.match(req)) || fetch(req))()); return; }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = (await cache.match(req)) || (!v && url.search ? await cache.match(req, { ignoreSearch: true }) : null); if (hit) return hit;
    const res = await fetch(req); if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()); return res;
  })());
});
