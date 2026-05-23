import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getStockLevels } from '@/lib/inventory'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const to = searchParams.get('to') ?? new Date().toISOString().split('T')[0]

  const fromDate = new Date(from + 'T00:00:00')
  const toDate = new Date(to + 'T23:59:59')

  const { data: txs, error } = await supabase
    .from('transactions')
    .select('*, products(name)')
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString())
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const dailyMap: Record<string, { date: string; total: number; count: number }> = {}
  const prodMap: Record<string, { name: string; qty: number; total: number }> = {}

  for (const t of txs ?? []) {
    const day = t.created_at.split('T')[0]
    if (!dailyMap[day]) dailyMap[day] = { date: day, total: 0, count: 0 }
    dailyMap[day].total += t.total
    dailyMap[day].count += 1

    const name = (t.products as { name: string } | null)?.name ?? 'Unknown'
    if (!prodMap[name]) prodMap[name] = { name, qty: 0, total: 0 }
    prodMap[name].qty += t.qty ?? 0
    prodMap[name].total += t.total
  }

  const stock_snapshot = await getStockLevels()

  return NextResponse.json({
    daily_sales: Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)),
    top_products: Object.values(prodMap).sort((a, b) => b.total - a.total).slice(0, 10),
    stock_snapshot,
  })
}
