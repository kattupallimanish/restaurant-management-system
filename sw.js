const CACHE_NAME = 'win-restaurant-cache-v5';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/variables.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './offline/',
  './404/'
];

// Install Event: cache static resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching offline assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event: clean up older caches
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

// Fetch Event: stale-while-revalidate strategy for same-origin resources
self.addEventListener('fetch', (event) => {
  // Only handle GET requests for same origin
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh resources in the background to update the cache
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {
            // Ignore network errors in background update
          });
        return cachedResponse;
      }

      // If resource is not cached, fetch it from network
      return fetch(event.request).then((networkResponse) => {
        // If the server explicitly returns a 404 Not Found for a page request, show custom 404
        if (networkResponse.status === 404 && event.request.mode === 'navigate') {
          return caches.match('./404/');
        }
        return networkResponse;
      }).catch((error) => {
        // If both cache and network fail, and it's a navigation request, show the offline page
        if (event.request.mode === 'navigate') {
          return caches.match('./offline/');
        }
        throw error;
      });
    })
  );
});
