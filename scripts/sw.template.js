/* かずあそび Service Worker（ビルド時に生成） */
const CACHE = 'kazu-asobi-__CACHE_VERSION__';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  // 新しい版は「待機」させる。プレイ中に勝手に切り替えない。
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  // 古いアプリ本体のキャッシュだけを消す（記録は IndexedDB にあり、ここでは触れない）
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kazu-asobi-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./', { ignoreSearch: true }).then((hit) => hit || fetch(req)));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
