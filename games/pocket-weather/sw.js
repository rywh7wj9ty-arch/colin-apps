/* Pocket Weather service worker: versioned precache, fully offline after the first visit.
   Rules that keep releases from mixing:
   - pages are network-first (fresh index.html when online; the precached one offline or after 4 s);
   - versioned files (?v=...) are only ever answered with that exact version, never another release's file;
   - the previous release's cache is kept for one more release so a page still open during an update can finish loading. */
const VERSION = '__BUILD__';
const CACHE = 'pocketweather-' + VERSION;
const ASSETS = __ASSETS__;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' skips the HTTP cache so a new release never precaches stale files
    await cache.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const old = (await caches.keys()).filter(k => k.startsWith('pocketweather-') && k !== CACHE).sort();
    const keep = old.filter(k => k < CACHE).pop();
    await Promise.all(old.filter(k => k !== keep).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function timeout(ms) { return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)); }

async function page(req) {
  const cache = await caches.open(CACHE);
  const shell = async () => (await cache.match('./')) || (await cache.match('index.html'));
  try {
    const res = await Promise.race([fetch(req), timeout(4000)]);
    if (res && res.ok && !res.redirected) return res;
    return (await shell()) || res;
  } catch (err) {
    const s = await shell();
    if (s) return s;
    throw err;
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/.netlify/')) return;
  if (req.mode === 'navigate') { event.respondWith(page(req)); return; }
  const v = url.searchParams.get('v');
  if (v && v !== VERSION) {
    // another release's file: only its own cached copy, else the network
    event.respondWith((async () => (await caches.match(req)) || fetch(req))());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = (await cache.match(req)) || (!v && url.search ? await cache.match(req, { ignoreSearch: true }) : null);
    if (hit) return hit;
    const res = await fetch(req);
    if (res && res.ok && res.type === 'basic' && !v) cache.put(req, res.clone());
    return res;
  })());
});
