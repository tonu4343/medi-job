const CACHE_VERSION = 'medi-job-v14';
const STATIC_CACHE = CACHE_VERSION + '-static';

const PRECACHE_URLS = [
  'styles.css',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function (cache) {
      return cache.addAll(PRECACHE_URLS).catch(function () {});
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key.indexOf(CACHE_VERSION) !== 0; })
            .map(function (key) { return caches.delete(key); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(STATIC_CACHE).then(function (cache) { cache.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (cached) {
          return cached || caches.match('index.html');
        });
      })
    );
    return;
  }

  if (['style', 'script', 'image', 'font'].indexOf(req.destination) !== -1) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        const fetchPromise = fetch(req).then(function (res) {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then(function (cache) { cache.put(req, copy); });
          return res;
        }).catch(function () { return cached; });
        return cached || fetchPromise;
      })
    );
  }
});
