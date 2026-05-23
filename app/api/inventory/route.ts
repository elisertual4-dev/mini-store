import { NextRequest, NextResponse } from 'next/server'
import {
  getStockLevels,
  getLowStockProducts,
  restockProduct,
  adjustStock,
} from '@/lib/inventory'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lowStock = searchParams.get('low_stock')
  const threshold = searchParams.get('threshold')

  try {
    const data = lowStock
      ? await getLowStockProducts(threshold ? Number(threshold) : undefined)
      : await getStockLevels()
    return NextResponse.json(data)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { product_id, qty, supplier_id } = body

  if (!product_id || !qty || qty <= 0) {
    return NextResponse.json({ error: 'product_id and qty (>0) required' }, { status: 400 })
  }

  try {
    await restockProduct(product_id, qty, supplier_id)
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { product_id, qty, note } = body

  if (!product_id || qty == null || !note) {
    return NextResponse.json({ error: 'product_id, qty, note required' }, { status: 400 })
  }

  try {
    await adjustStock(product_id, qty, note)
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
