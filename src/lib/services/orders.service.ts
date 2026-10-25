import { apiClient } from '@/lib/api-client'
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

/**
 * Fetches paginated orders with optional customerId, locationId, cursor, and limit filters.
 */
export async function getOrders(params?: GetOrdersParams): Promise<GetOrdersResponse> {
  return apiClient.get<GetOrdersResponse>('/api/admin/orders', params, { actionName: 'fetch orders' })
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
