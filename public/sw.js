/* Minimal Tempo service worker: enables installability + resilient desktop use.
 * - Cache-first for immutable build assets (_next/static), icons, manifest.
 * - Network-first for navigations (offline falls back to cached /).
 * - Network-only for /api (never cache auth or data responses).
 */
const STATIC_CACHE = "tempo-static-v1";
const PAGE_CACHE = "tempo-pages-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(["/", "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // network-only: auth + data stay fresh

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/fonts/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            // Store under the requested path, not "/". Storing every route as
            // "/" made offline reloads serve the wrong page's HTML.
            caches.open(PAGE_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit ?? caches.match("/"))
        )
    );
  }
});
