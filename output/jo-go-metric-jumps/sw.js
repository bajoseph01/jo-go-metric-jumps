/**
 * sw.js — Jo⚡Go Metric Jumps
 * Minimal service worker so the game works offline after the first visit.
 *
 * Strategy: network-first with cache fallback. The game always gets the
 * freshest files when online (so versioned asset URLs like ?v=11 stay in
 * sync), and works from the cache when offline. On install we pre-cache the
 * core files (versionless paths — cache matching ignores query strings).
 */
'use strict';

var CACHE = 'jogo-metric-jumps-v3';

var CORE = [
  './',
  './index.html',
  './css/styles.css',
  './js/math.js',
  './js/formatting.js',
  './js/questions.js',
  './js/worksheets.js',
  './js/scales.js',
  './js/pdf.js',
  './js/storage.js',
  './js/audio.js',
  './js/input.js',
  './js/ui.js',
  './js/game.js',
  './js/app.js',
  './assets/favicon.svg',
  './assets/icon-180.png',
  './manifest.webmanifest'
];

// Strip the cache-busting query (?v=N) for cache lookups.
function cacheKey(url) {
  return url.split('?')[0];
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(CORE).catch(function () { /* best effort */ }); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys
          .filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(cacheKey(e.request.url), copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(e.request, { ignoreSearch: true })
          .then(function (hit) { return hit || caches.match('./index.html'); });
      })
  );
});
