const CACHE_NAME = 'shiqela-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/news.css',
  '/index.js',
  '/s.png',
  '/manifest.json'
];

// 1. Install Event: Cache Core Assets & Activate Instantly
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching core PWA assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Clean Up Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Network-First with Cache Fallback (Ensures live updates)
self.addEventListener('fetch', (event) => {
  // Ignore non-GET requests or third-party external origins like Google Fonts API
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // If network request succeeds, clone and update cache
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // If offline or request fails, serve from cache
        return caches.match(event.request);
      })
  );
});

// 4. Push Notification Support (Optional)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.text() : 'New update on Shiqela!';
  event.waitUntil(
    self.registration.showNotification('Shiqela App', {
      body: data,
      icon: '/s.png',
      badge: '/s.png'
    })
  );
});
