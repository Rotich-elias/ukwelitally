// Service Worker for UkweliTally PWA
//
// The cache exists for offline use, not to pin a deployment. Page
// navigations therefore go to the network first: a new deployment is picked
// up on the next load instead of being hidden behind an old cached page.
// Cached pages are only a fallback for a user who is offline.
const CACHE_NAME = 'ukwelitally-v2'
const OFFLINE_URL = '/offline'

// Assets to cache on install. The start page is not precached: it is
// network-first, so precaching it would only serve a stale build.
const STATIC_ASSETS = ['/offline', '/manifest.json']

// Install event - cache the offline shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

// Activate event - remove the caches of earlier versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  self.clients.claim()
})

// Put a successful response in the cache without delaying the response.
function cacheResponse(request, response) {
  if (!response || !response.ok) return response
  const responseClone = response.clone()
  caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone))
  return response
}

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const request = event.request

  // Only GET requests of this origin can be cached.
  if (!request.url.startsWith(self.location.origin)) return
  if (request.method !== 'GET') return

  // API requests are network-first: a stale response is worse than none.
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => cacheResponse(request, response))
        .catch(() => caches.match(request))
    )
    return
  }

  // A page navigation is network-first, so a deployment is seen immediately
  // by a user who is online. The cached page is only for offline use.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => cacheResponse(request, response))
        .catch(async () => {
          return (await caches.match(request)) || caches.match(OFFLINE_URL)
        })
    )
    return
  }

  // The files under /_next/static/ carry a content hash in their name, so a
  // given URL never changes: serving the cached copy is safe.
  if (request.url.includes('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => cacheResponse(request, response))
      })
    )
    return
  }

  // Everything else (icons, images) is served from the cache when present and
  // refreshed in the background for the next load.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => cacheResponse(request, response))
        .catch(() => cached)
      return cached || network
    })
  )
})

// Background sync for pending submissions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-submissions') {
    event.waitUntil(syncPendingSubmissions())
  }
})

// Sync pending submissions from IndexedDB
async function syncPendingSubmissions() {
  try {
    // This would integrate with IndexedDB to sync offline submissions
    console.log('Syncing pending submissions...')
    // Implementation would go here
  } catch (error) {
    console.error('Error syncing pending submissions:', error)
  }
}

// Handle push notifications (future enhancement)
self.addEventListener('push', (event) => {
  const data = event.data.json()
  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    data: data.data,
  }

  event.waitUntil(self.registration.showNotification(data.title, options))
})

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url || '/'))
})
