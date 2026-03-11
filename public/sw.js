// Kill-switch service worker.
// This file exists solely to unregister itself if a browser previously cached
// it.  Drop this at /sw.js so it matches the default service worker scope.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister()),
  );
});
