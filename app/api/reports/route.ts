import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getStockLevels } from '@/lib/inventory'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

type Period = 'day' | 'month' | 'year'

function bucketKey(iso: string, p: Period) {
  if (p === 'year') return iso.slice(0, 4)
  if (p === 'month') return iso.slice(0, 7)
  return iso.split('T')[0]
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const to = searchParams.get('to') ?? new Date().toISOString().split('T')[0]
  const periodParam = (searchParams.get('period') ?? 'day') as Period
  const period: Period = ['day', 'month', 'year'].includes(periodParam) ? periodParam : 'day'

  const fromDate = new Date(from + 'T00:00:00')
  const toDate = new Date(to + 'T23:59:59')

  const { data: txs, error } = await supabase
    .from('transactions')
    .select('*, products(name, category, original_price)')
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString())
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const periodMap: Record<string, { date: string; total: number; original_total: number; count: number }> = {}
  const prodMap: Record<string, { name: string; qty: number; total: number }> = {}
  const catMap: Record<string, {
    category: string
    total: number
    qty: number
    products: Record<string, { name: string; qty: number; total: number }>
  }> = {}

  for (const t of txs ?? []) {
    const key = bucketKey(t.created_at, period)
    if (!periodMap[key]) periodMap[key] = { date: key, total: 0, original_total: 0, count: 0 }
    periodMap[key].total += t.total
    periodMap[key].original_total += ((t.products as { original_price?: number } | null)?.original_price ?? 0) * (t.qty ?? 0)
    periodMap[key].count += 1

    const prod = t.products as { name: string; category: string | null; original_price: number } | null
    const name = prod?.name ?? 'Unknown'
    const category = prod?.category ?? 'Uncategorized'

    if (!prodMap[name]) prodMap[name] = { name, qty: 0, total: 0 }
    prodMap[name].qty += t.qty ?? 0
    prodMap[name].total += t.total

    if (!catMap[category]) catMap[category] = { category, total: 0, qty: 0, products: {} }
    catMap[category].total += t.total
    catMap[category].qty += t.qty ?? 0
    if (!catMap[category].products[name]) catMap[category].products[name] = { name, qty: 0, total: 0 }
    catMap[category].products[name].qty += t.qty ?? 0
    catMap[category].products[name].total += t.total
  }

  const category_sales = Object.values(catMap)
    .map(c => ({
      category: c.category,
      total: c.total,
      qty: c.qty,
      products: Object.values(c.products).sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total)

  const stock_snapshot = await getStockLevels()

  return NextResponse.json({
    period,
    daily_sales: Object.values(periodMap).sort((a, b) => a.date.localeCompare(b.date)),
    top_products: Object.values(prodMap).sort((a, b) => b.total - a.total).slice(0, 10),
    category_sales,
    stock_snapshot,
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    },
  })
}
