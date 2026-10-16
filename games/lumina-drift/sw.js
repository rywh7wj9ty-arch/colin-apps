var CACHE='lumina-drift-v202610160222';
var FILES=['./','index.html','manifest.json','icon-192.png','icon-512.png','icon-180.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(FILES);}).then(function(){return self.skipWaiting();}));});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k.indexOf('lumina-drift-')===0&&k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener('fetch',function(e){if(e.request.method!=='GET')return;var u=new URL(e.request.url);if(u.origin!==location.origin)return;
e.respondWith(caches.open(CACHE).then(function(c){return c.match(e.request,{ignoreSearch:true}).then(function(hit){
 if(e.request.mode==='navigate'){return fetch(e.request).then(function(r){if(r.ok)c.put('index.html',r.clone());return r;}).catch(function(){return c.match('index.html');});}
 return hit||fetch(e.request);});}));});
