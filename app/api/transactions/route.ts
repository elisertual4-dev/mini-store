import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Number(searchParams.get('limit') ?? 50)

  const { data, error } = await supabase
    .from('transactions')
    .select('*, products(name, barcode, price)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { product_id, qty, total, staff_id } = body

  if (!product_id || !qty || total == null) {
    return NextResponse.json({ error: 'product_id, qty, total required' }, { status: 400 })
  }

  // Check sufficient stock before insert
  const { data: product, error: stockErr } = await supabase
    .from('products')
    .select('stock_qty, name')
    .eq('id', product_id)
    .single()

  if (stockErr) return NextResponse.json({ error: stockErr.message }, { status: 500 })

  if (product.stock_qty < qty) {
    return NextResponse.json(
      { error: `Insufficient stock for "${product.name}". Available: ${product.stock_qty}` },
      { status: 422 }
    )
  }

  // Insert triggers DB trigger: auto-decrements stock_qty + inserts inventory_log
  const { data, error } = await supabase
    .from('transactions')
    .insert({ product_id, qty, total, staff_id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
