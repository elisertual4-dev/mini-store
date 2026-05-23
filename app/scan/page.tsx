'use client'

import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'

type Product = {
  id: string
  name: string
  barcode: string | null
  price: number
  stock_qty: number
  low_stock_threshold: number
  category: string | null
}

type Mode = 'sale' | 'restock'

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)

  const [mode, setMode] = useState<Mode>('sale')
  const [scanning, setScanning] = useState(false)
  const [product, setProduct] = useState<Product | null>(null)
  const [qty, setQty] = useState(1)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    return () => {
      controlsRef.current?.stop()
    }
  }, [])

  async function startScan() {
    setError(null)
    setProduct(null)
    setStatus(null)
    setScanning(true)

    try {
      const reader = new BrowserMultiFormatReader()
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        async (result, err) => {
          if (result) {
            controlsRef.current?.stop()
            controlsRef.current = null
            setScanning(false)
            await lookupBarcode(result.getText())
          }
          if (err && !(err.message?.includes('No MultiFormat'))) {
            // suppress continuous not-found errors
          }
        }
      )
      controlsRef.current = controls
    } catch (e: unknown) {
      setError((e as Error).message)
      setScanning(false)
    }
  }

  async function lookupBarcode(barcode: string) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/products?barcode=${encodeURIComponent(barcode)}`)
      if (!res.ok) {
        setError(`Product not found for barcode: ${barcode}`)
        return
      }
      const data: Product = await res.json()
      setProduct(data)
      setQty(1)
    } catch {
      setError('Failed to fetch product')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit() {
    if (!product) return
    setLoading(true)
    setError(null)
    setStatus(null)

    try {
      if (mode === 'sale') {
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: product.id,
            qty,
            total: product.price * qty,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setStatus(`Sale recorded. Total: ₱${(product.price * qty).toFixed(2)}`)
      } else {
        const res = await fetch('/api/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: product.id, qty }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setStatus(`Restocked ${qty} units of "${product.name}"`)
      }
      setProduct(null)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center p-4 gap-4">
      <h1 className="text-xl font-bold mt-2">Barcode Scanner</h1>

      {/* Mode toggle */}
      <div className="flex rounded-full overflow-hidden border border-gray-700 w-full max-w-xs">
        <button
          onClick={() => { setMode('sale'); setProduct(null); setStatus(null) }}
          className={`flex-1 py-2 text-sm font-semibold transition-colors ${mode === 'sale' ? 'bg-blue-600' : 'bg-gray-800 text-gray-400'}`}
        >
          Sale Mode
        </button>
        <button
          onClick={() => { setMode('restock'); setProduct(null); setStatus(null) }}
          className={`flex-1 py-2 text-sm font-semibold transition-colors ${mode === 'restock' ? 'bg-green-600' : 'bg-gray-800 text-gray-400'}`}
        >
          Restock Mode
        </button>
      </div>

      {/* Camera */}
      <div className="w-full max-w-xs aspect-square bg-black rounded-xl overflow-hidden relative">
        <video ref={videoRef} className="w-full h-full object-cover" />
        {!scanning && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={startScan}
              className="bg-white text-black font-bold px-6 py-3 rounded-full text-sm"
            >
              Tap to Scan
            </button>
          </div>
        )}
        {scanning && (
          <div className="absolute inset-0 border-4 border-blue-400 rounded-xl pointer-events-none animate-pulse" />
        )}
      </div>

      {/* Manual barcode input */}
      <form
        className="w-full max-w-xs flex gap-2"
        onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem('barcode') as HTMLInputElement).value; if (v) lookupBarcode(v) }}
      >
        <input
          name="barcode"
          type="text"
          placeholder="Enter barcode manually"
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-gray-700 px-4 py-2 rounded text-sm">Go</button>
      </form>

      {loading && <p className="text-gray-400 text-sm">Loading…</p>}
      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      {status && <p className="text-green-400 text-sm text-center">{status}</p>}

      {/* Product card */}
      {product && (
        <div className="w-full max-w-xs bg-gray-800 rounded-xl p-4 flex flex-col gap-3">
          <div>
            <p className="font-bold text-lg">{product.name}</p>
            <p className="text-gray-400 text-sm">Barcode: {product.barcode}</p>
            <p className="text-gray-400 text-sm">Stock: <span className={product.stock_qty <= product.low_stock_threshold ? 'text-red-400' : 'text-green-400'}>{product.stock_qty} units</span></p>
            <p className="text-gray-400 text-sm">Price: ₱{product.price.toFixed(2)}</p>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => setQty(Math.max(1, qty - 1))} className="bg-gray-700 w-9 h-9 rounded-full text-lg font-bold">−</button>
            <span className="text-xl font-bold w-8 text-center">{qty}</span>
            <button onClick={() => setQty(qty + 1)} className="bg-gray-700 w-9 h-9 rounded-full text-lg font-bold">+</button>
          </div>

          {mode === 'sale' && (
            <p className="text-sm text-gray-300">Total: <span className="font-bold text-white">₱{(product.price * qty).toFixed(2)}</span></p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`w-full py-3 rounded-xl font-bold text-sm ${mode === 'sale' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'} disabled:opacity-50`}
          >
            {mode === 'sale' ? `Confirm Sale (₱${(product.price * qty).toFixed(2)})` : `Restock ${qty} units`}
          </button>

          <button onClick={() => setProduct(null)} className="text-gray-500 text-xs text-center">Cancel</button>
        </div>
      )}
    </main>
  )
}
