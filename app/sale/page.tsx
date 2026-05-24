'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { resizeImage } from '@/lib/resize-image'

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
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!barcode) { router.replace('/scan'); return }
    fetch(`/api/products?barcode=${encodeURIComponent(barcode)}`)
      .then(r => r.ok ? r.json() : Promise.reject('Product not found for barcode: ' + barcode))
      .then((data: Product) => { setProduct(data); setLoading(false) })
      .catch((e: unknown) => { setError(typeof e === 'string' ? e : 'Failed to load product'); setLoading(false) })
  }, [barcode])

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !product) return
    setUploadingPhoto(true)
    try {
      const resized = await resizeImage(file)
      const fd = new FormData()
      fd.append('file', resized)
      const uploadRes = await fetch('/api/upload-image', { method: 'POST', body: fd })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error)

      const patchRes = await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, image_url: uploadData.url }),
      })
      if (!patchRes.ok) {
        const patchData = await patchRes.json()
        throw new Error(patchData.error ?? 'Failed to save image')
      }
      setProduct(p => p ? { ...p, image_url: uploadData.url } : p)
    } catch (e: unknown) {
      setError('Photo upload failed: ' + ((e as Error).message ?? 'unknown error'))
    } finally {
      setUploadingPhoto(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

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
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">Loading product…</p>
      </div>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center p-4 gap-4">
      {/* Hidden camera input */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoCapture}
      />

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
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            {product?.image_url && (
              <img src={product.image_url} alt={product.name} className="w-full h-36 object-cover" />
            )}
            <div className="p-6 flex flex-col gap-1">
              <p className="text-green-400 text-lg font-semibold">{success}</p>
              {product && <p className="text-gray-400 text-sm">{product.name} × {qty}</p>}
            </div>
          </div>
          <button onClick={() => router.push('/scan')} className="bg-blue-600 hover:bg-blue-700 py-3 rounded-xl font-bold text-sm">
            Scan Next Item
          </button>
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 text-xs">View Dashboard</button>
        </div>
      )}

      {product && !success && (
        <div className="w-full max-w-xs bg-gray-800 rounded-xl overflow-hidden flex flex-col">
          {/* Product image / photo capture */}
          {product.image_url ? (
            <div className="relative">
              <img src={product.image_url} alt={product.name} className="w-full h-48 object-cover" />
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-lg px-2.5 py-1 text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Retake
              </button>
            </div>
          ) : (
            <button
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="w-full h-36 bg-gray-700 hover:bg-gray-600 border-b border-gray-600 flex flex-col items-center justify-center gap-2 transition-colors group"
            >
              {uploadingPhoto ? (
                <>
                  <div className="w-6 h-6 border-2 border-gray-500 border-t-blue-400 rounded-full animate-spin" />
                  <span className="text-xs text-gray-400">Saving photo…</span>
                </>
              ) : (
                <>
                  <svg className="w-10 h-10 text-gray-500 group-hover:text-gray-300 transition-colors" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                  <span className="text-sm text-gray-400 group-hover:text-gray-200 transition-colors font-medium">Tap to add product photo</span>
                  <span className="text-xs text-gray-600">Saves to inventory automatically</span>
                </>
              )}
            </button>
          )}

          <div className="p-4 flex flex-col gap-4">
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
