const CACHE_VERSION = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'v' + Date.now();
const CACHE_NAME = `realty-pandit-${CACHE_VERSION}`;

const OFFLINE_URL = '/offline';

// Build-independent shell only. HTML routes (`/`, `/properties`, …) are intentionally NOT
// precached — they reference hashed build chunks that change every deploy, so a cached page
// from an old build would load dead chunk URLs and crash. (2026-06-26)
const PRECACHE_ASSETS = [
  '/offline',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Install: cache the offline shell only.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([...new Set([...PRECACHE_ASSETS, OFFLINE_URL])]))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete every other cache (purges any poisoned cache left by the old SW) + claim clients.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy (2026-06-26 rewrite — fixes the network-correlated "client-side exception").
//
// The previous network-first strategy intercepted JS code chunks (/_next/static/*), RSC
// payloads and HTML, and on ANY dropped request served a stale (old-build) or EMPTY (408)
// substitute. On networks that block/throttle even one request that corrupted the app's code
// → React threw during hydration → blank "Application error" white screen.
//
// New rule: the SW must NEVER substitute a stale or empty version of anything the app's code
// integrity depends on. So it now mediates ONLY top-level page navigations (to provide an
// offline fallback). Build assets, RSC, API and third-party requests go straight to the browser,
// where a genuine failure stays a real, recoverable failure — never a silent broken body.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Only handle full-page navigations; let the browser fetch everything else directly
  // (chunks, css, fonts, images, RSC, /api, cross-origin trackers/maps).
  if (event.request.mode !== 'navigate') return;

  event.respondWith(
    // Network-first for the page itself; if the network fails, show the offline page.
    // We deliberately do NOT serve stale cached HTML (it would reference dead chunk hashes).
    fetch(event.request).catch(() => caches.match(OFFLINE_URL))
  );
});
