/* MD Helper Service Worker - Offline-first caching */
var CACHE_NAME = "md-helper-v2";
var CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./i18n.js",
  "./favicon.svg",
  "./manifest.json",
  "./lib/github-markdown-light.css",
  "./lib/github.min.css",
  "./lib/marked.min.js"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(CORE_ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Skip analytics/tracking requests
  if (/googletagmanager\.com|google-analytics\.com/.test(url.hostname)) return;

  // Same-origin assets: stale-while-revalidate so offline works immediately and updates in background
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(req).then(function (cached) {
          var fetched = fetch(req).then(function (res) {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          }).catch(function () {
            return cached || cache.match("./index.html");
          });
          return cached || fetched;
        });
      })
    );
    return;
  }

  // CDN libraries (Highlight.js, Mermaid, KaTeX + fonts): cache-first once downloaded
  if (url.hostname === "cdn.jsdelivr.net") {
    event.respondWith(
      caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(req).then(function (cached) {
          if (cached) return cached;
          return fetch(req).then(function (res) {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          });
        });
      })
    );
  }
});
