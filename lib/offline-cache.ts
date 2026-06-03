// Offline support for the scan/sale workflow:
// - product barcode cache (so scans resolve offline)
// - queued transactions (so checkout works offline, syncs on reconnect)
//
// All access is localStorage-backed and guarded — when storage is blocked
// (in-app webviews, hard-private modes) every function degrades to a no-op
// instead of throwing.

export type CachedProduct = {
  id: string
  name: string
  barcode: string | null
  price: number
  stock_qty: number
  low_stock_threshold: number
  category: string | null
  image_url: string | null
}

export type QueuedTx = {
  id: string
  product_id: string
  qty: number
  total: number
  payment_method: 'cash' | 'credit'
  customer_name: string | null
  queued_at: string
}

const OFFLINE_QUEUE_KEY = 'offline_tx_queue_v1'
const PRODUCT_CACHE_KEY = 'product_barcode_cache_v1'

let lsAlive: boolean | null = null

function lsOk(): boolean {
  if (lsAlive !== null) return lsAlive
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem('__lstest_oc', '1')
    const got = window.localStorage.getItem('__lstest_oc')
    window.localStorage.removeItem('__lstest_oc')
    lsAlive = got === '1'
  } catch {
    lsAlive = false
  }
  return lsAlive
}

// ---- offline transaction queue ----

export function loadOfflineQueue(): QueuedTx[] {
  if (!lsOk()) return []
  try {
    const raw = window.localStorage.getItem(OFFLINE_QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveOfflineQueue(q: QueuedTx[]) {
  if (!lsOk()) return
  try { window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q)) } catch {}
}

// ---- product barcode cache ----

export function saveProductToCache(product: CachedProduct) {
  if (!lsOk() || !product.barcode) return
  try {
    const raw = window.localStorage.getItem(PRODUCT_CACHE_KEY)
    const cache: Record<string, CachedProduct> = raw ? JSON.parse(raw) : {}
    cache[product.barcode] = product
    window.localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(cache))
  } catch {}
}

export function getProductFromCache(barcode: string): CachedProduct | null {
  if (!lsOk()) return null
  try {
    const raw = window.localStorage.getItem(PRODUCT_CACHE_KEY)
    if (!raw) return null
    const cache: Record<string, CachedProduct> = JSON.parse(raw)
    return cache[barcode] ?? null
  } catch { return null }
}

export function cachedProductCount(): number {
  if (!lsOk()) return 0
  try {
    const raw = window.localStorage.getItem(PRODUCT_CACHE_KEY)
    if (!raw) return 0
    return Object.keys(JSON.parse(raw) as Record<string, CachedProduct>).length
  } catch { return 0 }
}

// Fetch the full catalog while online and seed the barcode cache so EVERY
// product resolves offline, not just ones individually scanned before.
// Returns number of products cached (0 on failure / offline).
export async function cacheAllProducts(): Promise<number> {
  if (!lsOk()) return 0
  try {
    const res = await fetch(`/api/products?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return 0
    const products: CachedProduct[] = await res.json()
    const cache: Record<string, CachedProduct> = {}
    for (const p of products) {
      if (p.barcode) cache[p.barcode] = p
    }
    window.localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(cache))
    return Object.keys(cache).length
  } catch { return 0 }
}
