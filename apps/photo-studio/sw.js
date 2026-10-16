/* Photo Studio service worker: cache-first for big, versioned assets (AI models, WASM, OpenCV, HEIC decoder) so repeat visits load instantly/offline.
   App code (html/js/css) stays network-first so updates always arrive. */
const BIG='ps-assets-v1', APP='ps-app-v1';
const BIGRE=/\/photo-studio\/(models|ort|opencv|heif|mediapipe|libraw|leaflet)\/|\.(onnx|wasm|tflite|task)$|lensdb\.json$/;
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{ const ks=await caches.keys(); await Promise.all(ks.filter(k=>k.startsWith('ps-')&&k!==BIG&&k!==APP).map(k=>caches.delete(k))); await self.clients.claim(); })()));
self.addEventListener('fetch',e=>{ const r=e.request; if(r.method!=='GET') return; const u=new URL(r.url); if(u.origin!==location.origin) return;
  if(BIGRE.test(u.pathname)){ e.respondWith((async()=>{ const c=await caches.open(BIG); const hit=await c.match(r,{ignoreSearch:true}); if(hit) return hit; const res=await fetch(r); if(res.ok&&res.status===200) c.put(r,res.clone()).catch(()=>{}); return res; })()); return; }
  if(u.pathname.startsWith('/photo-studio/')){ e.respondWith((async()=>{ try{ const res=await fetch(r); if(res.ok&&res.status===200&&!u.search){ const c=await caches.open(APP); c.put(r,res.clone()).catch(()=>{}); } return res; }catch(err){ const c=await caches.open(APP); const hit=await c.match(r,{ignoreSearch:true}); if(hit) return hit; throw err; } })()); } });
