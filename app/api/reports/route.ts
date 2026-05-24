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
    .select('*, original_price_at_sale, payment_method, customer_name, paid, paid_at, products(name, category)')
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString())
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const periodMap: Record<string, { date: string; total: number; original_total: number; count: number }> = {}
  const prodMap: Record<string, { name: string; qty: number; total: number; revenue: number }> = {}
  const catMap: Record<string, {
    category: string
    total: number
    revenue: number
    qty: number
    products: Record<string, { name: string; qty: number; total: number; revenue: number }>
  }> = {}

  const creditCustomerMap: Record<string, { name: string; total: number; paid: number; unpaid: number; count: number; paid_count: number; unpaid_count: number }> = {}
  const creditDayMap: Record<string, { date: string; total: number; paid: number; unpaid: number; count: number }> = {}
  let credit_total = 0
  let credit_paid_total = 0
  let credit_unpaid_total = 0
  let credit_count = 0
  let credit_paid_count = 0
  let credit_unpaid_count = 0

  for (const t of txs ?? []) {
    const prod = t.products as { name: string; category: string | null } | null
    const origCost = Number(t.original_price_at_sale ?? 0) * (t.qty ?? 0)
    const profit = t.total - origCost

    const key = bucketKey(t.created_at, period)
    if (!periodMap[key]) periodMap[key] = { date: key, total: 0, original_total: 0, count: 0 }
    periodMap[key].total += t.total
    periodMap[key].original_total += origCost
    periodMap[key].count += 1

    const name = prod?.name ?? 'Unknown'
    const category = prod?.category ?? 'Uncategorized'

    if (!prodMap[name]) prodMap[name] = { name, qty: 0, total: 0, revenue: 0 }
    prodMap[name].qty += t.qty ?? 0
    prodMap[name].total += t.total
    prodMap[name].revenue += profit

    if (!catMap[category]) catMap[category] = { category, total: 0, revenue: 0, qty: 0, products: {} }
    catMap[category].total += t.total
    catMap[category].revenue += profit
    catMap[category].qty += t.qty ?? 0
    if (!catMap[category].products[name]) catMap[category].products[name] = { name, qty: 0, total: 0, revenue: 0 }
    catMap[category].products[name].qty += t.qty ?? 0
    catMap[category].products[name].total += t.total
    catMap[category].products[name].revenue += profit

    if (t.payment_method === 'credit') {
      const amt = Number(t.total ?? 0)
      const isPaid = !!t.paid
      const custName = (t.customer_name ?? '—').trim() || '—'
      const custKey = custName.toLowerCase()

      credit_total += amt
      credit_count += 1
      if (isPaid) { credit_paid_total += amt; credit_paid_count += 1 }
      else { credit_unpaid_total += amt; credit_unpaid_count += 1 }

      if (!creditCustomerMap[custKey]) creditCustomerMap[custKey] = { name: custName, total: 0, paid: 0, unpaid: 0, count: 0, paid_count: 0, unpaid_count: 0 }
      const cc = creditCustomerMap[custKey]
      cc.total += amt
      cc.count += 1
      if (isPaid) { cc.paid += amt; cc.paid_count += 1 } else { cc.unpaid += amt; cc.unpaid_count += 1 }

      const dayKey = t.created_at.slice(0, 10)
      if (!creditDayMap[dayKey]) creditDayMap[dayKey] = { date: dayKey, total: 0, paid: 0, unpaid: 0, count: 0 }
      const dd = creditDayMap[dayKey]
      dd.total += amt
      dd.count += 1
      if (isPaid) dd.paid += amt; else dd.unpaid += amt
    }
  }

  const category_sales = Object.values(catMap)
    .map(c => ({
      category: c.category,
      total: c.total,
      revenue: c.revenue,
      qty: c.qty,
      products: Object.values(c.products).sort((a, b) => b.revenue - a.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue)

  const stock_snapshot = await getStockLevels()

  const credit_by_customer = Object.values(creditCustomerMap).sort((a, b) => b.unpaid - a.unpaid || b.total - a.total)
  const credit_by_day = Object.values(creditDayMap).sort((a, b) => a.date.localeCompare(b.date))

  return NextResponse.json({
    period,
    daily_sales: Object.values(periodMap).sort((a, b) => a.date.localeCompare(b.date)),
    top_products: Object.values(prodMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    category_sales,
    stock_snapshot,
    credits: {
      total: credit_total,
      paid_total: credit_paid_total,
      unpaid_total: credit_unpaid_total,
      count: credit_count,
      paid_count: credit_paid_count,
      unpaid_count: credit_unpaid_count,
      by_customer: credit_by_customer,
      by_day: credit_by_day,
    },
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    },
  })
}
