"use strict";

const CACHE_NAME = "tokoh-tekaan-v3";
const APP_SHELL = [
  "./",
  "index.html",
  "style.css",
  "game.js",
  "manifest.json",
  "bank.json",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/tokoh/placeholder.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const cachedResponse = await caches.match(event.request);

        if (cachedResponse) {
          return cachedResponse;
        }

        const networkResponse = await fetch(event.request);

        if (networkResponse.ok) {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, networkResponse.clone());
          } catch {
            // Cache failures must not prevent returning the network response.
          }
        }

        return networkResponse;
      } catch {
        return fetch(event.request);
      }
    })()
  );
});