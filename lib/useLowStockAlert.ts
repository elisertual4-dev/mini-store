'use client'

import { useEffect } from 'react'
import { supabase } from './supabase'

export function useLowStockAlert() {
  useEffect(() => {
    const channel = supabase
      .channel('low-stock-watch')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'products' },
        (payload) => {
          const product = payload.new as {
            name: string
            stock_qty: number
            low_stock_threshold: number
          }

          if (product.stock_qty <= product.low_stock_threshold) {
            if (Notification.permission === 'granted') {
              new Notification('Low Stock Alert', {
                body: `"${product.name}" is low: ${product.stock_qty} units left`,
              })
            } else if (Notification.permission !== 'denied') {
              Notification.requestPermission().then((perm) => {
                if (perm === 'granted') {
                  new Notification('Low Stock Alert', {
                    body: `"${product.name}" is low: ${product.stock_qty} units left`,
                  })
                }
              })
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])
}
