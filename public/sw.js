// TCU Scheduling System - Service Worker
// Provides offline support and intelligent caching strategies

const CACHE_VERSION = 'v1';
const CACHE_NAMES = {
  // Static assets cache - long-lived (1 week)
  STATIC: `static-${CACHE_VERSION}`,
  // Dynamic content cache - rotated frequently
  DYNAMIC: `dynamic-${CACHE_VERSION}`,
  // API responses cache - strategy-specific
  API: `api-${CACHE_VERSION}`,
  // HTML pages cache
  PAGES: `pages-${CACHE_VERSION}`,
};

// Static assets to pre-cache on install
const STATIC_ASSETS = [
  '/',
  '/tcu-logo.png',
  '/robots.txt',
];

// Cache-first: Return from cache if available, fall back to network
// Used for static assets that don't change
const cacheFirstStrategy = async (request) => {
  const cache = await caches.open(CACHE_NAMES.STATIC);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    // Cache successful responses
    if (response && response.status === 200) {
      const responseToCache = response.clone();
      cache.put(request, responseToCache);
    }
    return response;
  } catch (error) {
    console.log('[SW] Cache-first fetch failed:', request.url, error);
    // Return a generic offline response if available
    return new Response('Offline - Resource not available', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
};

// Network-first: Try network first, fall back to cache
// Used for API calls and dynamic content
const networkFirstStrategy = async (request) => {
  try {
    const response = await fetch(request);
    
    // Cache successful API responses
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAMES.API);
      const responseToCache = response.clone();
      cache.put(request, responseToCache);
    }
    
    return response;
  } catch (error) {
    console.log('[SW] Network-first fetch failed, checking cache:', request.url);
    
    // Try cache as fallback
    const cache = await caches.open(CACHE_NAMES.API);
    const cached = await cache.match(request);
    
    if (cached) {
      return cached;
    }

    // Return offline response
    return new Response(
      JSON.stringify({
        error: 'Offline',
        message: 'You are offline. This data may be cached or unavailable.',
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

// Stale-while-revalidate: Return cached response immediately, fetch fresh in background
// Used for frequently accessed data
const staleWhileRevalidateStrategy = async (request) => {
  const cache = await caches.open(CACHE_NAMES.DYNAMIC);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response && response.status === 200) {
      const responseToCache = response.clone();
      cache.put(request, responseToCache);
    }
    return response;
  }).catch(() => {
    console.log('[SW] Stale-while-revalidate background fetch failed:', request.url);
    return cached;
  });

  return cached || fetchPromise;
};

// Install event - pre-cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches
      .open(CACHE_NAMES.STATIC)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((error) => {
        console.error('[SW] Pre-cache failed:', error);
      })
      .then(() => self.skipWaiting()) // Skip waiting, activate immediately
  );
});

// Activate event - clean up old cache versions
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete caches from old versions
            if (
              !Object.values(CACHE_NAMES).includes(cacheName) &&
              cacheName.startsWith('static-') ||
              cacheName.startsWith('dynamic-') ||
              cacheName.startsWith('api-') ||
              cacheName.startsWith('pages-')
            ) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim()) // Claim all clients
  );
});

// Fetch event - route requests to appropriate cache strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // API routes - network-first strategy
  if (url.pathname.startsWith('/api/')) {
    console.log('[SW] Routing API request:', url.pathname);
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Static assets - cache-first strategy
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot)$/i) ||
    url.pathname === '/robots.txt'
  ) {
    console.log('[SW] Routing static asset:', url.pathname);
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // HTML pages - network-first, stale-while-revalidate on repeat visits
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    console.log('[SW] Routing page request:', url.pathname);
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Everything else - network-first
  event.respondWith(networkFirstStrategy(request));
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      type: 'VERSION',
      version: CACHE_VERSION,
    });
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      Promise.all([
        caches.delete(CACHE_NAMES.API),
        caches.delete(CACHE_NAMES.DYNAMIC),
      ]).then(() => {
        event.ports[0].postMessage({ type: 'CACHE_CLEARED' });
      })
    );
  }
});

// Background sync for scheduled responses (optional - requires API integration)
// Uncomment when your app supports push notifications
/*
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/tcu-logo.png',
    badge: '/tcu-logo.png',
    tag: data.tag || 'notification',
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});
*/
