// BUILD_HASH below is replaced at build time by the Vite plugin.
// Changing this value causes the browser to treat this as a new service worker.
const BUILD_HASH = '__BUILD_HASH__';
const CACHE_NAME = 'findthebook-' + BUILD_HASH;

const PRECACHE_ASSETS = ['./', './index.html', './manifest.json'];

// Install: precache shell assets, then skip waiting to activate immediately
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate: purge all old caches, then claim clients so existing tabs use this SW
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) =>
                Promise.all(
                    keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
    );
});

// Fetch: strategy depends on request type
self.addEventListener('fetch', (event) => {
    const { request } = event;

    if (request.method !== 'GET') return;

    // Navigation requests (HTML pages): network-first
    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request));
        return;
    }

    // Hashed assets from Vite (e.g., /assets/app-DnC3x4f2.js): cache-first
    if (request.url.includes('/assets/')) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // Everything else (manifest, icons, CDN resources): stale-while-revalidate
    event.respondWith(staleWhileRevalidate(request));
});

function networkFirst(request) {
    return fetch(request)
        .then((response) => {
            if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
        })
        .catch(() => caches.match(request));
}

function cacheFirst(request) {
    return caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
            if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
        });
    });
}

function staleWhileRevalidate(request) {
    return caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
            if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
        });
        return cached || fetchPromise;
    });
}
