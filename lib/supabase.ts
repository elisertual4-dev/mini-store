import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Product = {
  id: string
  name: string
  barcode: string | null
  price: number
  created_at: string
}

export type Inventory = {
  id: string
  product_id: string
  quantity: number
  low_stock_threshold: number
  updated_at: string
}

export type Transaction = {
  id: string
  product_id: string | null
  quantity: number
  total: number
  created_at: string
}
