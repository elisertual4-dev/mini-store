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

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, barcode, image_url } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const updates: Record<string, unknown> = {}
    if (barcode !== undefined) updates.barcode = barcode
    if (image_url !== undefined) updates.image_url = image_url
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, barcode, price, category, stock_qty, low_stock_threshold, image_url } = body

    if (!name || price == null) {
      return NextResponse.json({ error: 'name and price required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('products')
      .insert({ name, barcode, price, category, stock_qty: stock_qty ?? 0, low_stock_threshold: low_stock_threshold ?? 5, image_url: image_url ?? null })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
