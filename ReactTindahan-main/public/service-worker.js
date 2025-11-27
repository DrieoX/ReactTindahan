/* eslint-disable no-restricted-globals */

const CACHE_NAME = "tindahan-cache-v1";

const urlsToCache = [
  "/",
  "/index.html",
  "/manifest.json",
  "/logo192.png",
  "/logo512.png"
];

// INSTALL
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
  console.log("✔ Service Worker Installed");
});

// FETCH — Offline First
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then(response =>
      response || fetch(event.request).catch(() => caches.match("/"))
    )
  );
});

// ACTIVATE — Clear Old Cache
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))
    )
  );
  self.clients.claim();
  console.log("🔥 Service Worker Active");
});
