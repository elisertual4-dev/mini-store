import { supabase } from './supabase'

export type StockLevel = {
  id: string
  barcode: string | null
  name: string
  price: number
  stock_qty: number
  low_stock_threshold: number
  category: string | null
  image_url: string | null
  is_low_stock: boolean
}

export type InventoryLog = {
  id: string
  product_id: string
  change_qty: number
  type: 'sale' | 'restock' | 'adjustment'
  note: string | null
  created_at: string
}

export async function getStockLevels(): Promise<StockLevel[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name')

  if (error) throw error

  return data.map((p) => ({
    ...p,
    is_low_stock: p.stock_qty <= p.low_stock_threshold,
  }))
}

export async function getLowStockProducts(threshold?: number): Promise<StockLevel[]> {
  const levels = await getStockLevels()
  return levels.filter((p) =>
    threshold != null ? p.stock_qty <= threshold : p.is_low_stock
  )
}

export async function restockProduct(
  productId: string,
  qty: number,
  supplierId?: string
): Promise<void> {
  const { data: product, error: fetchErr } = await supabase
    .from('products')
    .select('stock_qty')
    .eq('id', productId)
    .single()

  if (fetchErr) throw fetchErr

  const { error: updateErr } = await supabase
    .from('products')
    .update({ stock_qty: product.stock_qty + qty })
    .eq('id', productId)

  if (updateErr) throw updateErr

  const { error: logErr } = await supabase.from('inventory_logs').insert({
    product_id: productId,
    change_qty: qty,
    type: 'restock',
    note: supplierId ? `Restock via supplier ${supplierId}` : 'Manual restock',
  })

  if (logErr) throw logErr
}

export async function adjustStock(
  productId: string,
  qty: number,
  note: string
): Promise<void> {
  const { data: product, error: fetchErr } = await supabase
    .from('products')
    .select('stock_qty')
    .eq('id', productId)
    .single()

  if (fetchErr) throw fetchErr

  const { error: updateErr } = await supabase
    .from('products')
    .update({ stock_qty: product.stock_qty + qty })
    .eq('id', productId)

  if (updateErr) throw updateErr

  const { error: logErr } = await supabase.from('inventory_logs').insert({
    product_id: productId,
    change_qty: qty,
    type: 'adjustment',
    note,
  })

  if (logErr) throw logErr
}

export async function getInventoryLogs(productId: string): Promise<InventoryLog[]> {
  const { data, error } = await supabase
    .from('inventory_logs')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as InventoryLog[]
}
