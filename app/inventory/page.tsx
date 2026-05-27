'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import QRCode from 'react-qr-code'
import type { StockLevel, InventoryLog } from '@/lib/inventory'
import { resizeImage } from '@/lib/resize-image'

type Product = {
  id: string
  name: string
  barcode: string | null
  price: number
  category: string | null
  stock_qty: number
  low_stock_threshold: number
  image_url: string | null
}

export default function InventoryPage() {
  const [products, setProducts] = useState<StockLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const [editProduct, setEditProduct] = useState<StockLevel | null>(null)
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustNote, setAdjustNote] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editOriginalPrice, setEditOriginalPrice] = useState('')
  const [editName, setEditName] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)

  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', barcode: '', category: '', price: '', stock_qty: '0', low_stock_threshold: '5' })
  const [addLoading, setAddLoading] = useState(false)
  const [addPhotoFile, setAddPhotoFile] = useState<File | null>(null)
  const [addPhotoPreview, setAddPhotoPreview] = useState<string | null>(null)
  const addFileRef = useRef<HTMLInputElement>(null)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const categoryComboRef = useRef<HTMLDivElement>(null)

  const [historyProduct, setHistoryProduct] = useState<StockLevel | null>(null)
  const [logs, setLogs] = useState<InventoryLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  const [printProduct, setPrintProduct] = useState<StockLevel | null>(null)
  const [printBarcode, setPrintBarcode] = useState<string>('')
  const [savingBarcode, setSavingBarcode] = useState(false)

  const [deleteProduct, setDeleteProduct] = useState<StockLevel | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const rowFileRef = useRef<HTMLInputElement>(null)
  const rowFileTargetId = useRef<string | null>(null)

  async function handleRowImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const productId = rowFileTargetId.current
    if (!file || !productId) return
    setUploadingImageFor(productId)
    setUploadError(null)
    try {
      const resized = await resizeImage(file)
      const fd = new FormData()
      fd.append('file', resized)
      const res = await fetch('/api/upload-image', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`)
      const patchRes = await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productId, image_url: data.url }),
      })
      if (!patchRes.ok) {
        const patchData = await patchRes.json()
        throw new Error(patchData.error ?? `Save failed (${patchRes.status})`)
      }
      await fetchProducts()
    } catch (e: unknown) {
      setUploadError((e as Error).message ?? 'Upload failed')
    } finally {
      setUploadingImageFor(null)
      if (rowFileRef.current) rowFileRef.current.value = ''
    }
  }

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/inventory')
      const data = await res.json()
      setProducts(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])

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

  // Categories are stored as free-text on each product, so "Snacks", "snacks"
  // and "Snacks " get treated as separate buckets even though the operator
  // meant one. Group case-insensitively + trimmed, pick the most common
  // capitalization as the display label, and filter against the normalized
  // key so all variants match.
  const categories = useMemo(() => {
    const map = new Map<string, { displays: Record<string, number>; count: number }>()
    for (const p of products) {
      if (!p.category) continue
      const trimmed = p.category.trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      const entry = map.get(key) ?? { displays: {}, count: 0 }
      entry.displays[trimmed] = (entry.displays[trimmed] ?? 0) + 1
      entry.count += 1
      map.set(key, entry)
    }
    return Array.from(map.entries())
      .map(([key, v]) => {
        const display = Object.entries(v.displays).sort((a, b) => b[1] - a[1])[0][0]
        return { key, display, count: v.count }
      })
      .sort((a, b) => a.display.localeCompare(b.display))
  }, [products])

  const q = searchQuery.trim().toLowerCase()
  const filtered = products.filter(p => {
    if (lowStockOnly && !p.is_low_stock) return false
    if (categoryFilter && (p.category?.trim().toLowerCase() ?? '') !== categoryFilter) return false
    if (q) {
      const hay = `${p.name} ${p.barcode ?? ''} ${p.category ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  async function handleAdjust() {
    if (!editProduct) return
    const qtyChanged = adjustQty !== 0
    const priceNum = editPrice === '' ? null : Number(editPrice)
    const origNum = editOriginalPrice === '' ? null : Number(editOriginalPrice)
    const priceChanged = priceNum !== null && priceNum !== editProduct.price
    const origChanged = origNum !== null && origNum !== editProduct.original_price
    const trimmedName = editName.trim()
    const nameChanged = trimmedName !== '' && trimmedName !== editProduct.name

    if (!qtyChanged && !priceChanged && !origChanged && !nameChanged) {
      setEditError('Change name, qty, selling price, or original price first')
      return
    }
    if (editName !== '' && trimmedName === '') {
      setEditError('Name cannot be blank')
      return
    }
    if (qtyChanged && !adjustNote.trim()) {
      setEditError('Note required when adjusting qty')
      return
    }
    if (priceChanged && (!Number.isFinite(priceNum) || priceNum! < 0)) {
      setEditError('Selling price must be a non-negative number')
      return
    }
    if (origChanged && (!Number.isFinite(origNum) || origNum! < 0)) {
      setEditError('Original price must be a non-negative number')
      return
    }

    setEditError(null)
    setEditLoading(true)
    try {
      const tasks: Promise<Response>[] = []
      if (priceChanged || origChanged || nameChanged) {
        const body: Record<string, number | string> = {}
        if (priceChanged) body.price = priceNum!
        if (origChanged) body.original_price = origNum!
        if (nameChanged) body.name = trimmedName
        tasks.push(fetch('/api/products', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editProduct.id, ...body }),
        }))
      }
      if (qtyChanged) {
        tasks.push(fetch('/api/inventory', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: editProduct.id, qty: adjustQty, note: adjustNote }),
        }))
      }
      const results = await Promise.all(tasks)
      const failed = results.find(r => !r.ok)
      if (failed) {
        const j = await failed.json().catch(() => ({}))
        setEditError(j.error ?? `Update failed (${failed.status})`)
        return
      }
      setEditProduct(null)
      setAdjustQty(0)
      setAdjustNote('')
      setEditPrice('')
      setEditOriginalPrice('')
      setEditName('')
      await fetchProducts()
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setEditLoading(false)
    }
  }

  async function handleAddProduct() {
    if (!addForm.name || !addForm.price) return
    setAddLoading(true)
    try {
      let image_url: string | null = null
      if (addPhotoFile) {
        const resized = await resizeImage(addPhotoFile)
        const fd = new FormData()
        fd.append('file', resized)
        const res = await fetch('/api/upload-image', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) {
          setUploadError(data.error ?? `Upload failed (${res.status})`)
          setAddLoading(false)
          return
        }
        image_url = data.url
      }
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name,
          barcode: addForm.barcode || null,
          category: addForm.category || null,
          price: parseFloat(addForm.price),
          stock_qty: parseInt(addForm.stock_qty) || 0,
          low_stock_threshold: parseInt(addForm.low_stock_threshold) || 5,
          image_url,
        }),
      })
      setShowAdd(false)
      setAddForm({ name: '', barcode: '', category: '', price: '', stock_qty: '0', low_stock_threshold: '5' })
      setAddPhotoFile(null)
      setAddPhotoPreview(null)
      await fetchProducts()
    } finally {
      setAddLoading(false)
    }
  }

  async function handleDelete() {
    if (!deleteProduct) return
    setDeleteLoading(true)
    try {
      await fetch(`/api/products?id=${deleteProduct.id}`, { method: 'DELETE' })
      setDeleteProduct(null)
      await fetchProducts()
    } finally {
      setDeleteLoading(false)
    }
  }

  async function openPrint(p: StockLevel) {
    let code = p.barcode
    if (!code) {
      code = (Date.now() % 100000000).toString().padStart(8, '0') + Math.floor(Math.random() * 9999).toString().padStart(4, '0')
      setSavingBarcode(true)
      try {
        await fetch('/api/products', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: p.id, barcode: code }),
        })
        await fetchProducts()
      } finally {
        setSavingBarcode(false)
      }
    }
    setPrintBarcode(code)
    setPrintProduct(p)
  }

  async function handleDownloadAndPrint() {
    if (!printProduct || !printBarcode) return
    const area = document.getElementById('barcode-print-area')
    const svg = area?.querySelector('svg')
    if (!svg) {
      window.print()
      return
    }

    const svgClone = svg.cloneNode(true) as SVGSVGElement
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const svgStr = new XMLSerializer().serializeToString(svgClone)
    const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr)

    const qrImg = new Image()
    await new Promise<void>((resolve, reject) => {
      qrImg.onload = () => resolve()
      qrImg.onerror = () => reject(new Error('QR render failed'))
      qrImg.src = svgUrl
    })

    const qrSize = 400
    const padding = 32
    const labelH = 40
    const codeH = 24
    const priceH = 32
    const canvas = document.createElement('canvas')
    canvas.width = qrSize + padding * 2
    canvas.height = labelH + qrSize + codeH + priceH + padding * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#000000'
    ctx.textAlign = 'center'
    ctx.font = 'bold 24px sans-serif'
    ctx.fillText(printProduct.name, canvas.width / 2, padding + 24)
    ctx.drawImage(qrImg, padding, padding + labelH, qrSize, qrSize)
    ctx.font = '18px monospace'
    ctx.fillStyle = '#666666'
    ctx.fillText(printBarcode, canvas.width / 2, padding + labelH + qrSize + 22)
    ctx.font = '20px sans-serif'
    ctx.fillStyle = '#333333'
    ctx.fillText('₱' + printProduct.price.toFixed(2), canvas.width / 2, padding + labelH + qrSize + codeH + 22)

    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'))
    if (blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const safeName = printProduct.name.trim().replace(/[^a-zA-Z0-9-_]+/g, '_')
      a.href = url
      a.download = `qr-${safeName}-${printBarcode}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    }

    window.print()
  }

  async function openHistory(p: StockLevel) {
    setHistoryProduct(p)
    setLogsLoading(true)
    setLogs([])
    try {
      const res = await fetch(`/api/inventory/logs?product_id=${p.id}`)
      const data = await res.json()
      setLogs(Array.isArray(data) ? data : [])
    } finally {
      setLogsLoading(false)
    }
  }

  const lowStockCount = products.filter(p => p.is_low_stock).length

  return (
    <main className="min-h-screen bg-gray-950 text-white p-3 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 sm:mb-6 mt-2">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white mb-1.5 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Inventory</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-gray-400">{products.length} products</p>
            {lowStockCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                {lowStockCount} low stock
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/inventory/restock"
            className="flex-1 sm:flex-initial text-center px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-xs sm:text-sm font-bold transition-colors"
          >
            + Restock
          </Link>
          <button
            onClick={() => setShowAdd(true)}
            className="flex-1 sm:flex-initial px-3 sm:px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-colors"
          >
            + Add Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] sm:max-w-sm">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search product, barcode, or category…"
            className="w-full pl-9 pr-9 py-1.5 bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-1"
              aria-label="Clear search"
            >×</button>
          )}
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c.key} value={c.key}>{c.display} ({c.count})</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-gray-400 hover:text-white transition-colors">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={e => setLowStockOnly(e.target.checked)}
            className="w-4 h-4 rounded accent-green-500"
          />
          Low stock only
        </label>
        {(categoryFilter || lowStockOnly || searchQuery) && (
          <button
            onClick={() => { setCategoryFilter(''); setLowStockOnly(false); setSearchQuery('') }}
            className="text-sm text-green-400 hover:text-green-300 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Hidden file input for row image upload */}
      <input
        ref={rowFileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleRowImageUpload}
      />

      {uploadError && (
        <div className="mb-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400 flex items-center justify-between gap-3">
          <span>Photo upload failed: {uploadError}</span>
          <button onClick={() => setUploadError(null)} className="text-red-300 hover:text-white">✕</button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-gray-800 bg-gray-900">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="border-b border-gray-800">
            <tr>
              <th className="px-3 py-3 w-14" />
              <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
              <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Barcode</th>
              <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
              <th className="px-3 sm:px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Price</th>
              <th className="px-3 sm:px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Stock</th>
              <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-3 sm:px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-16 text-gray-500">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-gray-700 border-t-green-500 rounded-full animate-spin" />
                    <span>Loading…</span>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-16 text-gray-500">No products found</td>
              </tr>
            ) : filtered.map(p => (
              <tr key={p.id} className="hover:bg-gray-800/50 transition-colors">
                {/* Thumbnail */}
                <td className="px-3 py-2">
                  <button
                    onClick={() => { rowFileTargetId.current = p.id; rowFileRef.current?.click() }}
                    className="relative group w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 block"
                    title="Click to set photo"
                  >
                    {uploadingImageFor === p.id ? (
                      <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-gray-600 border-t-green-500 rounded-full animate-spin" />
                      </div>
                    ) : p.image_url ? (
                      <>
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full bg-gray-800 border border-dashed border-gray-700 rounded-lg flex items-center justify-center group-hover:border-gray-500 transition-colors">
                        <svg className="w-5 h-5 text-gray-600 group-hover:text-gray-400 transition-colors" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                    )}
                  </button>
                </td>
                <td className="px-3 sm:px-4 py-3 font-medium text-white">{p.name}</td>
                <td className="hidden md:table-cell px-4 py-3 text-gray-500 font-mono text-xs">{p.barcode || '—'}</td>
                <td className="hidden sm:table-cell px-4 py-3 text-gray-400">{p.category || '—'}</td>
                <td className="px-3 sm:px-4 py-3 text-right text-gray-300">₱{p.price.toFixed(2)}</td>
                <td className={`px-3 sm:px-4 py-3 text-right font-bold ${p.is_low_stock ? 'text-amber-400' : 'text-white'}`}>{p.stock_qty}</td>
                <td className="hidden md:table-cell px-4 py-3">
                  {p.is_low_stock ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      Low stock
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      OK
                    </span>
                  )}
                </td>
                <td className="px-3 sm:px-4 py-3 text-right">
                  <div className="flex gap-1 justify-end flex-wrap">
                    <button
                      onClick={() => {
                        setEditProduct(p)
                        setAdjustQty(0)
                        setAdjustNote('')
                        setEditPrice(String(p.price ?? ''))
                        setEditOriginalPrice(String(p.original_price ?? ''))
                        setEditName(p.name ?? '')
                        setEditError(null)
                      }}
                      className="px-2.5 py-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg font-medium transition-colors"
                    >
                      Edit stock
                    </button>
                    <button
                      onClick={() => openHistory(p)}
                      className="px-2.5 py-1 text-xs bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 rounded-lg font-medium transition-colors"
                    >
                      History
                    </button>
                    <button
                      onClick={() => openPrint(p)}
                      className="px-2.5 py-1 text-xs bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-400 rounded-lg font-medium transition-colors"
                    >
                      Download QR
                    </button>
                    <button
                      onClick={() => setDeleteProduct(p)}
                      className="px-2.5 py-1 text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg font-medium transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Stock Modal */}
      {editProduct && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-1">Edit Product</h2>
            <p className="text-sm text-gray-400 mb-5">
              Current stock: <strong className="text-white">{editProduct.stock_qty}</strong>
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Product name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Product name"
                  maxLength={200}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Original price (₱)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={editOriginalPrice}
                    onChange={e => setEditOriginalPrice(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="cost"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Selling price (₱)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={editPrice}
                    onChange={e => setEditPrice(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="sell"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Qty change (+ or −)</label>
                <input
                  type="number"
                  value={adjustQty}
                  onChange={e => setAdjustQty(Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. -2 or +10"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Note {adjustQty !== 0 ? '(required for qty change)' : '(optional)'}
                </label>
                <input
                  type="text"
                  value={adjustNote}
                  onChange={e => setAdjustNote(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. Damaged goods"
                  disabled={adjustQty === 0}
                />
              </div>
              <div className="text-xs text-gray-500 bg-gray-800 rounded-xl px-3 py-2 grid grid-cols-2 gap-2">
                <span>New stock: <strong className="text-white">{editProduct.stock_qty + adjustQty}</strong></span>
                <span className="text-right">
                  Profit: <strong className={
                    (Number(editPrice || editProduct.price) - Number(editOriginalPrice || editProduct.original_price)) < 0
                      ? 'text-red-400' : 'text-green-400'
                  }>
                    ₱{(Number(editPrice || editProduct.price) - Number(editOriginalPrice || editProduct.original_price)).toFixed(2)}
                  </strong>
                </span>
              </div>
              {editError && (
                <p className="text-xs text-red-400 bg-red-900/20 border border-red-500/30 rounded-xl px-3 py-2">{editError}</p>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setEditProduct(null)}
                className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdjust}
                disabled={editLoading}
                className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors"
              >
                {editLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-5">Add Product</h2>

            {/* Photo capture */}
            <div className="mb-4">
              <input
                ref={addFileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0] ?? null
                  setAddPhotoFile(file)
                  setAddPhotoPreview(file ? URL.createObjectURL(file) : null)
                }}
              />
              {addPhotoPreview ? (
                <div className="relative">
                  <img src={addPhotoPreview} alt="Product" className="w-full h-40 object-cover rounded-xl" />
                  <button
                    onClick={() => { setAddPhotoFile(null); setAddPhotoPreview(null); if (addFileRef.current) addFileRef.current.value = '' }}
                    className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold"
                  >✕</button>
                  <button
                    onClick={() => addFileRef.current?.click()}
                    className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-lg px-3 py-1 text-xs font-medium"
                  >Retake</button>
                </div>
              ) : (
                <button
                  onClick={() => addFileRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-700 hover:border-gray-500 rounded-xl py-6 flex flex-col items-center gap-2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                  <span className="text-sm font-medium">Take Product Photo</span>
                  <span className="text-xs text-gray-600">Optional</span>
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-400 mb-1">Name *</label>
                  <input
                    type="text"
                    value={addForm.name}
                    onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="e.g. Coca Cola 1.5L"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Barcode</label>
                  <input
                    type="text"
                    value={addForm.barcode}
                    onChange={e => setAddForm(f => ({ ...f, barcode: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="relative" ref={categoryComboRef}>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Category</label>
                  <input
                    type="text"
                    value={addForm.category}
                    onChange={e => { setAddForm(f => ({ ...f, category: e.target.value })); setShowCategoryDropdown(true) }}
                    onFocus={() => setShowCategoryDropdown(true)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Select or type new…"
                    autoComplete="off"
                  />
                  {showCategoryDropdown && categories.length > 0 && (() => {
                    const q = addForm.category.toLowerCase().trim()
                    const matches = q ? categories.filter(c => c.key.includes(q)) : categories
                    const exactMatch = categories.some(c => c.key === q)
                    const showNew = q.length > 0 && !exactMatch
                    if (matches.length === 0 && !showNew) return null
                    return (
                      <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                        {matches.map(c => (
                          <button
                            key={c.key}
                            type="button"
                            onMouseDown={() => { setAddForm(f => ({ ...f, category: c.display })); setShowCategoryDropdown(false) }}
                            className="w-full text-left px-3 py-2.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                          >
                            {c.display}
                          </button>
                        ))}
                        {showNew && (
                          <div className="px-3 py-2 text-xs text-gray-500 border-t border-gray-700 flex items-center gap-1.5">
                            <span className="bg-green-500/15 text-green-400 border border-green-500/20 rounded px-1.5 py-0.5 font-medium">New</span>
                            <span className="text-gray-300">"{addForm.category}" will be saved as new category</span>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Price (₱) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={addForm.price}
                    onChange={e => setAddForm(f => ({ ...f, price: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Initial stock</label>
                  <input
                    type="number"
                    min="0"
                    value={addForm.stock_qty}
                    onChange={e => setAddForm(f => ({ ...f, stock_qty: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Low stock alert</label>
                  <input
                    type="number"
                    min="0"
                    value={addForm.low_stock_threshold}
                    onChange={e => setAddForm(f => ({ ...f, low_stock_threshold: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddProduct}
                disabled={addLoading || !addForm.name || !addForm.price}
                className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors"
              >
                {addLoading ? 'Adding…' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Barcode Modal */}
      {printProduct && (
        <>
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
            {printBarcode && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px', fontFamily: 'sans-serif' }}>
                <p style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px', textAlign: 'center' }}>{printProduct.name}</p>
                <QRCode value={printBarcode} size={120} />
                <p style={{ marginTop: '6px', fontSize: '11px', fontFamily: 'monospace' }}>{printBarcode}</p>
                <p style={{ marginTop: '2px', fontSize: '13px' }}>₱{printProduct.price.toFixed(2)}</p>
              </div>
            )}
          </div>

          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-xs p-6 flex flex-col items-center gap-4">
              <h2 className="text-base font-bold self-start">Download QR Code</h2>
              {savingBarcode ? (
                <div className="flex flex-col items-center gap-2 py-6">
                  <div className="w-6 h-6 border-2 border-gray-700 border-t-purple-500 rounded-full animate-spin" />
                  <p className="text-sm text-gray-400">Generating barcode…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 w-full">
                  <div className="border border-gray-700 rounded-xl p-4 w-full flex flex-col items-center bg-white">
                    <p className="text-black text-sm font-semibold text-center mb-3 leading-tight">{printProduct.name}</p>
                    <QRCode value={printBarcode} size={100} />
                    <p className="text-gray-500 text-xs font-mono mt-2">{printBarcode}</p>
                    <p className="text-gray-600 text-xs mt-1">₱{printProduct.price.toFixed(2)}</p>
                  </div>
                </div>
              )}
              <div className="flex gap-2 w-full">
                <button
                  onClick={() => { setPrintProduct(null); setPrintBarcode('') }}
                  className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-sm font-medium transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handleDownloadAndPrint}
                  disabled={savingBarcode}
                  className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors"
                >
                  Download &amp; Print
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deleteProduct && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Delete Product</h2>
                <p className="text-xs text-gray-500 mt-0.5">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-gray-300 mb-6">
              Are you sure you want to delete <strong className="text-white">{deleteProduct.name}</strong> from inventory?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteProduct(null)}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors"
              >
                {deleteLoading ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock History Drawer */}
      {historyProduct && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setHistoryProduct(null)} />
          <div className="w-full max-w-sm bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col h-full overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-start justify-between">
              <div>
                <h2 className="font-bold text-base text-white">{historyProduct.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Stock history</p>
              </div>
              <button
                onClick={() => setHistoryProduct(null)}
                className="text-gray-500 hover:text-white text-xl leading-none mt-0.5 transition-colors"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {logsLoading ? (
                <div className="flex flex-col items-center gap-2 py-10">
                  <div className="w-6 h-6 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">Loading…</p>
                </div>
              ) : logs.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-10">No history yet</p>
              ) : (
                <div className="space-y-3">
                  {logs.map((log, i) => (
                    <div key={log.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          log.type === 'sale' ? 'bg-red-500/15 text-red-400 border border-red-500/20' :
                          log.type === 'restock' ? 'bg-green-500/15 text-green-400 border border-green-500/20' :
                          'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                        }`}>
                          {log.type === 'sale' ? '↓' : log.type === 'restock' ? '↑' : '±'}
                        </div>
                        {i < logs.length - 1 && <div className="w-px flex-1 bg-gray-800 my-1" />}
                      </div>
                      <div className="pb-3 flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className={`text-sm font-bold ${
                            log.change_qty > 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {log.change_qty > 0 ? '+' : ''}{log.change_qty}
                          </span>
                          <span className="text-xs text-gray-500 capitalize">{log.type}</span>
                        </div>
                        {log.note && <p className="text-xs text-gray-400 mt-0.5 truncate">{log.note}</p>}
                        <p className="text-xs text-gray-600 mt-0.5">
                          {new Date(log.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
