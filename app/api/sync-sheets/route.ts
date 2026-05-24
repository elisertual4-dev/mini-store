import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { clearAndWriteSheet } from '@/lib/sheets'
import { getStockLevels } from '@/lib/inventory'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function POST() {
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*, original_price_at_sale, payment_method, customer_name, paid, paid_at, products(name, category)')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const txs = transactions ?? []

  // --- Sheet 1: Daily Sales ---
  const salesRows: (string | number)[][] = [
    ['Date', 'Product', 'Category', 'Qty', 'Unit Cost (₱)', 'Total (₱)', 'Revenue (₱)', 'Payment', 'Customer', 'Paid', 'Paid At'],
    ...txs.map(t => {
      const prod = t.products as { name: string; category: string | null } | null
      const origCost = Number(t.original_price_at_sale ?? 0) * (t.qty ?? 0)
      const revenue = Number(t.total ?? 0) - origCost
      return [
        t.created_at,
        prod?.name ?? '',
        prod?.category ?? '',
        t.qty ?? 0,
        Number(t.original_price_at_sale ?? 0),
        Number(t.total ?? 0),
        revenue,
        t.payment_method ?? 'cash',
        t.customer_name ?? '',
        t.paid ? 'YES' : 'NO',
        t.paid_at ?? '',
      ]
    }),
  ]

  // --- Sheet 2: Stock Snapshot ---
  const stock = await getStockLevels()
  const snapshotRows: (string | number | boolean)[][] = [
    ['Product', 'Category', 'Barcode', 'Price (₱)', 'Stock Qty', 'Threshold', 'Low Stock', 'As of'],
    ...stock.map(p => [
      p.name,
      p.category ?? '',
      p.barcode ?? '',
      p.price,
      p.stock_qty,
      p.low_stock_threshold,
      p.is_low_stock,
      new Date().toISOString(),
    ]),
  ]

  // --- Sheet 3: Credits (all credit transactions) ---
  const creditTxs = txs.filter(t => t.payment_method === 'credit')
  const creditRows: (string | number)[][] = [
    ['Date', 'Customer', 'Product', 'Qty', 'Total (₱)', 'Status', 'Paid At'],
    ...creditTxs.map(t => [
      t.created_at,
      t.customer_name ?? '',
      (t.products as { name: string } | null)?.name ?? '',
      t.qty ?? 0,
      Number(t.total ?? 0),
      t.paid ? 'PAID' : 'UNPAID',
      t.paid_at ?? '',
    ]),
  ]

  // --- Sheet 4: Credit Summary by Customer ---
  type CustAgg = { name: string; total: number; paid: number; unpaid: number; count: number; paid_count: number; unpaid_count: number }
  const custMap: Record<string, CustAgg> = {}
  for (const t of creditTxs) {
    const name = (t.customer_name ?? '—').trim() || '—'
    const k = name.toLowerCase()
    if (!custMap[k]) custMap[k] = { name, total: 0, paid: 0, unpaid: 0, count: 0, paid_count: 0, unpaid_count: 0 }
    const c = custMap[k]
    const amt = Number(t.total ?? 0)
    c.total += amt
    c.count += 1
    if (t.paid) { c.paid += amt; c.paid_count += 1 }
    else { c.unpaid += amt; c.unpaid_count += 1 }
  }
  const custSummaryRows: (string | number)[][] = [
    ['Customer', 'Total Credit (₱)', 'Paid (₱)', 'Unpaid (₱)', 'Total Tx', 'Paid Tx', 'Unpaid Tx'],
    ...Object.values(custMap)
      .sort((a, b) => b.unpaid - a.unpaid || b.total - a.total)
      .map(c => [c.name, c.total, c.paid, c.unpaid, c.count, c.paid_count, c.unpaid_count]),
  ]

  try {
    await Promise.all([
      clearAndWriteSheet('Daily Sales', salesRows),
      clearAndWriteSheet('Stock Snapshot', snapshotRows),
      clearAndWriteSheet('Credits', creditRows),
      clearAndWriteSheet('Credit Summary', custSummaryRows),
    ])
    return NextResponse.json({
      synced: txs.length,
      credit_tx: creditTxs.length,
      customers: Object.keys(custMap).length,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
