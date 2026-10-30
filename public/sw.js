const CACHE='leather-studio-__BUILD_HASH__';
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);const manifest=await fetch('/offline-assets.json',{cache:'no-cache'}).then(r=>r.json());await cache.addAll(['/','/index.html',...manifest]);
})()));
self.addEventListener('message',event=>{if(event.data==='activate')self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key!==CACHE)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(event.request,{ignoreVary:true});if(cached)return cached;const response=await fetch(event.request);if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)))}return response})());
});
