import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { appendToSheet } from '@/lib/sheets'

export async function POST() {
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*, products(name)')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (transactions ?? []).map((t) => [
    t.created_at,
    (t.products as { name: string } | null)?.name ?? '',
    t.quantity,
    t.total,
  ])

  try {
    await appendToSheet(rows)
    return NextResponse.json({ synced: rows.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
