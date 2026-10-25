import { Transaction } from '@/lib/types'

export interface SaleLineItem {
  id: string
  productId: string
  quantity: string
  price: string
  pieceWeight?: string
}

export interface SaleBill {
  billKey: string
  invoiceNo: string
  orderId?: string
  date: string
  customerName: string
  customerId?: string
  locationName: string
  locationId: string
  items: Transaction[]
  totalQuantity: number
  totalAmount: number
  paymentModes?: string[]
  hasReversed: boolean
  hasActive: boolean
}

export type SalesTab = 'sales' | 'returns'

export function formatDateDisplay(rawDate?: string): string {
  if (!rawDate) return '—'
  const parts = rawDate.split('-')
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    }
  }
  return rawDate
}
