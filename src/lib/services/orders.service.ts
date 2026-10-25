import { apiClient, ApiError } from '@/lib/api-client'
import { db } from '@/lib/firebase/config'
import { collection, getDocs } from 'firebase/firestore/lite'
import { Order, OrderPayment } from '@/lib/types'

export interface GetOrdersParams {
  customerId?: string
  locationId?: string
  cursor?: string
  limit?: number
}

export interface GetOrdersResponse {
  success: boolean
  orders: Order[]
  nextCursor: string | null
}

export interface CreateOrderLineInput {
  productId: string
  qty: number
  pieceWeightMg?: number
  unitPricePaise: number
}

export interface CreateOrderInput {
  type: 'sale' | 'return'
  customerId?: string
  locationId: string
  date: string
  lines: CreateOrderLineInput[]
  payments: OrderPayment[]
  notes?: string
}

export interface CreateOrderResponse {
  success: boolean
  order: Order
}

export interface ReverseOrderResponse {
  success: boolean
  order: Order
}

function shouldFallback(err: unknown): boolean {
  if (err instanceof Error && err.message === 'Authentication required') {
    return false
  }
  if (err instanceof ApiError) {
    return err.status >= 500 || err.status === 0
  }
  return true
}

/**
 * Fetches paginated orders with optional customerId, locationId, cursor, and limit filters.
 */
export async function getOrders(params?: GetOrdersParams): Promise<GetOrdersResponse> {
  try {
    return await apiClient.get<GetOrdersResponse>('/api/admin/orders', params, { actionName: 'fetch orders' })
  } catch (err) {
    if (!shouldFallback(err)) throw err
    console.warn('Orders API failed, falling back to direct Firestore:', err)
    const snap = await getDocs(collection(db, 'orders'))
    const orders: Order[] = []
    snap.forEach((d) => {
      const data = d.data()
      if (params?.customerId && data.customerId !== params.customerId) return
      if (params?.locationId && data.locationId !== params.locationId) return
      orders.push({ id: d.id, ...data } as Order)
    })
    orders.sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
    const limit = params?.limit ? Number(params.limit) : 50
    const paged = orders.slice(0, limit)
    return {
      success: true,
      orders: paged,
      nextCursor: orders.length > limit ? paged[paged.length - 1].id : null
    }
  }
}

/**
 * Creates a new order (sale or return bill).
 */
export async function createOrder(payload: CreateOrderInput): Promise<CreateOrderResponse> {
  return apiClient.post<CreateOrderResponse>('/api/admin/orders', payload, { actionName: 'record sale order' })
}

/**
 * Reverses an order and restores all sold stock atomically.
 */
export async function reverseOrder(orderId: string, reason?: string): Promise<ReverseOrderResponse> {
  return apiClient.post<ReverseOrderResponse>(
    `/api/admin/orders/${encodeURIComponent(orderId)}/reverse`,
    { reason },
    { actionName: 'reverse order' }
  )
}
