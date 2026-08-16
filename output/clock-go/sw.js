/**
 * sw.js — Tick⚡Tock
 * Network-first with cache fallback, so the app updates whenever it is
 * online and still works offline after the first visit.
 */
'use strict';

var CACHE = 'ticktock-v2';

var CORE = [
  './',
  './index.html',
  './css/styles.css',
  './js/clock.js',
  './js/storage.js',
  './js/pdf.js',
  './js/audio.js',
  './js/ui.js',
  './js/app.js'
];

function cacheKey(url) { return url.split('?')[0]; }

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
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
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
