'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import type { StockLevel, InventoryLog } from '@/lib/inventory'

type Product = {
  id: string
  name: string
  barcode: string | null
  price: number
  category: string | null
  stock_qty: number
  low_stock_threshold: number
}

export default function InventoryPage() {
  const [products, setProducts] = useState<StockLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)

  const [editProduct, setEditProduct] = useState<StockLevel | null>(null)
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustNote, setAdjustNote] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', barcode: '', category: '', price: '', stock_qty: '0', low_stock_threshold: '5' })
  const [addLoading, setAddLoading] = useState(false)

  const [historyProduct, setHistoryProduct] = useState<StockLevel | null>(null)
  const [logs, setLogs] = useState<InventoryLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

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

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[]

  const filtered = products.filter(p => {
    if (lowStockOnly && !p.is_low_stock) return false
    if (categoryFilter && p.category !== categoryFilter) return false
    return true
  })

  async function handleAdjust() {
    if (!editProduct || adjustQty === 0 || !adjustNote.trim()) return
    setEditLoading(true)
    try {
      await fetch('/api/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: editProduct.id, qty: adjustQty, note: adjustNote }),
      })
      setEditProduct(null)
      setAdjustQty(0)
      setAdjustNote('')
      await fetchProducts()
    } finally {
      setEditLoading(false)
    }
  }

  async function handleAddProduct() {
    if (!addForm.name || !addForm.price) return
    setAddLoading(true)
    try {
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
        }),
      })
      setShowAdd(false)
      setAddForm({ name: '', barcode: '', category: '', price: '', stock_qty: '0', low_stock_threshold: '5' })
      await fetchProducts()
    } finally {
      setAddLoading(false)
    }
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

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">{products.length} products</p>
        </div>
        <div className="flex gap-2">
          <Link href="/inventory/restock" className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
            + Restock
          </Link>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            + Add Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={e => setLowStockOnly(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          Low stock only
        </label>
        {(categoryFilter || lowStockOnly) && (
          <button onClick={() => { setCategoryFilter(''); setLowStockOnly(false) }} className="text-sm text-blue-600 hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Product</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Barcode</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Category</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Price</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Stock</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">No products found</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.barcode || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{p.category || '—'}</td>
                <td className="px-4 py-3 text-right">₱{p.price.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-semibold">{p.stock_qty}</td>
                <td className="px-4 py-3">
                  {p.is_low_stock ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Low stock</span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">OK</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={() => { setEditProduct(p); setAdjustQty(0); setAdjustNote('') }}
                      className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md font-medium"
                    >
                      Edit stock
                    </button>
                    <button
                      onClick={() => openHistory(p)}
                      className="px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md font-medium"
                    >
                      History
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-1">Adjust Stock</h2>
            <p className="text-sm text-gray-500 mb-4">{editProduct.name} — current: <strong>{editProduct.stock_qty}</strong></p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Qty change (+ or −)</label>
                <input
                  type="number"
                  value={adjustQty}
                  onChange={e => setAdjustQty(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. -2 or +10"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Note (required)</label>
                <input
                  type="text"
                  value={adjustNote}
                  onChange={e => setAdjustNote(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Damaged goods"
                />
              </div>
              <div className="text-xs text-gray-400">
                New stock: <strong>{editProduct.stock_qty + adjustQty}</strong>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setEditProduct(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleAdjust}
                disabled={editLoading || adjustQty === 0 || !adjustNote.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {editLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Add Product</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                  <input type="text" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Barcode</label>
                  <input type="text" value={addForm.barcode} onChange={e => setAddForm(f => ({ ...f, barcode: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <input type="text" value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Price *</label>
                  <input type="number" min="0" step="0.01" value={addForm.price} onChange={e => setAddForm(f => ({ ...f, price: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Initial stock</label>
                  <input type="number" min="0" value={addForm.stock_qty} onChange={e => setAddForm(f => ({ ...f, stock_qty: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Low stock threshold</label>
                  <input type="number" min="0" value={addForm.low_stock_threshold} onChange={e => setAddForm(f => ({ ...f, low_stock_threshold: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleAddProduct}
                disabled={addLoading || !addForm.name || !addForm.price}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {addLoading ? 'Adding…' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock History Drawer */}
      {historyProduct && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setHistoryProduct(null)} />
          <div className="w-full max-w-sm bg-white shadow-2xl flex flex-col h-full overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h2 className="font-bold text-base">{historyProduct.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Stock history</p>
              </div>
              <button onClick={() => setHistoryProduct(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {logsLoading ? (
                <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
              ) : logs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No history yet</p>
              ) : (
                <div className="space-y-3">
                  {logs.map((log, i) => (
                    <div key={log.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          log.type === 'sale' ? 'bg-red-100 text-red-600' :
                          log.type === 'restock' ? 'bg-green-100 text-green-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {log.type === 'sale' ? '↓' : log.type === 'restock' ? '↑' : '±'}
                        </div>
                        {i < logs.length - 1 && <div className="w-px flex-1 bg-gray-100 my-1" />}
                      </div>
                      <div className="pb-3 flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className={`text-sm font-semibold ${
                            log.change_qty > 0 ? 'text-green-700' : 'text-red-600'
                          }`}>
                            {log.change_qty > 0 ? '+' : ''}{log.change_qty}
                          </span>
                          <span className="text-xs text-gray-500 capitalize">{log.type}</span>
                        </div>
                        {log.note && <p className="text-xs text-gray-500 mt-0.5 truncate">{log.note}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(log.created_at).toLocaleString()}
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
