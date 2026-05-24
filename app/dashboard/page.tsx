'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

const C = {
  bg: '#080b12',
  sidebar: '#0b0f18',
  card: '#0f1420',
  cardHover: '#141b28',
  border: '#1c2438',
  borderLight: '#243050',
  teal: '#00d4aa',
  tealGlow: 'rgba(0,212,170,0.15)',
  amber: '#f59e0b',
  amberGlow: 'rgba(245,158,11,0.15)',
  coral: '#ff6472',
  coralGlow: 'rgba(255,100,114,0.15)',
  violet: '#818cf8',
  violetGlow: 'rgba(129,140,248,0.15)',
  text: '#dde3f0',
  textSub: '#7b8aaa',
  muted: '#3d4a62',
}

type Metrics = {
  today_sales: number
  today_tx_count: number
  total_items_sold: number
  top_product: { name: string; qty: number } | null
  low_stock_count: number
}

type Transaction = {
  id: string
  created_at: string
  total: number
  qty: number
  products: { name: string; barcode: string | null; price: number; image_url: string | null } | null
}

type Credit = {
  id: string
  created_at: string
  total: number
  qty: number
  customer_name: string | null
  products: { name: string; image_url: string | null } | null
}

type CreditsData = { credits: Credit[]; total_outstanding: number; count: number }

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '▣' },
  { href: '/inventory', label: 'Inventory', icon: '⊞' },
  { href: '/reports', label: 'Reports', icon: '◈' },
  { href: '/scan', label: 'Scanner', icon: '◉' },
]

function NavItem({ href, label, icon }: { href: string; label: string; icon: string }) {
  const path = usePathname()
  const active = path === href
  return (
    <Link href={href} style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '11px 14px', borderRadius: '10px', textDecoration: 'none',
      fontSize: '14px', fontWeight: 500, letterSpacing: '0.2px',
      marginBottom: '4px',
      background: active ? C.tealGlow : 'transparent',
      color: active ? C.teal : C.textSub,
      borderLeft: active ? `2px solid ${C.teal}` : '2px solid transparent',
      transition: 'all 0.15s ease',
    }}>
      <span style={{ fontSize: '15px', opacity: active ? 1 : 0.6 }}>{icon}</span>
      {label}
    </Link>
  )
}

function StatCard({ label, value, sub, accent, glow, loading, badge }: {
  label: string; value: string; sub?: string; accent: string; glow: string;
  loading: boolean; badge?: boolean
}) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: '14px',
      padding: '20px 22px', position: 'relative', overflow: 'hidden',
      boxShadow: `0 0 0 0 ${glow}`,
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = accent + '60'
        el.style.boxShadow = `0 0 24px 0 ${glow}`
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = C.border
        el.style.boxShadow = `0 0 0 0 ${glow}`
      }}
    >
      <div style={{
        position: 'absolute', top: 0, right: 0, width: '120px', height: '120px',
        background: `radial-gradient(circle at top right, ${glow} 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />
      <p style={{
        fontSize: '10px', fontWeight: 700, letterSpacing: '2px',
        color: C.muted, marginBottom: '14px', textTransform: 'uppercase',
      }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{
          fontFamily: "'DM Mono', 'Courier New', monospace",
          fontSize: '30px', fontWeight: 600, lineHeight: 1,
          color: loading ? C.muted : accent,
          letterSpacing: '-1px',
        }}>
          {loading ? '———' : value}
        </span>
        {badge && !loading && (
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: C.coral, flexShrink: 0,
            animation: 'coralPing 1.5s ease-in-out infinite',
          }} />
        )}
      </div>
      {sub && !loading && (
        <p style={{ fontSize: '12px', color: C.textSub, marginTop: '6px' }}>{sub}</p>
      )}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.borderLight}`,
      borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: C.text,
    }}>
      <p style={{ color: C.textSub, marginBottom: '4px' }}>{label}</p>
      <p style={{ color: C.teal, fontFamily: 'monospace', fontWeight: 600 }}>
        ₱{(payload[0]?.value ?? 0).toFixed(2)}
      </p>
    </div>
  )
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [txs, setTxs] = useState<Transaction[]>([])
  const [credits, setCredits] = useState<CreditsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(false)
  const [payingId, setPayingId] = useState<string | null>(null)

  const fetchMetrics = useCallback(async () => {
    const r = await fetch('/api/dashboard')
    if (r.ok) setMetrics(await r.json())
  }, [])

  const fetchTxs = useCallback(async () => {
    const r = await fetch('/api/transactions?limit=50')
    if (r.ok) setTxs(await r.json())
  }, [])

  const fetchCredits = useCallback(async () => {
    const r = await fetch('/api/credits')
    if (r.ok) setCredits(await r.json())
  }, [])

  async function markPaid(id: string) {
    if (!confirm('Mark this credit as paid? Transaction converts to cash sale.')) return
    setPayingId(id)
    try {
      const r = await fetch(`/api/credits/${id}/pay`, { method: 'PATCH' })
      if (r.ok) {
        await Promise.all([fetchCredits(), fetchTxs(), fetchMetrics()])
      } else {
        const j = await r.json().catch(() => ({}))
        alert('Failed: ' + (j.error ?? r.statusText))
      }
    } finally {
      setPayingId(null)
    }
  }

  useEffect(() => {
    Promise.all([fetchMetrics(), fetchTxs(), fetchCredits()]).finally(() => setLoading(false))
    let channel: ReturnType<typeof supabase.channel> | null = null
    try {
      channel = supabase
        .channel('dash-rt')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, () => {
          fetchMetrics(); fetchTxs(); fetchCredits()
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'transactions' }, () => {
          fetchMetrics(); fetchTxs(); fetchCredits()
        })
        .subscribe(s => setLive(s === 'SUBSCRIBED'))
    } catch { /* realtime unavailable */ }
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [fetchMetrics, fetchTxs, fetchCredits])

  // hourly sales chart
  const chartData = (() => {
    const map: Record<string, { time: string; sales: number; orders: number }> = {}
    txs.forEach(tx => {
      const h = new Date(tx.created_at).getHours()
      const k = `${h.toString().padStart(2, '0')}:00`
      if (!map[k]) map[k] = { time: k, sales: 0, orders: 0 }
      map[k].sales += tx.total
      map[k].orders += 1
    })
    return Object.values(map).sort((a, b) => a.time.localeCompare(b.time))
  })()

  // top products
  const topProducts = (() => {
    const map: Record<string, { name: string; qty: number; revenue: number; image_url: string | null }> = {}
    txs.forEach(tx => {
      if (!tx.products) return
      const n = tx.products.name
      if (!map[n]) map[n] = { name: n, qty: 0, revenue: 0, image_url: tx.products.image_url ?? null }
      map[n].qty += tx.qty
      map[n].revenue += tx.total
    })
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5)
  })()
  const maxQty = topProducts[0]?.qty || 1

  const COLORS = [C.teal, C.amber, C.violet, C.coral, C.textSub]

  return (
    <div className="ds-root" style={{ display: 'flex', height: '100vh', background: C.bg, fontFamily: "'Outfit', 'Segoe UI', sans-serif", color: C.text, overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
        @keyframes coralPing { 0%,100% { box-shadow: 0 0 0 0 rgba(255,100,114,0.6); } 50% { box-shadow: 0 0 0 6px rgba(255,100,114,0); } }
        @keyframes tealPing { 0%,100% { box-shadow: 0 0 0 0 rgba(0,212,170,0.6); } 50% { box-shadow: 0 0 0 6px rgba(0,212,170,0); } }
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .anim { animation: fadeSlideUp 0.4s ease forwards; }
        .anim1 { animation-delay: 0.05s; opacity: 0; }
        .anim2 { animation-delay: 0.1s; opacity: 0; }
        .anim3 { animation-delay: 0.15s; opacity: 0; }
        .anim4 { animation-delay: 0.2s; opacity: 0; }
        .anim5 { animation-delay: 0.25s; opacity: 0; }
        .anim6 { animation-delay: 0.3s; opacity: 0; }
        .tr-row:hover td { background: ${C.cardHover} !important; }

        .ds-mobile-topbar { display: none; }
        .ds-main { padding: 32px 28px; }
        .ds-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 22px; }
        .ds-charts-row { display: grid; grid-template-columns: 1fr 300px; gap: 14px; margin-bottom: 22px; }
        .ds-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; gap: 12px; flex-wrap: wrap; }
        .ds-recent-table { font-size: 13px; }
        .ds-recent-table th, .ds-recent-table td { white-space: nowrap; }
        .ds-credits-table th, .ds-credits-table td { white-space: nowrap; }

        @media (max-width: 1024px) {
          .ds-stat-grid { grid-template-columns: repeat(2, 1fr); }
          .ds-charts-row { grid-template-columns: 1fr; }
        }
        @media (max-width: 768px) {
          .ds-root { flex-direction: column; height: auto; min-height: 100vh; overflow: visible !important; }
          .ds-sidebar { display: none !important; }
          .ds-mobile-topbar {
            display: flex; align-items: center; justify-content: space-between;
            padding: 14px 16px; background: ${C.sidebar};
            border-bottom: 1px solid ${C.border}; position: sticky; top: 0; z-index: 50;
          }
          .ds-mobile-nav {
            position: fixed; bottom: 0; left: 0; right: 0; z-index: 50;
            display: flex; justify-content: space-around;
            background: ${C.sidebar}; border-top: 1px solid ${C.border};
            padding: 8px 0 12px;
          }
          .ds-mobile-nav a {
            flex: 1; display: flex; flex-direction: column; align-items: center;
            gap: 4px; text-decoration: none; padding: 6px 4px;
            font-size: 10px; font-weight: 600; letter-spacing: 1px;
          }
          .ds-main { padding: 16px 14px 90px; overflow: visible; }
          .ds-stat-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .ds-header h1 { font-size: 18px !important; }
          .ds-header p { font-size: 11px !important; }
          .ds-card-pad { padding: 16px !important; }
        }
        @media (max-width: 420px) {
          .ds-stat-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Mobile top bar */}
      <div className="ds-mobile-topbar">
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', letterSpacing: '3px', color: C.teal, fontWeight: 600 }}>
          MINI STORE
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: live ? C.teal : C.muted,
            animation: live ? 'tealPing 2s ease-in-out infinite' : 'none',
          }} />
          <span style={{ fontSize: '10px', color: live ? C.teal : C.muted, fontWeight: 600, letterSpacing: '1px' }}>
            {live ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* ── Sidebar ── */}
      <aside className="ds-sidebar" style={{
        width: '220px', flexShrink: 0, background: C.sidebar,
        borderRight: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column', padding: '28px 16px 24px',
      }}>
        {/* Brand */}
        <div style={{ padding: '0 6px', marginBottom: '36px' }}>
          <div style={{
            fontFamily: "'DM Mono', monospace", fontSize: '13px', fontWeight: 500,
            letterSpacing: '4px', color: C.teal, marginBottom: '2px',
          }}>MINI STORE</div>
          <div style={{ fontSize: '10px', color: C.muted, letterSpacing: '1px' }}>POS SYSTEM</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1 }}>
          <p style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '2px', color: C.muted, padding: '0 14px', marginBottom: '10px' }}>MENU</p>
          {NAV.map(n => <NavItem key={n.href} {...n} />)}
        </nav>

        {/* Live indicator + date */}
        <div style={{ padding: '16px', background: C.card, borderRadius: '12px', border: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: live ? C.teal : C.muted,
              animation: live ? 'tealPing 2s ease-in-out infinite' : 'none',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: '11px', color: live ? C.teal : C.muted, fontWeight: 600, letterSpacing: '1px' }}>
              {live ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
          <p style={{ fontSize: '11px', color: C.textSub, lineHeight: 1.5 }}>
            {new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
          </p>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="ds-main" style={{ flex: 1, overflow: 'auto' }}>

        {/* Header */}
        <div className="anim anim1 ds-header">
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px' }}>Dashboard</h1>
            <p style={{ fontSize: '13px', color: C.textSub, marginTop: '2px' }}>
              Today's overview — {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <Link href="/scan" style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: C.teal, color: '#000', padding: '10px 18px',
            borderRadius: '10px', textDecoration: 'none', fontSize: '13px', fontWeight: 700,
            letterSpacing: '0.3px', transition: 'opacity 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.85'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
          >
            ◉ Start Scanning
          </Link>
        </div>

        {/* Metric cards */}
        <div className="anim anim2 ds-stat-grid">
          <StatCard
            label="Today's Sales" loading={loading}
            value={metrics ? `₱${metrics.today_sales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
            accent={C.amber} glow={C.amberGlow}
          />
          <StatCard
            label="Transactions" loading={loading}
            value={metrics ? String(metrics.today_tx_count) : '—'}
            sub="orders today"
            accent={C.teal} glow={C.tealGlow}
          />
          <StatCard
            label="Items Sold" loading={loading}
            value={metrics ? String(metrics.total_items_sold) : '—'}
            sub="units out"
            accent={C.violet} glow={C.violetGlow}
          />
          <StatCard
            label="Low Stock" loading={loading}
            value={metrics ? String(metrics.low_stock_count) : '—'}
            sub={metrics?.low_stock_count ? 'needs restock' : 'all stocked'}
            accent={(metrics?.low_stock_count ?? 0) > 0 ? C.coral : C.teal}
            glow={(metrics?.low_stock_count ?? 0) > 0 ? C.coralGlow : C.tealGlow}
            badge={(metrics?.low_stock_count ?? 0) > 0}
          />
        </div>

        {/* Charts + Top Products row */}
        <div className="anim anim3 ds-charts-row">

          {/* Sales chart */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 700 }}>Sales Today</h3>
                <p style={{ fontSize: '11px', color: C.textSub, marginTop: '2px' }}>Hourly revenue</p>
              </div>
              {metrics && (
                <span style={{
                  fontFamily: "'DM Mono', monospace", fontSize: '18px', fontWeight: 500, color: C.amber,
                }}>
                  ₱{metrics.today_sales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
            {chartData.length === 0 ? (
              <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: '13px' }}>
                No sales yet today
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.teal} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={C.teal} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={C.border} strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="time" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: C.borderLight }} />
                  <Area type="monotone" dataKey="sales" stroke={C.teal} strokeWidth={2} fill="url(#tealGrad)" dot={false} activeDot={{ r: 4, fill: C.teal, stroke: C.bg, strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top Products */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '22px 20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>Top Products</h3>
            <p style={{ fontSize: '11px', color: C.textSub, marginBottom: '20px' }}>By units sold today</p>
            {topProducts.length === 0 ? (
              <div style={{ color: C.muted, fontSize: '13px', textAlign: 'center', paddingTop: '40px' }}>No data yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {topProducts.map((p, i) => (
                  <div key={p.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <div style={{
                          width: '30px', height: '30px', borderRadius: '7px', flexShrink: 0,
                          overflow: 'hidden', background: C.border,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {p.image_url
                            ? <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ fontSize: '13px', opacity: 0.4 }}>📦</span>
                          }
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      </div>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', color: COLORS[i], flexShrink: 0 }}>{p.qty} u</span>
                    </div>
                    <div style={{ height: '5px', background: C.border, borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: '3px',
                        width: `${(p.qty / maxQty) * 100}%`,
                        background: `linear-gradient(90deg, ${COLORS[i]}, ${COLORS[i]}99)`,
                        transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {metrics?.top_product && topProducts.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>{metrics.top_product.name}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px', color: C.teal }}>{metrics.top_product.qty} u</span>
                  </div>
                  <div style={{ height: '5px', background: C.border, borderRadius: '3px' }}>
                    <div style={{ height: '100%', width: '80%', background: C.teal, borderRadius: '3px' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Outstanding Credits */}
        <div className="anim anim4" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '14px', overflow: 'hidden', marginBottom: '22px' }}>
          <div style={{
            padding: '18px 24px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
                Outstanding Credits
                {credits && credits.count > 0 && (
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: '999px',
                    background: C.amberGlow, color: C.amber,
                    fontFamily: 'monospace', fontSize: '11px', fontWeight: 600,
                  }}>{credits.count}</span>
                )}
              </h3>
              <p style={{ fontSize: '11px', color: C.textSub, marginTop: '2px' }}>Unpaid transactions awaiting settlement</p>
            </div>
            {credits && (
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: '18px', fontWeight: 500,
                color: credits.total_outstanding > 0 ? C.coral : C.muted,
              }}>
                ₱{credits.total_outstanding.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            {loading ? (
              <div style={{ padding: '36px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>Loading…</div>
            ) : !credits || credits.credits.length === 0 ? (
              <div style={{ padding: '36px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>No outstanding credits</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Customer', 'Product', 'Qty', 'Amount', 'Date', ''].map((h, i) => (
                      <th key={h + i} style={{
                        padding: '11px 20px',
                        textAlign: i >= 2 && i <= 3 ? 'right' : i === 5 ? 'center' : 'left',
                        fontSize: '9px', fontWeight: 700, letterSpacing: '2px',
                        color: C.muted, textTransform: 'uppercase',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {credits.credits.map(c => (
                    <tr key={c.id} className="tr-row">
                      <td style={{ padding: '13px 20px', color: C.text, fontWeight: 500, background: 'transparent', transition: 'background 0.1s' }}>
                        {c.customer_name ?? '—'}
                      </td>
                      <td style={{ padding: '13px 20px', color: C.textSub, background: 'transparent', transition: 'background 0.1s' }}>
                        {c.products?.name ?? '—'}
                      </td>
                      <td style={{ padding: '13px 20px', textAlign: 'right', background: 'transparent', transition: 'background 0.1s' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: '5px',
                          background: C.amberGlow, color: C.amber,
                          fontFamily: 'monospace', fontSize: '12px', fontWeight: 500,
                        }}>×{c.qty}</span>
                      </td>
                      <td style={{ padding: '13px 20px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: '14px', color: C.coral, fontWeight: 500, background: 'transparent', transition: 'background 0.1s' }}>
                        ₱{Number(c.total).toFixed(2)}
                      </td>
                      <td style={{ padding: '13px 20px', textAlign: 'right', color: C.textSub, fontSize: '11px', fontFamily: 'monospace', background: 'transparent', transition: 'background 0.1s' }}>
                        {new Date(c.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                      </td>
                      <td style={{ padding: '13px 20px', textAlign: 'center', background: 'transparent', transition: 'background 0.1s' }}>
                        <button
                          onClick={() => markPaid(c.id)}
                          disabled={payingId === c.id}
                          style={{
                            padding: '6px 12px', background: C.teal, color: '#000',
                            border: 'none', borderRadius: '8px', cursor: 'pointer',
                            fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px',
                            opacity: payingId === c.id ? 0.5 : 1,
                          }}
                        >
                          {payingId === c.id ? '…' : 'MARK PAID'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="anim anim5" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{
            padding: '18px 24px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 700 }}>Recent Transactions</h3>
              <p style={{ fontSize: '11px', color: C.textSub, marginTop: '2px' }}>Latest {txs.length} records</p>
            </div>
            <Link href="/reports" style={{
              fontSize: '12px', color: C.teal, textDecoration: 'none',
              fontWeight: 600, letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '4px',
            }}>View All →</Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['#', '', 'Product', 'Qty', 'Total', 'Time'].map((h, i) => (
                    <th key={h + i} style={{
                      padding: i === 1 ? '11px 4px 11px 20px' : '11px 20px',
                      textAlign: i >= 3 ? 'right' : 'left',
                      fontSize: '9px', fontWeight: 700, letterSpacing: '2px',
                      color: C.muted, textTransform: 'uppercase',
                      width: i === 0 ? '40px' : i === 1 ? '44px' : undefined,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: C.muted }}>Loading…</td></tr>
                ) : txs.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: C.muted }}>No transactions yet</td></tr>
                ) : txs.slice(0, 10).map((tx, i) => (
                  <tr key={tx.id} className="tr-row">
                    <td style={{ padding: '13px 20px', color: C.muted, fontFamily: 'monospace', fontSize: '11px', background: 'transparent', transition: 'background 0.1s' }}>
                      {(i + 1).toString().padStart(2, '0')}
                    </td>
                    <td style={{ padding: '13px 4px 13px 20px', background: 'transparent', transition: 'background 0.1s' }}>
                      <div style={{
                        width: '36px', height: '36px', borderRadius: '8px', overflow: 'hidden',
                        background: C.border, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {tx.products?.image_url
                          ? <img src={tx.products.image_url} alt={tx.products.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: '14px', opacity: 0.35 }}>📦</span>
                        }
                      </div>
                    </td>
                    <td style={{ padding: '13px 20px', color: C.text, fontWeight: 500, background: 'transparent', transition: 'background 0.1s' }}>
                      {tx.products?.name ?? '—'}
                    </td>
                    <td style={{ padding: '13px 20px', textAlign: 'right', background: 'transparent', transition: 'background 0.1s' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: '5px',
                        background: C.tealGlow, color: C.teal,
                        fontFamily: 'monospace', fontSize: '12px', fontWeight: 500,
                      }}>×{tx.qty}</span>
                    </td>
                    <td style={{ padding: '13px 20px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: '14px', color: C.amber, fontWeight: 500, background: 'transparent', transition: 'background 0.1s' }}>
                      ₱{tx.total.toFixed(2)}
                    </td>
                    <td style={{ padding: '13px 20px', textAlign: 'right', color: C.textSub, fontSize: '11px', fontFamily: 'monospace', background: 'transparent', transition: 'background 0.1s' }}>
                      {new Date(tx.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {/* Mobile bottom nav */}
      <nav className="ds-mobile-nav">
        {NAV.map(n => {
          return (
            <Link key={n.href} href={n.href} style={{ color: C.textSub }}>
              <span style={{ fontSize: '18px' }}>{n.icon}</span>
              <span>{n.label.toUpperCase()}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
