// Hanz Mini Store service worker
// Strategy: network-first for navigations (with cached fallback so installed
// PWA still opens offline), network-first+cache for product barcode lookups
// (so scan works offline for previously seen products), pass-through for other
// /api calls, stale-while-revalidate for static assets.

const CACHE = 'hanz-mini-store-v12-offline'
const PRODUCTS_CACHE = 'hanz-products-api-v12'
const PRECACHE_URLS = ['/', '/scan', '/sale', '/inventory', '/dashboard', '/reports']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && k !== PRODUCTS_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED', cache: CACHE }))
      })
  )
})

// Strip cache-bust ?t= param so the same product URL always hits the same cache key
function normalizeProductUrl(url) {
  const u = new URL(url)
  u.searchParams.delete('t')
  return u.toString()
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Never cache cross-origin
  if (url.origin !== self.location.origin) return

  // Product barcode lookups: network-first, fall back to SW cache
  if (url.pathname === '/api/products' && url.searchParams.has('barcode')) {
    const cacheKey = normalizeProductUrl(req.url)
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(PRODUCTS_CACHE).then((c) => c.put(cacheKey, copy)).catch(() => {})
          }
          return res
        })
        .catch(() =>
          caches.open(PRODUCTS_CACHE)
            .then((c) => c.match(cacheKey))
            .then((cached) => cached || new Response(
              JSON.stringify({ error: 'Offline — product not cached yet' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            ))
        )
    )
    return
  }

  // All other API calls: pass through (no caching)
  if (url.pathname.startsWith('/api/')) return

  // Navigation requests: network-first, fall back to cached shell
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('/')))
    )
    return
  }

  // Static GETs: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
