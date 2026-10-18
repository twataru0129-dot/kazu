/* かずあそび Service Worker（ビルド時に生成） */
const CACHE = 'kazu-asobi-__CACHE_VERSION__';
const VERSION = '__CACHE_VERSION__';
const PRECACHE = __PRECACHE__;
/** ページ本体をネットから取りに行くときの待ち時間。これを過ぎたら手元の版を表示する */
const NAV_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  // 新しい版は「待機」させる。切り替えはアプリ側が安全なとき（ホーム画面など）に指示する。
  // HTTP キャッシュ（GitHub Pages は 10 分）を通さずに取得して、古いファイルが混ざらないようにする。
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  // 古いアプリ本体のキャッシュだけを消す。記録（IndexedDB）には触れない。
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kazu-asobi-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data.type === 'GET_VERSION' && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
});

/** ページ本体：ネット優先（新しい版をすぐ見せる）。オフライン・遅いときは手元の版。 */
function handleNavigate(req) {
  const fromCache = () => caches.match('./', { ignoreSearch: true });
  const network = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS));
  return Promise.race([network, timeout.then(() => fromCache().then((hit) => hit || network))])
    .then((res) => res || fromCache())
    .catch(() => fromCache().then((hit) => hit || Response.error()));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(handleNavigate(req));
    return;
  }
  // sw.js 自身は常にネットから（更新確認のため）
  if (url.pathname.endsWith('/sw.js')) return;
  // そのほか（ファイル名に版が入った JS/CSS・アイコン）はキャッシュ優先、なければネットから取ってキャッシュ
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
