'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

type Product = {
  id: string
  name: string
  barcode: string | null
  price: number
  stock_qty: number
  low_stock_threshold: number
  category: string | null
}

function SaleContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const barcode = searchParams.get('barcode') ?? ''

  const [product, setProduct] = useState<Product | null>(null)
  const [qty, setQty] = useState(1)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!barcode) { setError('No barcode provided'); setLoading(false); return }
    fetch(`/api/products?barcode=${encodeURIComponent(barcode)}`)
      .then(r => r.ok ? r.json() : Promise.reject('Product not found for barcode: ' + barcode))
      .then((data: Product) => { setProduct(data); setLoading(false) })
      .catch((e: unknown) => { setError(typeof e === 'string' ? e : 'Failed to load product'); setLoading(false) })
  }, [barcode])

  async function handleSale() {
    if (!product) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, qty, total: product.price * qty }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess(`Sale recorded. Total: ₱${(product.price * qty).toFixed(2)}`)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <p className="text-gray-400">Loading product…</p>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center p-4 gap-4">
      <div className="w-full max-w-xs flex items-center gap-3 mt-2">
        <button onClick={() => router.push('/scan')} className="text-gray-400 text-sm hover:text-white">← Back</button>
        <h1 className="text-xl font-bold">Confirm Sale</h1>
      </div>

      {error && (
        <div className="w-full max-w-xs flex flex-col gap-3">
          <p className="text-red-400 text-sm text-center">{error}</p>
          <button onClick={() => router.push('/scan')} className="w-full bg-gray-800 py-2 rounded-xl text-sm">Back to Scanner</button>
        </div>
      )}

      {success && (
        <div className="w-full max-w-xs flex flex-col gap-3 text-center mt-4">
          <div className="bg-gray-800 rounded-xl p-6 flex flex-col gap-2">
            <p className="text-green-400 text-lg font-semibold">{success}</p>
            {product && <p className="text-gray-400 text-sm">{product.name} × {qty}</p>}
          </div>
          <button onClick={() => router.push('/scan')} className="bg-blue-600 hover:bg-blue-700 py-3 rounded-xl font-bold text-sm">
            Scan Next Item
          </button>
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 text-xs">View Dashboard</button>
        </div>
      )}

      {product && !success && (
        <div className="w-full max-w-xs bg-gray-800 rounded-xl p-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="font-bold text-lg">{product.name}</p>
            {product.category && <p className="text-gray-500 text-xs uppercase tracking-wide">{product.category}</p>}
            <p className="text-gray-400 text-sm">Barcode: {product.barcode}</p>
            <p className="text-gray-400 text-sm">
              Stock:{' '}
              <span className={product.stock_qty <= product.low_stock_threshold ? 'text-red-400' : 'text-green-400'}>
                {product.stock_qty} units
              </span>
            </p>
            <p className="text-gray-400 text-sm">Price: <span className="text-white font-semibold">₱{product.price.toFixed(2)}</span></p>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Quantity</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="bg-gray-700 w-9 h-9 rounded-full text-lg font-bold hover:bg-gray-600"
              >−</button>
              <span className="text-xl font-bold w-8 text-center">{qty}</span>
              <button
                onClick={() => setQty(Math.min(product.stock_qty, qty + 1))}
                className="bg-gray-700 w-9 h-9 rounded-full text-lg font-bold hover:bg-gray-600"
              >+</button>
            </div>
          </div>

          <div className="border-t border-gray-700 pt-3 flex justify-between items-center">
            <span className="text-gray-400 text-sm">Total</span>
            <span className="text-xl font-bold">₱{(product.price * qty).toFixed(2)}</span>
          </div>

          <button
            onClick={handleSale}
            disabled={submitting || product.stock_qty === 0}
            className="w-full py-3 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Processing…' : `Confirm Sale · ₱${(product.price * qty).toFixed(2)}`}
          </button>

          <button onClick={() => router.push('/scan')} className="text-gray-500 text-xs text-center hover:text-gray-300">Cancel</button>
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
