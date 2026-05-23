import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { clearAndWriteSheet } from '@/lib/sheets'
import { getStockLevels } from '@/lib/inventory'

export async function POST() {
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*, products(name)')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // --- Sheet 1: Daily Sales ---
  const salesRows: (string | number)[][] = [
    ['Date', 'Product', 'Qty', 'Total (₱)'],
    ...(transactions ?? []).map((t) => [
      t.created_at,
      (t.products as { name: string } | null)?.name ?? '',
      t.qty ?? 0,
      t.total,
    ]),
  ]

  // --- Sheet 2: Stock Snapshot ---
  const stock = await getStockLevels()
  const snapshotRows: (string | number | boolean)[][] = [
    ['Product', 'Category', 'Barcode', 'Price (₱)', 'Stock Qty', 'Threshold', 'Low Stock', 'As of'],
    ...stock.map((p) => [
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

  try {
    await Promise.all([
      clearAndWriteSheet('Daily Sales', salesRows),
      clearAndWriteSheet('Stock Snapshot', snapshotRows),
    ])
    return NextResponse.json({ synced: (transactions ?? []).length })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
