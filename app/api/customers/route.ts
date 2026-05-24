import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export async function GET() {
  const { data, error } = await supabase
    .from('transactions')
    .select('customer_name, created_at')
    .not('customer_name', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Distinct names preserving most-recent order
  const seen = new Set<string>()
  const customers: string[] = []
  for (const row of data ?? []) {
    const name = (row.customer_name ?? '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    customers.push(name)
  }

  return NextResponse.json(
    { customers },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
  )
}
