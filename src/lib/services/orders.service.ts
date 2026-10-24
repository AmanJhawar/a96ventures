import { auth } from '@/lib/firebase/auth'
import { Order, OrderPayment } from '@/lib/types'

async function getAuthHeaders(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser
  if (!currentUser) {
    throw new Error('Authentication required')
  }
  const token = await currentUser.getIdToken()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  }
}

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

async function parseResponseJson<T>(res: Response, fallbackAction: string): Promise<T> {
  let data: Record<string, unknown> | null = null
  if (typeof res.text === 'function') {
    const text = await res.text()
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        const cleanSnippet = text.replace(/<[^>]*>?/gm, '').trim().slice(0, 150)
        throw new Error(
          res.ok
            ? 'Invalid server response format'
            : `Server error (${res.status}): ${cleanSnippet || res.statusText || 'Unknown error'}`
        )
      }
    }
  } else if (typeof res.json === 'function') {
    data = (await res.json()) as Record<string, unknown>
  }

  if (!res.ok) {
    const errMsg = typeof data?.error === 'string' ? data.error : `Failed to ${fallbackAction} (${res.status})`
    throw new Error(errMsg)
  }

  return (data || {}) as T
}

/**
 * Fetches paginated orders with optional customerId, locationId, cursor, and limit filters.
 */
export async function getOrders(params?: GetOrdersParams): Promise<GetOrdersResponse> {
  const headers = await getAuthHeaders()
  const search = new URLSearchParams()
  if (params?.customerId) search.set('customerId', params.customerId)
  if (params?.locationId) search.set('locationId', params.locationId)
  if (params?.cursor) search.set('cursor', params.cursor)
  if (params?.limit) search.set('limit', String(params.limit))

  const qs = search.toString()
  const res = await fetch(`/api/admin/orders${qs ? `?${qs}` : ''}`, {
    method: 'GET',
    headers
  })

  return parseResponseJson<GetOrdersResponse>(res, 'fetch orders')
}

/**
 * Creates a new order (sale or return bill).
 */
export async function createOrder(payload: CreateOrderInput): Promise<CreateOrderResponse> {
  const headers = await getAuthHeaders()
  const res = await fetch('/api/admin/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  })

  return parseResponseJson<CreateOrderResponse>(res, 'record sale order')
}

/**
 * Reverses an order and restores all sold stock atomically.
 */
export async function reverseOrder(orderId: string, reason?: string): Promise<ReverseOrderResponse> {
  const headers = await getAuthHeaders()
  const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/reverse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ reason })
  })

  return parseResponseJson<ReverseOrderResponse>(res, 'reverse order')
}

