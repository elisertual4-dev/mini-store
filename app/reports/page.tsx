'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, Bar,
} from 'recharts'
import type { StockLevel } from '@/lib/inventory'

type DailySale = { date: string; total: number; original_total: number; count: number }
type TopProduct = { name: string; qty: number; total: number; revenue: number; category?: string | null; image_url?: string | null }
type CategorySale = { category: string; total: number; revenue: number; qty: number; products: TopProduct[] }
type CreditCustomer = { name: string; total: number; paid: number; unpaid: number; count: number; paid_count: number; unpaid_count: number }
type CreditDay = { date: string; total: number; paid: number; unpaid: number; count: number }
type CreditsSummary = {
  total: number
  paid_total: number
  unpaid_total: number
  count: number
  paid_count: number
  unpaid_count: number
  by_customer: CreditCustomer[]
  by_day: CreditDay[]
}
type Period = 'day' | 'week' | 'month' | 'year'
type ReportData = {
  period: Period
  daily_sales: DailySale[]
  top_products: TopProduct[]
  category_sales: CategorySale[]
  stock_snapshot: StockLevel[]
  credits: CreditsSummary
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
  // d is a PH-local YYYY-MM-DD; anchor to PH midnight to avoid UTC drift
  return new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })
}

function fmtPeriod(d: string, p: Period) {
  if (p === 'year') return d
  if (p === 'month') {
    const [y, m] = d.split('-')
    const date = new Date(Number(y), Number(m) - 1, 1)
    return date.toLocaleDateString('en-PH', { month: 'short', year: 'numeric', timeZone: 'Asia/Manila' })
  }
  if (p === 'week') {
    // Format YYYY-Www -> "W21 '26"
    const m = d.match(/^(\d{4})-W(\d{2})$/)
    if (!m) return d
    return `W${m[2]} '${m[1].slice(2)}`
  }
  return fmtDate(d)
}

const BAR_COLORS = ['#f59e0b', '#fb923c', '#f87171', '#a78bfa', '#60a5fa', '#34d399', '#a3e635', '#fbbf24', '#c084fc', '#38bdf8']

// PH-local YYYY-MM-DD (Asia/Manila is UTC+8, no DST)
function phToday(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}
function phDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000 + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

export default function ReportsPage() {
  const today = phToday()
  const weekAgo = phDaysAgo(7)

  const [from, setFrom] = useState(weekAgo)
  const [to, setTo] = useState(today)
  const [period, setPeriod] = useState<Period>('day')
  const [data, setData] = useState<ReportData | null>(null)
  const [dailyDate, setDailyDate] = useState<string>(phToday())
  const [dailyRevenue, setDailyRevenue] = useState<{ selling: number; original: number; revenue: number; count: number } | null>(null)
  const [dailyLoading, setDailyLoading] = useState(false)
  const dailyDateRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [syncErr, setSyncErr] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({})
  const [expandedStockCats, setExpandedStockCats] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/reports?from=${from}&to=${to}&period=${period}&t=${Date.now()}`, { cache: 'no-store' })
      if (r.ok) {
        setData(await r.json())
      } else {
        const j = await r.json().catch(() => ({}))
        setSyncErr(true); setSyncMsg(`Failed to load reports: ${j.error ?? r.statusText}`)
      }
    } catch (e) {
      setSyncErr(true); setSyncMsg(`Failed to load reports: ${e instanceof Error ? e.message : 'network error'}`)
    } finally {
      setLoading(false)
    }
  }, [from, to, period])

  useEffect(() => { load() }, [load])

  const syncSheets = useCallback(async (opts?: { silent?: boolean }) => {
    setSyncing(true)
    if (!opts?.silent) { setSyncMsg(''); setSyncErr(false) }
    try {
      const r = await fetch('/api/sync-sheets', { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        const extra = j.credit_tx != null ? ` (${j.credit_tx} credit, ${j.customers ?? 0} customers)` : ''
        setSyncErr(false)
        setSyncMsg(`${opts?.silent ? 'Auto-synced' : 'Synced'} ${j.synced} rows to Google Sheets${extra}`)
      } else {
        setSyncErr(true)
        setSyncMsg(j.error ?? `Sync failed (${r.status})`)
      }
    } catch (e) {
      setSyncErr(true)
      setSyncMsg(`Sync failed: ${e instanceof Error ? e.message : 'network error'}`)
    } finally {
      setSyncing(false)
    }
  }, [])

  // Auto-sync once on first successful data load
  const autoSyncedRef = useRef(false)
  useEffect(() => {
    if (autoSyncedRef.current) return
    if (!data || loading) return
    autoSyncedRef.current = true
    syncSheets({ silent: true })
  }, [data, loading, syncSheets])

  // Daily revenue (single picked day, independent of main range)
  useEffect(() => {
    let cancelled = false
    setDailyLoading(true)
    fetch(`/api/reports?from=${dailyDate}&to=${dailyDate}&period=day&t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((d: ReportData) => {
        if (cancelled) return
        const row = d.daily_sales[0]
        if (row) {
          setDailyRevenue({ selling: row.total, original: row.original_total, revenue: row.total - row.original_total, count: row.count })
        } else {
          setDailyRevenue({ selling: 0, original: 0, revenue: 0, count: 0 })
        }
      })
      .catch(() => { if (!cancelled) setDailyRevenue(null) })
      .finally(() => { if (!cancelled) setDailyLoading(false) })
    return () => { cancelled = true }
  }, [dailyDate, data])

  async function clearTransactions() {
    if (!confirm('Delete ALL transactions? This cannot be undone.')) return
    setClearing(true)
    setSyncMsg(''); setSyncErr(false)
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
        setSyncErr(true)
        setSyncMsg(j.error ?? `Failed to clear transactions (${r.status})`)
      }
    } catch (e) {
      setSyncErr(true)
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
      <style>{`
        .rp-wrap { position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
        .rp-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 36px; gap: 16px; flex-wrap: wrap; }
        .rp-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
        @media (max-width: 1024px) {
          .rp-summary { grid-template-columns: repeat(2, 1fr); }
        }
        .rp-h1 { font-family: 'Bebas Neue', cursive; font-size: 36px; letter-spacing: 4px; color: ${S.amber}; margin: 0; }
        .rp-toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
        @media (max-width: 768px) {
          .rp-wrap { padding: 16px 12px 80px; }
          .rp-summary { grid-template-columns: 1fr; gap: 10px; }
          .rp-h1 { font-size: 26px; letter-spacing: 2px; }
          .rp-toolbar { width: 100%; justify-content: flex-start; }
          .rp-header { margin-bottom: 20px; }
        }
        @media (max-width: 480px) {
          .rp-toolbar input[type="date"] { flex: 1 1 45%; min-width: 0; }
        }
        /* Daily revenue card: hide native indicator (replaced by visible custom SVG button) */
        .rp-daily-date::-webkit-calendar-picker-indicator {
          opacity: 0;
          display: none;
        }
        .rp-toolbar input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(1) brightness(1.2) opacity(0.9);
          cursor: pointer;
        }
      `}</style>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: `linear-gradient(${S.border} 1px, transparent 1px), linear-gradient(90deg, ${S.border} 1px, transparent 1px)`,
        backgroundSize: '40px 40px', opacity: 0.2,
      }} />

      <div className="rp-wrap">

        {/* Header */}
        <div className="rp-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
              <Link href="/dashboard" style={{ color: S.muted, textDecoration: 'none', fontSize: '13px' }}>← Dashboard</Link>
            </div>
            <h1 className="rp-h1">
              REPORTS
            </h1>
          </div>
          <div className="rp-toolbar">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: '8px', color: S.text, padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', colorScheme: 'dark' }} />
            <span style={{ color: S.muted, fontSize: '12px' }}>to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: '8px', color: S.text, padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', colorScheme: 'dark' }} />
            <button onClick={() => syncSheets()} disabled={syncing} style={{
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
          <div style={{
            marginBottom: '20px', padding: '12px 16px',
            background: syncErr ? '#7f1d1d30' : '#14532d30',
            border: `1px solid ${syncErr ? '#dc262650' : '#16a34a50'}`,
            borderRadius: '10px', fontSize: '13px',
            color: syncErr ? S.red : S.green,
          }}>
            {syncMsg}
          </div>
        )}

        {/* Summary row */}
        <div className="rp-summary">
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

          {/* Daily Revenue with date picker */}
          <div style={{
            background: S.surface, border: `1px solid ${S.border}`,
            borderTop: `2px solid ${S.green}`, borderRadius: '14px', padding: '20px',
            display: 'flex', flexDirection: 'column', gap: '6px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
              <p style={{ fontSize: '10px', letterSpacing: '2px', color: S.muted, fontWeight: 700 }}>DAILY REVENUE</p>
              <div
                onClick={() => {
                  const el = dailyDateRef.current
                  if (!el) return
                  if (typeof el.showPicker === 'function') el.showPicker()
                  else el.focus()
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: S.bg, border: `1px solid ${S.green}60`,
                  borderRadius: '8px', padding: '5px 10px', cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = S.green }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = `${S.green}60` }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={S.green} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <input
                  ref={dailyDateRef}
                  type="date"
                  value={dailyDate}
                  max={phToday()}
                  onChange={e => setDailyDate(e.target.value)}
                  className="rp-daily-date"
                  style={{
                    background: 'transparent', border: 'none', color: S.text,
                    padding: 0, fontSize: '12px', fontFamily: 'inherit',
                    colorScheme: 'dark', outline: 'none',
                  }}
                />
              </div>
            </div>
            <span style={{
              fontFamily: "'Bebas Neue', cursive", fontSize: '36px',
              color: dailyLoading ? S.muted : (dailyRevenue && dailyRevenue.revenue < 0 ? S.red : S.green),
              lineHeight: 1,
            }}>
              {dailyLoading || !dailyRevenue ? '—' : fmt(dailyRevenue.revenue)}
            </span>
            {dailyRevenue && !dailyLoading && (
              <p style={{ fontSize: '10px', color: S.muted, letterSpacing: '1px' }}>
                {dailyRevenue.count} tx · {fmt(dailyRevenue.selling)} sold
              </p>
            )}
          </div>
        </div>

        {/* Period Toggle */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {([
            { id: 'day', label: 'DAILY' },
            { id: 'week', label: 'WEEKLY' },
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
            {period === 'year' ? 'YEARLY SALES' : period === 'month' ? 'MONTHLY SALES' : period === 'week' ? 'WEEKLY SALES' : 'DAILY SALES'}
          </p>
          {loading ? (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.muted }}>Loading…</div>
          ) : !data?.daily_sales.length ? (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.muted }}>No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={data.daily_sales.map(d => ({ ...d, revenue: d.total - d.original_total }))}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={S.border} vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => fmtPeriod(String(d), period)} tick={{ fill: S.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `₱${v}`} tick={{ fill: S.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip
                  contentStyle={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: '8px', fontFamily: 'Syne, sans-serif' }}
                  labelStyle={{ color: S.textSub, fontSize: '12px' }}
                  labelFormatter={(d) => fmtPeriod(String(d), period)}
                  formatter={(v, name) => [fmt(Number(v)), name === 'total' ? 'Sales' : 'Revenue']}
                />
                <Legend
                  wrapperStyle={{ fontSize: '11px', letterSpacing: '1px', paddingTop: '8px' }}
                  formatter={(name) => name === 'total' ? 'SALES' : 'REVENUE'}
                />
                <Line type="monotone" dataKey="total" stroke={S.amber} strokeWidth={2.5} dot={{ r: 4, fill: S.amber, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="revenue" stroke={S.green} strokeWidth={2.5} dot={{ r: 4, fill: S.green, strokeWidth: 0 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Revenue Per Category */}
        <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '20px' }}>
            <p style={{ fontSize: '11px', letterSpacing: '2px', color: S.muted, fontWeight: 700 }}>REVENUE PER CATEGORY</p>
            <p style={{ fontSize: '10px', letterSpacing: '1px', color: S.muted }}>{period === 'year' ? 'YEARLY' : period === 'month' ? 'MONTHLY' : period === 'week' ? 'WEEKLY' : 'DAILY'} VIEW</p>
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

        {/* Top Products — Editorial Leaderboard */}
        <div style={{
          position: 'relative', overflow: 'hidden',
          background: `radial-gradient(at 0% 0%, ${S.amber}10 0%, transparent 50%), ${S.surface}`,
          border: `1px solid ${S.border}`, borderRadius: '20px', padding: '28px 24px 22px', marginBottom: '24px',
        }}>
          <style>{`
            @keyframes rankFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
            @keyframes rowIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            .tp-row { animation: rowIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both; }
            .tp-bar { transform-origin: left; animation: rankFill 0.9s cubic-bezier(0.22, 1, 0.36, 1) both; }
            .tp-row:hover .tp-thumb { transform: scale(1.06) rotate(-2deg); }
            .tp-thumb { transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1); }
          `}</style>

          {/* Decorative corner numeral */}
          <div aria-hidden style={{
            position: 'absolute', top: '-12px', right: '12px',
            fontFamily: "'Bebas Neue', cursive", fontSize: '120px',
            color: S.amber, opacity: 0.05, letterSpacing: '-4px', lineHeight: 1, pointerEvents: 'none',
          }}>TOP</div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '22px', position: 'relative' }}>
            <div>
              <p style={{ fontSize: '11px', letterSpacing: '3px', color: S.muted, fontWeight: 700 }}>TOP SELLING PRODUCTS</p>
              <p style={{ fontSize: '11px', letterSpacing: '1px', color: S.textSub, marginTop: '4px' }}>
                Ranked by net revenue (profit) · {data?.top_products?.length ?? 0} item{(data?.top_products?.length ?? 0) !== 1 ? 's' : ''}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: S.muted, letterSpacing: '2px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: S.amber }} />
              LIVE
            </div>
          </div>

          {loading ? (
            <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.muted }}>Loading…</div>
          ) : !data?.top_products.length ? (
            <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.muted }}>No sales data</div>
          ) : (() => {
            const maxRev = Math.max(...data.top_products.map(p => p.revenue), 1)
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {data.top_products.map((p, i) => {
                  const color = BAR_COLORS[i % BAR_COLORS.length]
                  const pct = (p.revenue / maxRev) * 100
                  const isFirst = i === 0
                  return (
                    <div
                      key={p.name}
                      className="tp-row"
                      style={{ animationDelay: `${0.06 * i}s`, position: 'relative' }}
                    >
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '48px 56px 1fr auto',
                        gap: '14px', alignItems: 'center', marginBottom: '6px',
                      }}>
                        {/* Rank */}
                        <span style={{
                          fontFamily: "'Bebas Neue', cursive",
                          fontSize: isFirst ? '40px' : '32px',
                          color: isFirst ? color : S.muted,
                          letterSpacing: '-1px', lineHeight: 1,
                          textShadow: isFirst ? `0 0 18px ${color}66` : 'none',
                        }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>

                        {/* Thumb */}
                        <div className="tp-thumb" style={{
                          width: '48px', height: '48px', borderRadius: '12px', overflow: 'hidden',
                          background: `linear-gradient(135deg, ${color}30, ${S.border})`,
                          border: `1px solid ${color}40`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {p.image_url
                            ? <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{
                                fontFamily: "'Bebas Neue', cursive", fontSize: '20px',
                                color, opacity: 0.7,
                              }}>{p.name.charAt(0).toUpperCase()}</span>
                          }
                        </div>

                        {/* Name + category */}
                        <div style={{ minWidth: 0 }}>
                          <p style={{
                            fontSize: '15px', fontWeight: 600, color: S.text,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{p.name}</p>
                          <p style={{
                            fontSize: '10px', color: S.muted, letterSpacing: '1.5px',
                            textTransform: 'uppercase', marginTop: '2px',
                          }}>
                            {p.category ?? 'Uncategorized'} · {p.qty} sold
                          </p>
                        </div>

                        {/* Revenue */}
                        <div style={{ textAlign: 'right' }}>
                          <p style={{
                            fontFamily: "'Bebas Neue', cursive", fontSize: '26px',
                            color, letterSpacing: '1px', lineHeight: 1,
                          }}>
                            {fmt(p.revenue)}
                          </p>
                          <p style={{
                            fontSize: '9px', color: S.muted, letterSpacing: '2px',
                            marginTop: '4px', fontWeight: 700,
                          }}>REVENUE</p>
                        </div>
                      </div>

                      {/* Bar track */}
                      <div style={{
                        marginLeft: '62px',
                        height: isFirst ? '8px' : '5px',
                        background: `${S.border}90`,
                        borderRadius: '999px',
                        overflow: 'hidden',
                        position: 'relative',
                      }}>
                        <div
                          className="tp-bar"
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${color}, ${color}cc 60%, ${color}88)`,
                            borderRadius: '999px',
                            boxShadow: isFirst ? `0 0 14px ${color}80, inset 0 0 6px ${color}` : `0 0 6px ${color}60`,
                            animationDelay: `${0.15 + 0.06 * i}s`,
                          }}
                        />
                        {/* Shimmer tick at end */}
                        <div style={{
                          position: 'absolute', top: '-2px', height: 'calc(100% + 4px)',
                          left: `${pct}%`, width: '2px',
                          background: color, transform: 'translateX(-1px)',
                          boxShadow: `0 0 8px ${color}`,
                          opacity: pct > 2 ? 1 : 0,
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>

        {/* Credit Activity */}
        <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '8px' }}>
            <p style={{ fontSize: '11px', letterSpacing: '2px', color: S.muted, fontWeight: 700 }}>CREDIT ACTIVITY (IN RANGE)</p>
            <p style={{ fontSize: '10px', letterSpacing: '1px', color: S.muted }}>{data?.credits?.count ?? 0} credit sale{(data?.credits?.count ?? 0) !== 1 ? 's' : ''}</p>
          </div>

          {loading ? (
            <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.muted }}>Loading…</div>
          ) : !data?.credits || data.credits.count === 0 ? (
            <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.muted }}>No credit transactions in this period</div>
          ) : (
            <>
              {/* Credit summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }} className="rp-summary">
                {[
                  { label: 'TOTAL CREDIT SALES', value: fmt(data.credits.total), sub: `${data.credits.count} tx`, accent: S.amber },
                  { label: 'COLLECTED (PAID)', value: fmt(data.credits.paid_total), sub: `${data.credits.paid_count} tx`, accent: S.green },
                  { label: 'OUTSTANDING (UNPAID)', value: fmt(data.credits.unpaid_total), sub: `${data.credits.unpaid_count} tx`, accent: S.red },
                ].map((c, i) => (
                  <div key={i} style={{ background: S.bg, border: `1px solid ${S.border}`, borderTop: `2px solid ${c.accent}`, borderRadius: '12px', padding: '14px 16px' }}>
                    <p style={{ fontSize: '9px', letterSpacing: '1.5px', color: S.muted, marginBottom: '6px', fontWeight: 700 }}>{c.label}</p>
                    <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: '26px', color: c.accent }}>{c.value}</span>
                    <p style={{ fontSize: '10px', color: S.muted, marginTop: '2px' }}>{c.sub}</p>
                  </div>
                ))}
              </div>

              {/* By Customer breakdown */}
              <div style={{ background: S.bg, border: `1px solid ${S.border}`, borderRadius: '12px', overflow: 'hidden', marginBottom: '14px' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${S.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: '10px', letterSpacing: '1.5px', color: S.muted, fontWeight: 700 }}>BY CUSTOMER</p>
                  <p style={{ fontSize: '10px', color: S.muted }}>{data.credits.by_customer.length} customer{data.credits.by_customer.length !== 1 ? 's' : ''}</p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: `${S.border}40` }}>
                        {['Customer', 'Total', 'Paid', 'Unpaid', 'Tx'].map((h, i) => (
                          <th key={h} style={{
                            padding: '9px 16px',
                            textAlign: i === 0 ? 'left' : 'right',
                            fontSize: '9px', letterSpacing: '1px', color: S.muted, fontWeight: 700,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.credits.by_customer.map(cu => (
                        <tr key={cu.name} style={{ borderTop: `1px solid ${S.border}40` }}>
                          <td style={{ padding: '10px 16px', color: S.text, fontWeight: 600 }}>{cu.name}</td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: "'Bebas Neue', cursive", fontSize: '16px', color: S.amber }}>{fmt(cu.total)}</td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', color: S.green, fontWeight: 500 }}>{fmt(cu.paid)}</td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', color: cu.unpaid > 0 ? S.red : S.muted, fontWeight: 500 }}>{fmt(cu.unpaid)}</td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', color: S.textSub, fontFamily: 'monospace' }}>
                            {cu.count} ({cu.paid_count}P/{cu.unpaid_count}U)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Daily credit chart */}
              <div style={{ background: S.bg, border: `1px solid ${S.border}`, borderRadius: '12px', padding: '14px 16px' }}>
                <p style={{ fontSize: '10px', letterSpacing: '1.5px', color: S.muted, fontWeight: 700, marginBottom: '12px' }}>DAILY CREDIT VOLUME</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={data.credits.by_day} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={S.border} vertical={false} />
                    <XAxis dataKey="date" tickFormatter={d => fmtDate(String(d))} tick={{ fill: S.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v => `₱${v}`} tick={{ fill: S.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip
                      contentStyle={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: '8px', fontFamily: 'Syne, sans-serif' }}
                      labelFormatter={d => fmtDate(String(d))}
                      formatter={(v, name) => [fmt(Number(v)), name === 'paid' ? 'Paid' : 'Unpaid']}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', letterSpacing: '1px' }} formatter={n => n === 'paid' ? 'PAID' : 'UNPAID'} />
                    <Bar dataKey="paid" stackId="a" fill={S.green} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="unpaid" stackId="a" fill={S.red} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>

        {/* Stock Snapshot — Category accordion */}
        <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: `1px solid ${S.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <p style={{ fontSize: '11px', letterSpacing: '2px', color: S.muted, fontWeight: 700 }}>STOCK SNAPSHOT</p>
            <p style={{ fontSize: '10px', letterSpacing: '1px', color: S.muted }}>Tap category to expand</p>
          </div>
          <div>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: S.muted }}>Loading…</div>
            ) : !data?.stock_snapshot.length ? (
              <div style={{ padding: '40px', textAlign: 'center', color: S.muted }}>No products</div>
            ) : (() => {
              const grouped: Record<string, { category: string; items: StockLevel[]; totalStock: number; lowCount: number }> = {}
              for (const p of data.stock_snapshot) {
                const cat = p.category ?? 'Uncategorized'
                if (!grouped[cat]) grouped[cat] = { category: cat, items: [], totalStock: 0, lowCount: 0 }
                grouped[cat].items.push(p)
                grouped[cat].totalStock += p.stock_qty
                if (p.is_low_stock) grouped[cat].lowCount += 1
              }
              const cats = Object.values(grouped).sort((a, b) => a.category.localeCompare(b.category))
              return cats.map(c => {
                const expanded = expandedStockCats[c.category] ?? false
                return (
                  <div key={c.category} style={{ borderBottom: `1px solid ${S.border}` }}>
                    <button
                      onClick={() => setExpandedStockCats(s => ({ ...s, [c.category]: !expanded }))}
                      style={{
                        width: '100%', background: 'transparent', border: 'none',
                        padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        cursor: 'pointer', color: S.text, fontFamily: 'inherit', textAlign: 'left',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                        <span style={{ color: S.muted, fontSize: '12px', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block', width: '12px' }}>▶</span>
                        <span style={{ fontSize: '15px', fontWeight: 600, color: S.text }}>{c.category}</span>
                        <span style={{
                          display: 'inline-block', padding: '2px 9px', borderRadius: '999px',
                          background: `${S.amber}20`, color: S.amber,
                          fontFamily: 'monospace', fontSize: '11px', fontWeight: 600,
                        }}>{c.items.length} item{c.items.length !== 1 ? 's' : ''}</span>
                        {c.lowCount > 0 && (
                          <span style={{
                            display: 'inline-block', padding: '2px 9px', borderRadius: '999px',
                            background: '#7f1d1d40', color: S.red, border: `1px solid ${S.red}50`,
                            fontSize: '10px', fontWeight: 700, letterSpacing: '1px',
                          }}>{c.lowCount} LOW</span>
                        )}
                      </div>
                      <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: '22px', color: S.green, letterSpacing: '1px' }}>
                        {c.totalStock} <span style={{ fontSize: '11px', color: S.muted, letterSpacing: '2px' }}>UNITS</span>
                      </span>
                    </button>
                    {expanded && (
                      <div style={{ background: `${S.border}20`, overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                          <thead>
                            <tr style={{ borderTop: `1px solid ${S.border}` }}>
                              {['Product', 'Stock', 'Threshold', 'Status'].map(h => (
                                <th key={h} style={{
                                  padding: '10px 24px',
                                  textAlign: h === 'Stock' || h === 'Threshold' ? 'right' : h === 'Status' ? 'right' : 'left',
                                  fontSize: '9px', fontWeight: 700, letterSpacing: '2px', color: S.muted,
                                }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {c.items.map(p => (
                              <tr key={p.id} style={{ borderTop: `1px solid ${S.border}40` }}>
                                <td style={{ padding: '10px 24px', color: S.text, fontWeight: 500 }}>{p.name}</td>
                                <td style={{ padding: '10px 24px', textAlign: 'right', fontFamily: "'Bebas Neue', cursive", fontSize: '16px', color: p.is_low_stock ? S.red : S.green }}>
                                  {p.stock_qty}
                                </td>
                                <td style={{ padding: '10px 24px', textAlign: 'right', color: S.muted, fontSize: '12px' }}>{p.low_stock_threshold}</td>
                                <td style={{ padding: '10px 24px', textAlign: 'right' }}>
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
                    )}
                  </div>
                )
              })
            })()}
          </div>
        </div>
      </div>
    </main>
  )
}
