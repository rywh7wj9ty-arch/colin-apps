// Concept b service worker — unique cache name, versioned, precaches everything; never mixes versions.
const VERSION = '20261016a';
const CACHE = 'p25-b-' + VERSION;
const FILES = ['./', './index.html', './main.js?v=' + VERSION, './manifest.webmanifest?v=' + VERSION, './icon-180.png', './icon-192.png', './icon-512.png',
  '../shared/engine.js', '../shared/ui.css?v=' + VERSION, '../shared/boot.js?v=' + VERSION, '../vendor/three.webgpu.min.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('p25-b-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => { if (e.request.method !== 'GET') return; e.respondWith(caches.open(CACHE).then((c) => c.match(e.request, { ignoreSearch: false }).then((r) => r || fetch(e.request).then((n) => { if (n.ok && new URL(e.request.url).origin === location.origin) c.put(e.request, n.clone()); return n; }).catch(() => c.match('./index.html'))))); });
