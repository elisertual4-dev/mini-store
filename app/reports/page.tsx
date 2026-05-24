'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell,
} from 'recharts'
import type { StockLevel } from '@/lib/inventory'

type DailySale = { date: string; total: number; original_total: number; count: number }
type TopProduct = { name: string; qty: number; total: number; revenue: number }
type CategorySale = { category: string; total: number; revenue: number; qty: number; products: TopProduct[] }
type Period = 'day' | 'month' | 'year'
type ReportData = {
  period: Period
  daily_sales: DailySale[]
  top_products: TopProduct[]
  category_sales: CategorySale[]
  stock_snapshot: StockLevel[]
}

const S = {
  bg: '#0c0a09',
  surface: '#1c1917',
  border: '#292524',
  amber: '#f59e0b',
  green: '#4ade80',
  red: '#f87171',
  muted: '#78716c',
  text: '#fafaf9',
  textSub: '#a8a29e',
}

function fmt(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function fmtPeriod(d: string, p: Period) {
  if (p === 'year') return d
  if (p === 'month') {
    const [y, m] = d.split('-')
    const date = new Date(Number(y), Number(m) - 1, 1)
    return date.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
  }
  return fmtDate(d)
}

const BAR_COLORS = ['#f59e0b', '#fb923c', '#f87171', '#a78bfa', '#60a5fa', '#34d399', '#a3e635', '#fbbf24', '#c084fc', '#38bdf8']

export default function ReportsPage() {
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  const [from, setFrom] = useState(weekAgo)
  const [to, setTo] = useState(today)
  const [period, setPeriod] = useState<Period>('day')
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [clearing, setClearing] = useState(false)
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/reports?from=${from}&to=${to}&period=${period}&t=${Date.now()}`, { cache: 'no-store' })
      if (r.ok) {
        setData(await r.json())
      } else {
        const j = await r.json().catch(() => ({}))
        setSyncMsg(`Failed to load reports: ${j.error ?? r.statusText}`)
      }
    } catch (e) {
      setSyncMsg(`Failed to load reports: ${e instanceof Error ? e.message : 'network error'}`)
    } finally {
      setLoading(false)
    }
  }, [from, to, period])

  useEffect(() => { load() }, [load])

  async function syncSheets() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const r = await fetch('/api/sync-sheets', { method: 'POST' })
      const j = await r.json()
      setSyncMsg(r.ok ? `Synced ${j.synced} rows to Google Sheets` : j.error)
    } finally {
      setSyncing(false)
    }
  }

  async function clearTransactions() {
    if (!confirm('Delete ALL transactions? This cannot be undone.')) return
    setClearing(true)
    setSyncMsg('')
    try {
      const r = await fetch('/api/transactions', { method: 'DELETE' })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        setData(prev => prev ? {
          ...prev,
          daily_sales: [],
          top_products: [],
          category_sales: [],
        } : prev)
        setSyncMsg('All transactions cleared')
        await load()
      } else {
        setSyncMsg(j.error ?? `Failed to clear transactions (${r.status})`)
      }
    } catch (e) {
      setSyncMsg(`Failed to clear transactions: ${e instanceof Error ? e.message : 'network error'}`)
    } finally {
      setClearing(false)
    }
  }

  const totalSalesSelling = data?.daily_sales.reduce((s, d) => s + d.total, 0) ?? 0
  const totalSalesOriginal = data?.daily_sales.reduce((s, d) => s + d.original_total, 0) ?? 0
  const totalRevenue = totalSalesSelling - totalSalesOriginal

  return (
    <main style={{ background: S.bg, minHeight: '100vh', fontFamily: "'Syne', sans-serif", color: S.text }}>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: `linear-gradient(${S.border} 1px, transparent 1px), linear-gradient(90deg, ${S.border} 1px, transparent 1px)`,
        backgroundSize: '40px 40px', opacity: 0.2,
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '36px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
              <Link href="/dashboard" style={{ color: S.muted, textDecoration: 'none', fontSize: '13px' }}>← Dashboard</Link>
            </div>
            <h1 style={{ fontFamily: "'Bebas Neue', cursive", fontSize: '36px', letterSpacing: '4px', color: S.amber, margin: 0 }}>
              REPORTS
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: '8px', color: S.text, padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit' }} />
            <span style={{ color: S.muted, fontSize: '12px' }}>to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: '8px', color: S.text, padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit' }} />
            <button onClick={syncSheets} disabled={syncing} style={{
              padding: '8px 16px', background: 'transparent', border: `1px solid ${S.border}`,
              borderRadius: '8px', color: S.textSub, fontSize: '12px', fontWeight: 700,
              letterSpacing: '1px', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {syncing ? 'SYNCING…' : 'SYNC SHEETS'}
            </button>
            <button onClick={clearTransactions} disabled={clearing} style={{
              padding: '8px 16px', background: 'transparent', border: `1px solid ${S.red}50`,
              borderRadius: '8px', color: S.red, fontSize: '12px', fontWeight: 700,
              letterSpacing: '1px', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {clearing ? 'CLEARING…' : 'CLEAR DATA'}
            </button>
          </div>
        </div>

        {syncMsg && (
          <div style={{ marginBottom: '20px', padding: '12px 16px', background: '#14532d30', border: `1px solid #16a34a50`, borderRadius: '10px', fontSize: '13px', color: S.green }}>
            {syncMsg}
          </div>
        )}

        {/* Summary row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
          {[
            { label: 'TOTAL SALES (ORIGINAL PRICE)', value: fmt(totalSalesOriginal), accent: S.amber },
            { label: 'TOTAL SALES (SELLING PRICE)', value: fmt(totalSalesSelling), accent: S.green },
            { label: 'TOTAL REVENUE', value: fmt(totalRevenue), accent: S.textSub },
          ].map((c, i) => (
            <div key={i} style={{ background: S.surface, border: `1px solid ${S.border}`, borderTop: `2px solid ${c.accent}`, borderRadius: '14px', padding: '20px' }}>
              <p style={{ fontSize: '10px', letterSpacing: '2px', color: S.muted, marginBottom: '8px', fontWeight: 700 }}>{c.label}</p>
              <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: '36px', color: loading ? S.muted : c.accent }}>
                {loading ? '—' : c.value}
              </span>
            </div>
          ))}
        </div>

        {/* Period Toggle */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {([
            { id: 'day', label: 'DAILY' },
            { id: 'month', label: 'MONTHLY' },
            { id: 'year', label: 'YEARLY' },
          ] as { id: Period; label: string }[]).map(opt => (
            <button
              key={opt.id}
              onClick={() => setPeriod(opt.id)}
              style={{
                padding: '8px 16px',
                background: period === opt.id ? S.amber : 'transparent',
                border: `1px solid ${period === opt.id ? S.amber : S.border}`,
                borderRadius: '8px',
                color: period === opt.id ? S.bg : S.textSub,
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '2px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Sales Line Chart */}
        <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
          <p style={{ fontSize: '11px', letterSpacing: '2px', color: S.muted, marginBottom: '20px', fontWeight: 700 }}>
            {period === 'year' ? 'YEARLY SALES' : period === 'month' ? 'MONTHLY SALES' : 'DAILY SALES'}
          </p>
          {loading ? (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.muted }}>Loading…</div>
          ) : !data?.daily_sales.length ? (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.muted }}>No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.daily_sales} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border} vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => fmtPeriod(String(d), period)} tick={{ fill: S.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `₱${v}`} tick={{ fill: S.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip
                  contentStyle={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: '8px', fontFamily: 'Syne, sans-serif' }}
                  labelStyle={{ color: S.textSub, fontSize: '12px' }}
                  labelFormatter={(d) => fmtPeriod(String(d), period)}
                  formatter={(v) => [fmt(Number(v)), 'Revenue']}
                />
                <Line type="monotone" dataKey="total" stroke={S.amber} strokeWidth={2.5} dot={{ r: 4, fill: S.amber, strokeWidth: 0 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Revenue Per Category */}
        <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '20px' }}>
            <p style={{ fontSize: '11px', letterSpacing: '2px', color: S.muted, fontWeight: 700 }}>REVENUE PER CATEGORY</p>
            <p style={{ fontSize: '10px', letterSpacing: '1px', color: S.muted }}>{period === 'year' ? 'YEARLY' : period === 'month' ? 'MONTHLY' : 'DAILY'} VIEW</p>
          </div>
          {loading ? (
            <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.muted }}>Loading…</div>
          ) : !data?.category_sales.length ? (
            <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.muted }}>No category sales for this period</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {data.category_sales.map((c, i) => {
                const expanded = expandedCats[c.category] ?? false
                const accent = BAR_COLORS[i % BAR_COLORS.length]
                const topRevenue = data.category_sales[0]?.revenue ?? 0
                const pct = topRevenue ? (c.revenue / topRevenue) * 100 : 0
                return (
                  <div key={c.category} style={{ background: S.bg, border: `1px solid ${S.border}`, borderRadius: '12px', overflow: 'hidden' }}>
                    <button
                      onClick={() => setExpandedCats(s => ({ ...s, [c.category]: !expanded }))}
                      style={{
                        width: '100%', background: 'transparent', border: 'none', padding: '14px 18px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                        color: S.text, fontFamily: 'inherit',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: accent, flexShrink: 0 }} />
                        <span style={{ fontSize: '14px', fontWeight: 600, textAlign: 'left' }}>{c.category}</span>
                        <span style={{ fontSize: '11px', color: S.muted, marginLeft: '4px' }}>
                          {c.products.length} item{c.products.length !== 1 ? 's' : ''} · {c.qty} sold
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: '22px', color: accent, letterSpacing: '1px' }}>
                          {fmt(c.revenue)}
                        </span>
                        <span style={{ color: S.muted, fontSize: '12px', transform: expanded ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>▶</span>
                      </div>
                    </button>
                    {/* progress bar */}
                    <div style={{ height: '3px', background: S.border }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: accent, transition: 'width 0.3s' }} />
                    </div>
                    {/* product breakdown */}
                    {expanded && (
                      <div style={{ borderTop: `1px solid ${S.border}`, padding: '10px 18px 14px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left', padding: '6px 0', fontSize: '10px', letterSpacing: '1px', color: S.muted, fontWeight: 700 }}>PRODUCT</th>
                              <th style={{ textAlign: 'right', padding: '6px 0', fontSize: '10px', letterSpacing: '1px', color: S.muted, fontWeight: 700 }}>QTY</th>
                              <th style={{ textAlign: 'right', padding: '6px 0', fontSize: '10px', letterSpacing: '1px', color: S.muted, fontWeight: 700 }}>REVENUE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.products.map(p => (
                              <tr key={p.name} style={{ borderTop: `1px solid ${S.border}40` }}>
                                <td style={{ padding: '6px 0', color: S.text }}>{p.name}</td>
                                <td style={{ padding: '6px 0', textAlign: 'right', color: S.textSub }}>{p.qty}</td>
                                <td style={{ padding: '6px 0', textAlign: 'right', color: accent, fontWeight: 600 }}>{fmt(p.revenue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Top Products Bar Chart */}
        <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
          <p style={{ fontSize: '11px', letterSpacing: '2px', color: S.muted, marginBottom: '20px', fontWeight: 700 }}>TOP SELLING PRODUCTS</p>
          {loading ? (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.muted }}>Loading…</div>
          ) : !data?.top_products.length ? (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.muted }}>No sales data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.top_products} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border} horizontal={false} />
                <XAxis type="number" tickFormatter={v => `₱${v}`} tick={{ fill: S.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: S.textSub, fontSize: 12 }} axisLine={false} tickLine={false} width={120} />
                <Tooltip
                  contentStyle={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: '8px', fontFamily: 'Syne, sans-serif' }}
                  formatter={(v, name) => [name === 'revenue' ? fmt(Number(v)) : v, name === 'revenue' ? 'Revenue' : 'Units']}
                />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                  {(data.top_products).map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Stock Snapshot Table */}
        <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: `1px solid ${S.border}` }}>
            <p style={{ fontSize: '11px', letterSpacing: '2px', color: S.muted, fontWeight: 700 }}>STOCK SNAPSHOT</p>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.border}` }}>
                  {['Product', 'Category', 'Stock', 'Threshold', 'Status'].map(h => (
                    <th key={h} style={{
                      padding: '12px 20px', textAlign: h === 'Stock' || h === 'Threshold' ? 'right' : 'left',
                      fontSize: '10px', fontWeight: 700, letterSpacing: '2px', color: S.muted,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: S.muted }}>Loading…</td></tr>
                ) : !data?.stock_snapshot.length ? (
                  <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: S.muted }}>No products</td></tr>
                ) : data.stock_snapshot.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${S.border}`, background: i % 2 === 0 ? 'transparent' : `${S.border}30` }}>
                    <td style={{ padding: '12px 20px', color: S.text, fontWeight: 500 }}>{p.name}</td>
                    <td style={{ padding: '12px 20px', color: S.muted, fontSize: '12px' }}>{p.category ?? '—'}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: "'Bebas Neue', cursive", fontSize: '18px', color: p.is_low_stock ? S.red : S.green }}>
                      {p.stock_qty}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', color: S.muted, fontSize: '12px' }}>{p.low_stock_threshold}</td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, letterSpacing: '1px',
                        background: p.is_low_stock ? '#7f1d1d40' : '#14532d40',
                        color: p.is_low_stock ? S.red : S.green,
                        border: `1px solid ${p.is_low_stock ? S.red + '50' : S.green + '50'}`,
                      }}>
                        {p.is_low_stock ? 'LOW' : 'OK'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  )
}
