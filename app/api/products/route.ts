import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const barcode = searchParams.get('barcode')

  let query = supabase.from('products').select('*')

  if (barcode) {
    query = query.eq('barcode', barcode)
    const { data, error } = await query.single()
    if (error) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    return NextResponse.json(data)
  }

  const { data, error } = await query.order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, barcode, price, category, stock_qty, low_stock_threshold } = body

  if (!name || price == null) {
    return NextResponse.json({ error: 'name and price required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('products')
    .insert({ name, barcode, price, category, stock_qty: stock_qty ?? 0, low_stock_threshold: low_stock_threshold ?? 5 })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
