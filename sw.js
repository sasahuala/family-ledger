/* 记账本 Service Worker
   策略（全部网络优先）：
   - 页面（HTML）：网络优先，断网才用缓存
   - 静态资源（CSS/JS/图标）：同样网络优先，断网才用缓存
     （曾经对静态资源用「缓存优先+后台更新」，代价是更新后第一次打开仍跑旧 JS，
      导致用户在拿到新版前记错账；改为网络优先彻底杜绝，代价仅是弱网时稍慢）
   - 版本号变化时清空旧缓存 */
const CACHE = 'ledger-v20261119a';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // CDN 等外部资源交给浏览器

  // 页面与静态资源一律网络优先：有网必拿最新，断网回退缓存
  e.respondWith(
    fetch(req)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return r;
      })
      .catch(() => caches.match(req))
  );
});
