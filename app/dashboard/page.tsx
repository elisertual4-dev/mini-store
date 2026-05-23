'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

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
  products: { name: string; barcode: string | null; price: number } | null
}

const S = {
  bg: '#0c0a09',
  surface: '#1c1917',
  border: '#292524',
  amber: '#f59e0b',
  amberDim: '#78350f',
  green: '#4ade80',
  red: '#f87171',
  muted: '#78716c',
  text: '#fafaf9',
  textSub: '#a8a29e',
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [txs, setTxs] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(false)

  const fetchMetrics = useCallback(async () => {
    const r = await fetch('/api/dashboard')
    if (r.ok) setMetrics(await r.json())
  }, [])

  const fetchTxs = useCallback(async () => {
    const r = await fetch('/api/transactions?limit=20')
    if (r.ok) setTxs(await r.json())
  }, [])

  useEffect(() => {
    Promise.all([fetchMetrics(), fetchTxs()]).finally(() => setLoading(false))

    const channel = supabase
      .channel('dash-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, () => {
        fetchMetrics()
        fetchTxs()
      })
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED')
      })

    return () => { supabase.removeChannel(channel) }
  }, [fetchMetrics, fetchTxs])

  const cards = [
    {
      label: "TODAY'S SALES",
      value: metrics ? `₱${metrics.today_sales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—',
      accent: S.amber,
      size: 'lg',
    },
    {
      label: 'TRANSACTIONS',
      value: metrics ? String(metrics.today_tx_count) : '—',
      accent: S.green,
      size: 'md',
    },
    {
      label: 'ITEMS SOLD',
      value: metrics ? String(metrics.total_items_sold) : '—',
      accent: S.textSub,
      size: 'md',
    },
    {
      label: 'TOP PRODUCT',
      value: metrics?.top_product?.name ?? '—',
      sub: metrics?.top_product ? `${metrics.top_product.qty} units` : '',
      accent: S.textSub,
      size: 'sm',
    },
    {
      label: 'LOW STOCK',
      value: metrics ? String(metrics.low_stock_count) : '—',
      accent: (metrics?.low_stock_count ?? 0) > 0 ? S.red : S.green,
      badge: (metrics?.low_stock_count ?? 0) > 0,
      size: 'md',
    },
  ]

  return (
    <main style={{ background: S.bg, minHeight: '100vh', fontFamily: "'Syne', sans-serif", color: S.text }}>
      {/* Grid texture overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: `linear-gradient(${S.border} 1px, transparent 1px), linear-gradient(90deg, ${S.border} 1px, transparent 1px)`,
        backgroundSize: '40px 40px', opacity: 0.25,
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '40px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: '32px', letterSpacing: '3px', color: S.amber }}>
                MINI STORE
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block',
                  background: live ? S.green : S.muted,
                  boxShadow: live ? `0 0 0 0 ${S.green}` : 'none',
                  animation: live ? 'pulse 2s infinite' : 'none',
                }} />
                <style>{`
                  @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(74,222,128,0.4); }
                    70% { box-shadow: 0 0 0 6px rgba(74,222,128,0); }
                    100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); }
                  }
                  @keyframes redpulse {
                    0% { box-shadow: 0 0 0 0 rgba(248,113,113,0.5); }
                    70% { box-shadow: 0 0 0 8px rgba(248,113,113,0); }
                    100% { box-shadow: 0 0 0 0 rgba(248,113,113,0); }
                  }
                `}</style>
                <span style={{ fontSize: '11px', color: live ? S.green : S.muted, fontWeight: 600, letterSpacing: '1px' }}>
                  {live ? 'LIVE' : 'CONNECTING'}
                </span>
              </div>
            </div>
            <p style={{ color: S.muted, fontSize: '13px', letterSpacing: '1px' }}>
              {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <nav style={{ display: 'flex', gap: '8px' }}>
            {[
              { href: '/inventory', label: 'Inventory' },
              { href: '/reports', label: 'Reports' },
              { href: '/scan', label: 'Scan' },
            ].map(({ href, label }) => (
              <Link key={href} href={href} style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                border: `1px solid ${S.border}`, color: S.textSub, textDecoration: 'none',
                background: S.surface, letterSpacing: '0.5px',
                transition: 'border-color 0.2s, color 0.2s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = S.amber; (e.currentTarget as HTMLElement).style.color = S.amber }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = S.border; (e.currentTarget as HTMLElement).style.color = S.textSub }}
              >{label}</Link>
            ))}
          </nav>
        </div>

        {/* Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '40px' }}>
          {cards.map((card, i) => (
            <div key={i} style={{
              background: S.surface, border: `1px solid ${S.border}`, borderRadius: '16px',
              padding: '20px', position: 'relative', overflow: 'hidden',
              borderTop: `2px solid ${card.accent}`,
            }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: '80px', height: '80px',
                background: `radial-gradient(circle at top right, ${card.accent}15 0%, transparent 70%)` }} />
              <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', color: S.muted, marginBottom: '10px' }}>
                {card.label}
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                <span style={{
                  fontFamily: "'Bebas Neue', cursive",
                  fontSize: card.size === 'lg' ? '36px' : card.size === 'md' ? '42px' : '28px',
                  lineHeight: 1, color: loading ? S.muted : card.accent,
                  maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {loading ? '—' : card.value}
                </span>
                {card.badge && !loading && (metrics?.low_stock_count ?? 0) > 0 && (
                  <span style={{
                    width: '8px', height: '8px', borderRadius: '50%', background: S.red,
                    animation: 'redpulse 1.5s infinite', flexShrink: 0, marginBottom: '8px',
                  }} />
                )}
              </div>
              {card.sub && !loading && (
                <p style={{ fontSize: '11px', color: S.muted, marginTop: '4px' }}>{card.sub}</p>
              )}
            </div>
          ))}
        </div>

        {/* Transactions Table */}
        <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: '20px', letterSpacing: '2px', color: S.text }}>
              RECENT TRANSACTIONS
            </span>
            <Link href="/reports" style={{ fontSize: '12px', color: S.amber, textDecoration: 'none', fontWeight: 600, letterSpacing: '1px' }}>
              VIEW REPORTS →
            </Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.border}` }}>
                  {['Product', 'Qty', 'Total', 'Time'].map(h => (
                    <th key={h} style={{
                      padding: '12px 24px', textAlign: h === 'Qty' || h === 'Total' ? 'right' : 'left',
                      fontSize: '10px', fontWeight: 700, letterSpacing: '2px', color: S.muted,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} style={{ padding: '48px', textAlign: 'center', color: S.muted }}>Loading…</td></tr>
                ) : txs.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '48px', textAlign: 'center', color: S.muted }}>No transactions yet today</td></tr>
                ) : txs.map((tx, i) => (
                  <tr key={tx.id} style={{
                    borderBottom: `1px solid ${S.border}`,
                    background: i % 2 === 0 ? 'transparent' : `${S.border}40`,
                  }}>
                    <td style={{ padding: '14px 24px', color: S.text, fontWeight: 500 }}>
                      {tx.products?.name ?? '—'}
                    </td>
                    <td style={{ padding: '14px 24px', textAlign: 'right', color: S.textSub, fontFamily: "'Bebas Neue', cursive", fontSize: '16px' }}>
                      {tx.qty}
                    </td>
                    <td style={{ padding: '14px 24px', textAlign: 'right', color: S.amber, fontFamily: "'Bebas Neue', cursive", fontSize: '16px' }}>
                      ₱{tx.total.toFixed(2)}
                    </td>
                    <td style={{ padding: '14px 24px', color: S.muted, fontSize: '12px' }}>
                      {new Date(tx.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
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
