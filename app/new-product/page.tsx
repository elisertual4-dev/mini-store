'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'react-qr-code'
import { resizeImage } from '@/lib/resize-image'

type CreatedProduct = {
  id: string
  name: string
  barcode: string
  price: number
  category: string | null
}

export default function NewProductPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    category: '',
    original_price: '',
    price: '',
    stock_qty: '0',
    low_stock_threshold: '5',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedProduct | null>(null)

  const [categories, setCategories] = useState<string[]>([])
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const categoryComboRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/inventory')
      .then(r => r.json())
      .then((data: { category: string | null }[]) => {
        if (!Array.isArray(data)) return
        const uniq = Array.from(new Set(data.map(p => p.category).filter(Boolean))) as string[]
        setCategories(uniq.sort())
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!showCategoryDropdown) return
    function handleClickOutside(e: MouseEvent) {
      if (categoryComboRef.current && !categoryComboRef.current.contains(e.target as Node)) {
        setShowCategoryDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showCategoryDropdown])

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setPhotoFile(file)
      setPhotoUrl(URL.createObjectURL(file))
    }
  }

  async function handleSubmit() {
    if (!form.name || !form.price) return
    setSubmitting(true)
    setError(null)
    try {
      const barcode =
        (Date.now() % 100000000).toString().padStart(8, '0') +
        Math.floor(Math.random() * 9999).toString().padStart(4, '0')

      let image_url: string | null = null
      if (photoFile) {
        const resized = await resizeImage(photoFile)
        const fd = new FormData()
        fd.append('file', resized)
        const uploadRes = await fetch('/api/upload-image', { method: 'POST', body: fd })
        const uploadData = await uploadRes.json()
        if (!uploadRes.ok) throw new Error(uploadData.error ?? `Upload failed (${uploadRes.status})`)
        image_url = uploadData.url
      }

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          barcode,
          category: form.category || null,
          price: parseFloat(form.price),
          original_price: parseFloat(form.original_price) || 0,
          stock_qty: parseInt(form.stock_qty) || 0,
          low_stock_threshold: parseInt(form.low_stock_threshold) || 5,
          image_url,
        }),
      })
      const text = await res.text()
      const data = text ? JSON.parse(text) : {}
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`)
      setCreated({ ...data, barcode })
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (created) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center p-4 gap-4">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #barcode-print-area, #barcode-print-area * { visibility: visible; }
            #barcode-print-area {
              position: fixed;
              inset: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              background: white;
            }
          }
        `}</style>

        <div
          id="barcode-print-area"
          style={{ position: 'absolute', left: '-9999px', top: 0 }}
          aria-hidden="true"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px', fontFamily: 'sans-serif' }}>
            <p style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px', textAlign: 'center' }}>{created.name}</p>
            <QRCode value={created.barcode} size={120} />
            <p style={{ marginTop: '6px', fontSize: '11px', fontFamily: 'monospace' }}>{created.barcode}</p>
            <p style={{ marginTop: '2px', fontSize: '13px' }}>₱{created.price.toFixed(2)}</p>
          </div>
        </div>

        <div className="w-full max-w-xs mt-2">
          <div className="text-center mb-5">
            <div className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-3 shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-bold">Product Created!</h2>
            <p className="text-gray-400 text-sm mt-1">{created.name}</p>
          </div>

          <div className="bg-white rounded-xl p-4 flex flex-col items-center gap-2 mb-4">
            <p className="text-black text-sm font-semibold text-center">{created.name}</p>
            <QRCode value={created.barcode} size={100} />
            <p className="text-gray-400 text-xs font-mono">{created.barcode}</p>
            <p className="text-gray-600 text-xs">₱{created.price.toFixed(2)}</p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => window.print()}
              className="w-full py-3 rounded-xl font-bold text-sm bg-purple-600 hover:bg-purple-700 transition-colors"
            >
              Print Barcode
            </button>
            <button
              onClick={() => router.push('/scan')}
              className="w-full py-3 rounded-xl font-bold text-sm bg-green-600 hover:bg-green-700 transition-colors"
            >
              Back to Scanner
            </button>
            <button
              onClick={() => router.push('/inventory')}
              className="text-gray-500 text-xs text-center hover:text-gray-300 py-1"
            >
              View Inventory
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center p-4 gap-4">
      <div className="w-full max-w-xs flex items-center gap-3 mt-2">
        <button onClick={() => router.back()} className="text-gray-400 text-sm hover:text-white">← Back</button>
        <h1 className="text-xl font-bold">Add New Product</h1>
      </div>

      {/* Photo capture */}
      <div className="w-full max-w-xs">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoChange}
          className="hidden"
        />
        {photoUrl ? (
          <div className="relative">
            <img src={photoUrl} alt="Product" className="w-full rounded-xl object-cover max-h-52" />
            <button
              onClick={() => { setPhotoFile(null); setPhotoUrl(null); if (fileRef.current) fileRef.current.value = '' }}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold hover:bg-black/80"
            >✕</button>
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-2 right-2 bg-black/60 text-white rounded-lg px-3 py-1 text-xs font-medium hover:bg-black/80"
            >Retake</button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-700 rounded-xl py-8 flex flex-col items-center gap-2 text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            <span className="text-sm font-medium">Take Product Photo</span>
            <span className="text-xs text-gray-500">Optional — helps identify the item</span>
          </button>
        )}
      </div>

      {/* Form fields */}
      <div className="w-full max-w-xs flex flex-col gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Product Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Coca Cola 1.5L"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div className="relative" ref={categoryComboRef}>
          <label className="block text-xs font-medium text-gray-400 mb-1">Category</label>
          <input
            type="text"
            value={form.category}
            onChange={e => { setForm(f => ({ ...f, category: e.target.value })); setShowCategoryDropdown(true) }}
            onFocus={() => setShowCategoryDropdown(true)}
            placeholder="Select or type new…"
            autoComplete="off"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          {showCategoryDropdown && categories.length > 0 && (() => {
            const q = form.category.toLowerCase().trim()
            const matches = q ? categories.filter(c => c.toLowerCase().includes(q)) : categories
            const exactMatch = categories.some(c => c.toLowerCase() === q)
            const showNew = q.length > 0 && !exactMatch
            if (matches.length === 0 && !showNew) return null
            return (
              <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                {matches.map(c => (
                  <button
                    key={c}
                    type="button"
                    onMouseDown={() => { setForm(f => ({ ...f, category: c })); setShowCategoryDropdown(false) }}
                    className="w-full text-left px-3 py-2.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                  >
                    {c}
                  </button>
                ))}
                {showNew && (
                  <div className="px-3 py-2 text-xs text-gray-500 border-t border-gray-700 flex items-center gap-1.5">
                    <span className="bg-green-500/15 text-green-400 border border-green-500/20 rounded px-1.5 py-0.5 font-medium">New</span>
                    <span className="text-gray-300">&ldquo;{form.category}&rdquo; will be saved as new category</span>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Pricing block */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-3 flex flex-col gap-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pricing</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Original Price (₱)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₱</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.original_price}
                  onChange={e => setForm(f => ({ ...f, original_price: e.target.value }))}
                  placeholder="0.00"
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Selling Price (₱) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₱</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="0.00"
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          {/* Revenue computed display */}
          {(() => {
            const orig = parseFloat(form.original_price) || 0
            const sell = parseFloat(form.price) || 0
            const revenue = sell - orig
            const hasValues = form.original_price !== '' || form.price !== ''
            if (!hasValues) return null
            return (
              <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                revenue > 0 ? 'bg-green-500/10 border border-green-500/20' :
                revenue < 0 ? 'bg-red-500/10 border border-red-500/20' :
                'bg-gray-700/50 border border-gray-700'
              }`}>
                <span className="text-gray-400 text-xs font-medium">Revenue per unit</span>
                <span className={`font-bold text-sm ${
                  revenue > 0 ? 'text-green-400' :
                  revenue < 0 ? 'text-red-400' :
                  'text-gray-400'
                }`}>
                  {revenue >= 0 ? '+' : ''}₱{revenue.toFixed(2)}
                </span>
              </div>
            )
          })()}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Initial Stock</label>
            <input
              type="number"
              min="0"
              value={form.stock_qty}
              onChange={e => setForm(f => ({ ...f, stock_qty: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Low Stock Alert</label>
            <input
              type="number"
              min="0"
              value={form.low_stock_threshold}
              onChange={e => setForm(f => ({ ...f, low_stock_threshold: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || !form.name || !form.price}
          className="w-full py-3 rounded-xl font-bold text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors mt-1"
        >
          {submitting ? 'Creating…' : 'Add Product & Generate Barcode'}
        </button>
      </div>
    </main>
  )
}
