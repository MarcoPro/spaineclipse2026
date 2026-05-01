/**
 * Service Worker para Eclipse Solar España 2026.
 * Cachea todos los recursos esenciales para funcionamiento offline
 * el día del eclipse (zonas rurales sin cobertura).
 */

const CACHE_NAME = 'eclipse-2026-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './config.js',
    './besselian_calculator.js',
    './eclipse_data.js',
    './cloud_heatmap.js',
    './topography_data.js',
    './pois.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js'
];

// Install: cache essential resources
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            );
        })
    );
    self.clients.claim();
});

// Fetch: cache-first for cached assets, network-first for tiles/API
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Map tiles: network first, cache fallback
    if (url.hostname.includes('tile.openstreetmap.org') ||
        url.hostname.includes('server.arcgisonline.com') ||
        url.hostname.includes('opentopomap.org')) {
        event.respondWith(
            fetch(event.request).then((response) => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            }).catch(() => caches.match(event.request))
        );
        return;
    }

    // API calls (meteo, nominatim): network only
    if (url.hostname.includes('api.open-meteo.com') ||
        url.hostname.includes('nominatim.openstreetmap.org')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Everything else: cache first
    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request).then((response) => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            });
        })
    );
});
