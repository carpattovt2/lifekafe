const CACHE = 'lifekafe-v1'

// Static assets from Next.js build — cache-first (hashed filenames are immutable)
const STATIC_PATTERN = /\/_next\/static\//

// API and auth calls — always network, never cache
const SKIP_PATTERN = /\/(api|auth|_next\/image)\//

self.addEventListener('install', event => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Never cache API / auth / Supabase traffic
  if (SKIP_PATTERN.test(url.pathname)) return

  // Cache-first for immutable Next.js static chunks
  if (STATIC_PATTERN.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(response => {
          const clone = response.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
          return response
        })
      })
    )
    return
  }

  // Network-first for pages — fresh data when online, cached shell when offline
  event.respondWith(
    fetch(request)
      .then(response => {
        const clone = response.clone()
        caches.open(CACHE).then(c => c.put(request, clone))
        return response
      })
      .catch(() => caches.match(request))
  )
})
