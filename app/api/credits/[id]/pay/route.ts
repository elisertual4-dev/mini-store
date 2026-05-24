import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Settling a credit = "convert to cash sale on payment"
// Flips payment_method -> cash, paid -> true, sets paid_at = now
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: existing, error: getErr } = await supabase
    .from('transactions')
    .select('id, paid, payment_method')
    .eq('id', id)
    .single()

  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 404 })
  if (existing.paid) return NextResponse.json({ error: 'already paid' }, { status: 409 })
  if (existing.payment_method !== 'credit') {
    return NextResponse.json({ error: 'not a credit transaction' }, { status: 422 })
  }

  const { data, error } = await supabase
    .from('transactions')
    .update({ paid: true, payment_method: 'cash', paid_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
