import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export async function GET() {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, qty, total, customer_name, created_at, products(name, image_url)')
    .eq('paid', false)
    .eq('payment_method', 'credit')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const credits = data ?? []
  const total_outstanding = credits.reduce((s, c) => s + Number(c.total ?? 0), 0)

  return NextResponse.json(
    { credits, total_outstanding, count: credits.length },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
  )
}
