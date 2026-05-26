'use client'

import { Suspense, useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

type Product = {
  id: string
  name: string
  barcode: string | null
  price: number
  stock_qty: number
  low_stock_threshold: number
  category: string | null
  image_url: string | null
}

type CartItem = {
  id: string
  name: string
  barcode: string | null
  price: number
  stock_qty: number
  category: string | null
  image_url: string | null
  qty: number
}

const CART_KEY = 'sale_cart_v1'

function loadCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CART_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveCart(items: CartItem[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(items))
  } catch { /* quota — non-fatal */ }
}

function SaleContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const barcode = searchParams.get('barcode') ?? ''

  const [cart, setCart] = useState<CartItem[]>([])
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ total: number; count: number; method: 'cash' | 'credit'; customer?: string } | null>(null)

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit'>('cash')
  const [customerName, setCustomerName] = useState('')
  const [customers, setCustomers] = useState<string[]>([])
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const customerWrapRef = useRef<HTMLDivElement>(null)

  // Hydrate cart from localStorage on mount
  useEffect(() => {
    setCart(loadCart())
  }, [])

  // Persist cart on every change (skip first render to avoid clobbering
  // the just-hydrated value with the initial empty array).
  const persistInitRef = useRef(true)
  useEffect(() => {
    if (persistInitRef.current) { persistInitRef.current = false; return }
    saveCart(cart)
  }, [cart])

  // Add a scanned barcode to the cart. Re-used by the URL-param path and
  // the localStorage-handoff path so same logic runs either way.
  const addBarcodeToCart = useCallback(async (code: string) => {
    setScanLoading(true)
    setScanError(null)
    try {
      const res = await fetch(`/api/products?barcode=${encodeURIComponent(code)}&t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Product not found for barcode: ' + code)
      const p: Product = await res.json()
      setCart(prev => {
        const idx = prev.findIndex(it => it.id === p.id)
        if (idx >= 0) {
          const next = [...prev]
          const newQty = next[idx].qty + 1
          if (newQty > p.stock_qty) {
            setScanError(`Only ${p.stock_qty} ${p.name} in stock`)
            return prev
          }
          next[idx] = { ...next[idx], qty: newQty, stock_qty: p.stock_qty, price: p.price, image_url: p.image_url }
          return next
        }
        if (p.stock_qty < 1) {
          setScanError(`${p.name} is out of stock`)
          return prev
        }
        return [...prev, {
          id: p.id, name: p.name, barcode: p.barcode, price: p.price,
          stock_qty: p.stock_qty, category: p.category, image_url: p.image_url, qty: 1,
        }]
      })
    } catch (e: unknown) {
      setScanError(e instanceof Error ? e.message : 'Failed to add product')
    } finally {
      setScanLoading(false)
    }
  }, [])

  // Drain any barcode pending in localStorage (the scanner writes it
  // before navigating). Run on mount + on visibility/pageshow so that
  // returning to a backgrounded /sale tab in PWA still picks it up.
  const drainPendingBarcode = useCallback(async () => {
    try {
      const pending = window.localStorage.getItem('pending_sale_barcode')
      if (!pending) return
      window.localStorage.removeItem('pending_sale_barcode')
      await addBarcodeToCart(pending)
    } catch { /* storage blocked */ }
  }, [addBarcodeToCart])

  useEffect(() => {
    drainPendingBarcode()
    const onVis = () => { if (document.visibilityState === 'visible') drainPendingBarcode() }
    const onShow = () => { drainPendingBarcode() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pageshow', onShow)
    window.addEventListener('focus', onShow)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pageshow', onShow)
      window.removeEventListener('focus', onShow)
    }
  }, [drainPendingBarcode])

  // Fallback: also handle ?barcode=X URL param for backwards-compat
  // (and for cases where localStorage is unavailable). De-duped by the
  // url-search-string so each unique URL is processed exactly once per mount.
  const handledQueryRef = useRef<string | null>(null)
  useEffect(() => {
    if (!barcode) return
    const sig = barcode + '|' + (searchParams.get('t') ?? '')
    if (handledQueryRef.current === sig) return
    handledQueryRef.current = sig
    addBarcodeToCart(barcode).finally(() => {
      // Strip query so a back-button re-visit doesn't re-add.
      router.replace('/sale')
    })
  }, [barcode, searchParams, router, addBarcodeToCart])

  // Load customer list when switching to credit
  useEffect(() => {
    if (paymentMethod !== 'credit') return
    fetch('/api/customers')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: { customers: string[] }) => setCustomers(d.customers))
      .catch(() => { /* non-fatal */ })
  }, [paymentMethod])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (customerWrapRef.current && !customerWrapRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const updateQty = useCallback((id: string, delta: number) => {
    setCart(prev => {
      return prev.map(it => {
        if (it.id !== id) return it
        const newQty = it.qty + delta
        if (newQty < 1) return it
        if (newQty > it.stock_qty) return it
        return { ...it, qty: newQty }
      })
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setCart(prev => prev.filter(it => it.id !== id))
  }, [])

  const clearCart = useCallback(() => {
    setCart([])
  }, [])

  const totalAmount = cart.reduce((s, it) => s + it.price * it.qty, 0)
  const totalUnits = cart.reduce((s, it) => s + it.qty, 0)

  async function handleCheckout() {
    if (cart.length === 0) return
    if (paymentMethod === 'credit' && !customerName.trim()) {
      setCheckoutError('Customer name required for credit sale')
      return
    }

    setCheckoutLoading(true)
    setCheckoutError(null)
    const trimmedCustomer = customerName.trim()
    try {
      // Sequential POSTs so a mid-fail stops further charges
      for (const item of cart) {
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: item.id,
            qty: item.qty,
            total: item.price * item.qty,
            payment_method: paymentMethod,
            customer_name: paymentMethod === 'credit' ? trimmedCustomer : null,
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(`${item.name}: ${j.error ?? `failed (${res.status})`}`)
        }
      }
      setSuccess({
        total: totalAmount,
        count: cart.length,
        method: paymentMethod,
        customer: paymentMethod === 'credit' ? trimmedCustomer : undefined,
      })
      setCart([])
      setCustomerName('')
    } catch (e: unknown) {
      setCheckoutError(e instanceof Error ? e.message : 'Checkout failed')
    } finally {
      setCheckoutLoading(false)
    }
  }

  // Success screen
  if (success) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center p-4">
        <div className="w-full max-w-md flex flex-col gap-4 mt-8">
          <div className="bg-gradient-to-br from-green-900/40 to-gray-900 border border-green-700/40 rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/20 border border-green-400 flex items-center justify-center">
              <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-green-300">
              {success.method === 'credit' ? 'Credit Recorded' : 'Sale Complete'}
            </h2>
            {success.customer && <p className="text-sm text-gray-400">for <strong className="text-white">{success.customer}</strong></p>}
            <p className="text-3xl font-bold tracking-tight">₱{success.total.toFixed(2)}</p>
            <p className="text-xs text-gray-500">{success.count} item{success.count !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => { setSuccess(null); router.push('/scan') }}
            className="bg-blue-600 hover:bg-blue-700 py-3 rounded-xl font-bold text-sm"
          >
            Start New Sale
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-500 hover:text-gray-300 text-xs text-center"
          >
            View Dashboard
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center p-4 gap-4 pb-32">
      <div className="w-full max-w-md flex items-center gap-3 mt-2">
        <button onClick={() => router.push('/scan')} className="text-gray-400 text-sm hover:text-white">← Scanner</button>
        <h1 className="text-xl font-bold flex-1">Sale Cart</h1>
        {cart.length > 0 && (
          <button
            onClick={() => {
              if (confirm('Clear entire cart?')) clearCart()
            }}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Clear all
          </button>
        )}
      </div>

      {scanLoading && (
        <div className="w-full max-w-md bg-blue-900/30 border border-blue-700/40 rounded-xl px-4 py-3 text-sm text-blue-300 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-700 border-t-blue-300 rounded-full animate-spin" />
          Adding to cart…
        </div>
      )}
      {scanError && (
        <div className="w-full max-w-md bg-red-900/30 border border-red-700/40 rounded-xl px-4 py-3 text-sm text-red-300 flex items-start justify-between gap-2">
          <span>{scanError}</span>
          <button onClick={() => setScanError(null)} className="text-red-400 hover:text-red-200 -mt-0.5">×</button>
        </div>
      )}

      {/* Cart */}
      {cart.length === 0 ? (
        <div className="w-full max-w-md bg-gray-800/40 border border-gray-700 rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
          <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
          </svg>
          <p className="text-sm text-gray-400">Cart is empty</p>
          <p className="text-xs text-gray-500">Scan a product to add it</p>
        </div>
      ) : (
        <div className="w-full max-w-md flex flex-col gap-2">
          {cart.map(item => (
            <div key={item.id} className="bg-gray-800 rounded-xl p-3 flex items-center gap-3">
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-700 flex-shrink-0 flex items-center justify-center">
                {item.image_url
                  ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  : <span className="text-lg opacity-40">📦</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{item.name}</p>
                <p className="text-xs text-gray-500">₱{item.price.toFixed(2)} · {item.stock_qty} in stock</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    onClick={() => updateQty(item.id, -1)}
                    disabled={item.qty <= 1}
                    className="w-7 h-7 rounded-full bg-gray-700 hover:bg-gray-600 text-sm font-bold disabled:opacity-30"
                  >−</button>
                  <span className="text-sm font-bold w-6 text-center">{item.qty}</span>
                  <button
                    onClick={() => updateQty(item.id, 1)}
                    disabled={item.qty >= item.stock_qty}
                    className="w-7 h-7 rounded-full bg-gray-700 hover:bg-gray-600 text-sm font-bold disabled:opacity-30"
                  >+</button>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="text-sm font-bold">₱{(item.price * item.qty).toFixed(2)}</span>
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                  aria-label="Remove"
                >Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add more button */}
      <button
        onClick={() => router.push('/scan')}
        className="w-full max-w-md bg-gray-800 hover:bg-gray-700 border-2 border-dashed border-gray-700 rounded-xl py-3 text-sm font-semibold text-gray-300 flex items-center justify-center gap-2 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Scan more items
      </button>

      {cart.length > 0 && (
        <>
          {/* Payment section */}
          <div className="w-full max-w-md bg-gray-800 rounded-xl p-4 flex flex-col gap-3">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Payment</span>
            <div className="flex rounded-xl overflow-hidden border border-gray-700">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${paymentMethod === 'cash' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              >
                CASH
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('credit')}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${paymentMethod === 'credit' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              >
                CREDIT
              </button>
            </div>
            {paymentMethod === 'credit' && (
              <div ref={customerWrapRef} className="relative">
                <input
                  type="text"
                  value={customerName}
                  onChange={e => { setCustomerName(e.target.value); setShowCustomerDropdown(true) }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder={customers.length ? 'Search or type new customer' : 'Customer name'}
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                  maxLength={120}
                  autoComplete="off"
                />
                {showCustomerDropdown && (() => {
                  const q = customerName.trim().toLowerCase()
                  const matches = q
                    ? customers.filter(c => c.toLowerCase().includes(q))
                    : customers
                  const exact = q && customers.some(c => c.toLowerCase() === q)
                  if (matches.length === 0 && !q) return null
                  return (
                    <div className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-gray-800 border border-gray-600 rounded-xl shadow-xl">
                      {matches.length > 0 ? (
                        matches.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => { setCustomerName(c); setShowCustomerDropdown(false) }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors ${c.toLowerCase() === q ? 'text-amber-400' : 'text-gray-200'}`}
                          >
                            {c}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-xs text-gray-500">No match — will create new customer</div>
                      )}
                      {q && !exact && matches.length > 0 && (
                        <div className="px-3 py-2 text-xs text-gray-500 border-t border-gray-700">
                          New customer &quot;{customerName.trim()}&quot;
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>

          {checkoutError && (
            <div className="w-full max-w-md bg-red-900/30 border border-red-700/40 rounded-xl px-4 py-3 text-sm text-red-300">
              {checkoutError}
            </div>
          )}
        </>
      )}

      {/* Sticky checkout footer */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-950/95 backdrop-blur-md border-t border-gray-800 p-4 z-30">
          <div className="max-w-md mx-auto flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 uppercase tracking-wider">Total ({totalUnits} {totalUnits === 1 ? 'item' : 'items'})</span>
              <span className="text-2xl font-bold">₱{totalAmount.toFixed(2)}</span>
            </div>
            <button
              onClick={handleCheckout}
              disabled={checkoutLoading}
              className={`flex-1 py-3 rounded-xl font-bold text-sm disabled:opacity-50 transition-colors ${paymentMethod === 'credit' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-500'} text-white`}
            >
              {checkoutLoading ? 'Processing…' : (paymentMethod === 'credit' ? 'Confirm Credit' : 'Checkout')}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

export default function SalePage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </main>
    }>
      <SaleContent />
    </Suspense>
  )
}
