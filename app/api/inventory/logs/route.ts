import { NextRequest, NextResponse } from 'next/server'
import { getInventoryLogs } from '@/lib/inventory'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const productId = new URL(req.url).searchParams.get('product_id')
  if (!productId) {
    return NextResponse.json({ error: 'product_id required' }, { status: 400 })
  }
  try {
    const logs = await getInventoryLogs(productId)
    return NextResponse.json(logs)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
