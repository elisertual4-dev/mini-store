'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { StockLevel } from '@/lib/inventory'

export default function RestockPage() {
  const router = useRouter()
  const [products, setProducts] = useState<StockLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState({
    product_id: '',
    qty: '',
    supplier: '',
    cost_per_unit: '',
  })

  useEffect(() => {
    fetch('/api/inventory')
      .then(r => r.json())
      .then(d => setProducts(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [])

  const selected = products.find(p => p.id === form.product_id)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.product_id || !form.qty || Number(form.qty) <= 0) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: form.product_id,
          qty: Number(form.qty),
          supplier_id: form.supplier || undefined,
        }),
      })
      if (res.ok) {
        setSuccess(true)
        setForm({ product_id: '', qty: '', supplier: '', cost_per_unit: '' })
        setTimeout(() => setSuccess(false), 3000)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen p-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
        <div>
          <h1 className="text-2xl font-bold">Restock</h1>
          <p className="text-sm text-gray-500">Log incoming stock from supplier</p>
        </div>
      </div>

      {success && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium">
          Restock logged successfully.
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-5">
        {/* Product select */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Product *</label>
          <select
            value={form.product_id}
            onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}
            required
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">— Select product —</option>
            {loading ? (
              <option disabled>Loading…</option>
            ) : (
              products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} (stock: {p.stock_qty})
                </option>
              ))
            )}
          </select>
          {selected?.is_low_stock && (
            <p className="mt-1 text-xs text-red-500">Low stock — current qty: {selected.stock_qty}</p>
          )}
        </div>

        {/* Qty received */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Qty received *</label>
          <input
            type="number"
            min="1"
            value={form.qty}
            onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
            required
            placeholder="0"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {selected && form.qty && (
            <p className="mt-1 text-xs text-gray-400">
              New stock: <strong>{selected.stock_qty + Number(form.qty)}</strong>
            </p>
          )}
        </div>

        {/* Supplier */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Supplier</label>
          <input
            type="text"
            value={form.supplier}
            onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
            placeholder="Supplier name"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Cost per unit */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Cost per unit</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₱</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.cost_per_unit}
              onChange={e => setForm(f => ({ ...f, cost_per_unit: e.target.value }))}
              placeholder="0.00"
              className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {form.cost_per_unit && form.qty && (
            <p className="mt-1 text-xs text-gray-400">
              Total cost: <strong>₱{(Number(form.cost_per_unit) * Number(form.qty)).toFixed(2)}</strong>
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !form.product_id || !form.qty || Number(form.qty) <= 0}
            className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? 'Logging…' : 'Log Restock'}
          </button>
        </div>
      </form>
    </main>
  )
}
