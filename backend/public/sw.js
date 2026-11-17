// Skinssence Lite Service Worker for PWA Installation
const CACHE_NAME = 'skinssence-lite-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Let network handle API requests directly
  if (event.request.url.includes('/api/')) {
    return;
  }
  // Network first with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
