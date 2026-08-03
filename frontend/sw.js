/* ══════════════════════════════════════════════════════════════════
   FETCH — sw.js  (Service Worker)
   Strategy:
   - HTML pages (navigation): network-first -> cache -> offline.html
   - /api/* (auth, scrape, deobfuscate, config): NETWORK ONLY, never cached
     (these are dynamic/user-specific; caching them causes stale-data bugs)
   - Same-origin static assets (css/js/icons): stale-while-revalidate
   - Cross-origin assets (fonts, cdnjs): stale-while-revalidate
═══════════════════════════════════════════════════════════════════ */

const VERSION = "v2";
const STATIC_CACHE = `fetch-static-${VERSION}`;
const RUNTIME_CACHE = `fetch-runtime-${VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/auth.html",
  "/admin.html",
  "/style.css",
  "/auth.css",
  "/admin.css",
  "/script.js",
  "/auth.js",
  "/admin.js",
  "/manifest.json",
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

/* ── install: precache the app shell ── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

/* ── activate: clean up old cache versions ── */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/* ── allow the page to trigger an immediate update ── */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/") || url.pathname === "/health";
}

/* network-first, falling back to cache, falling back to offline page */
async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      return caches.match("/offline.html");
    }
    throw err;
  }
}

/* stale-while-revalidate: serve cache immediately, refresh in background */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || (await networkPromise) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never intercept POST (scrape/deobfuscate/auth)

  const url = new URL(request.url);

  // Never cache API calls — always hit the live server
  if (isApiRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // HTML navigations — network-first so users always get the latest deploy
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  // Everything else (css/js/images/fonts, same-origin or cross-origin)
  event.respondWith(staleWhileRevalidate(request));
});
