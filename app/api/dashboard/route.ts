import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()

  const [{ data: txs, error: txErr }, { data: products, error: prodErr }] = await Promise.all([
    supabase
      .from('transactions')
      .select('*, products(name)')
      .gte('created_at', todayISO),
    supabase.from('products').select('stock_qty, low_stock_threshold'),
  ])

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })
  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 })

  const list = txs ?? []
  const todaySales = list.reduce((s, t) => s + t.total, 0)
  const todayTxCount = list.length
  const totalItemsSold = list.reduce((s, t) => s + (t.qty ?? 0), 0)

  const byProduct: Record<string, { name: string; qty: number }> = {}
  for (const t of list) {
    const name = (t.products as { name: string } | null)?.name ?? 'Unknown'
    if (!byProduct[t.product_id]) byProduct[t.product_id] = { name, qty: 0 }
    byProduct[t.product_id].qty += t.qty ?? 0
  }
  const topProduct = Object.values(byProduct).sort((a, b) => b.qty - a.qty)[0] ?? null

  const lowStockCount = (products ?? []).filter(p => p.stock_qty <= p.low_stock_threshold).length

  return NextResponse.json({ today_sales: todaySales, today_tx_count: todayTxCount, total_items_sold: totalItemsSold, top_product: topProduct, low_stock_count: lowStockCount })
}
