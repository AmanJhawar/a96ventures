import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { auth } from '@/lib/firebase/auth'
import { getOrders, createOrder, reverseOrder } from '@/lib/services/orders.service'
import { getVisits, logVisit, updateVisit } from '@/lib/services/visits.service'

vi.mock('@/lib/firebase/auth', () => ({
  auth: {
    currentUser: null
  }
}))

describe('Client Services (orders.service and visits.service)', () => {
  const mockFetch = vi.fn()

  function setCurrentUser(user: unknown) {
    Object.defineProperty(auth, 'currentUser', {
      value: user,
      configurable: true,
      writable: true
    })
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    setCurrentUser({
      getIdToken: vi.fn(async () => 'mock-jwt-token')
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('orders.service', () => {
    it('throws when user is not authenticated', async () => {
      setCurrentUser(null)
      await expect(getOrders()).rejects.toThrow('Authentication required')
      await expect(createOrder({
        type: 'sale',
        locationId: 'loc_1',
        date: '2026-04-01',
        lines: [],
        payments: []
      })).rejects.toThrow('Authentication required')
      await expect(reverseOrder('order_1')).rejects.toThrow('Authentication required')
    })

    it('getOrders attaches Authorization header and queries params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, orders: [{ id: 'order_1', orderNo: 'A96-26-000001' }], nextCursor: null })
      })

      const res = await getOrders({ customerId: 'cust_1', limit: 50 })
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/orders?customerId=cust_1&limit=50',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-jwt-token'
          }
        })
      )
      expect(res.orders).toHaveLength(1)
      expect(res.orders[0].orderNo).toBe('A96-26-000001')
    })

    it('getOrders throws server error message when !res.ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Forbidden: sales.view permission required' })
      })

      await expect(getOrders()).rejects.toThrow('Forbidden: sales.view permission required')
    })

    it('createOrder posts order with token and returns created order', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, order: { id: 'order_2', orderNo: 'A96-26-000002' } })
      })

      const payload = {
        type: 'sale' as const,
        locationId: 'loc_1',
        date: '2026-04-01',
        lines: [{ productId: 'p1', qty: 1, unitPricePaise: 50000 }],
        payments: [{ mode: 'cash' as const, amountPaise: 50000 }]
      }

      const res = await createOrder(payload)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/orders',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-jwt-token'
          },
          body: JSON.stringify(payload)
        })
      )
      expect(res.order.orderNo).toBe('A96-26-000002')
    })

    it('createOrder throws server error message when !res.ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Insufficient stock in location' })
      })

      await expect(
        createOrder({
          type: 'sale',
          locationId: 'loc_1',
          date: '2026-04-01',
          lines: [],
          payments: []
        })
      ).rejects.toThrow('Insufficient stock in location')
    })

    it('createOrder handles non-JSON / HTML 500 error gracefully without Safari pattern exception', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => '<html><body>500 Internal Server Error: Database failure</body></html>'
      })

      await expect(
        createOrder({
          type: 'sale',
          locationId: 'loc_1',
          date: '2026-04-01',
          lines: [],
          payments: []
        })
      ).rejects.toThrow(/Server error \(500\)/)
    })

    it('reverseOrder posts reverse request with token and orderId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, order: { id: 'order_2', isReversed: true } })
      })

      const res = await reverseOrder('order_2', 'Customer cancellation')
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/orders/order_2/reverse',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-jwt-token'
          },
          body: JSON.stringify({ reason: 'Customer cancellation' })
        })
      )
      expect(res.order.isReversed).toBe(true)
    })

    it('reverseOrder throws server error message when !res.ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Order "A96-26-000002" is already reversed.' })
      })

      await expect(reverseOrder('order_2')).rejects.toThrow('Order "A96-26-000002" is already reversed.')
    })
  })

  describe('visits.service', () => {
    it('throws when user is not authenticated', async () => {
      setCurrentUser(null)
      await expect(getVisits()).rejects.toThrow('Authentication required')
      await expect(logVisit({ customerId: 'c1', locationId: 'loc_1', kind: 'walk_in' })).rejects.toThrow('Authentication required')
      await expect(updateVisit('v1', { followUpDone: true })).rejects.toThrow('Authentication required')
    })

    it('getVisits queries with token and filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, visits: [{ id: 'v1', kind: 'inquiry' }], nextCursor: null })
      })

      const res = await getVisits({ customerId: 'cust_1' })
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/visits?customerId=cust_1',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-jwt-token'
          }
        })
      )
      expect(res.visits).toHaveLength(1)
    })

    it('logVisit posts visit with token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, visit: { id: 'v2', kind: 'walk_in' } })
      })

      const payload = {
        customerId: 'cust_1',
        locationId: 'loc_1',
        kind: 'walk_in' as const,
        note: 'Customer walked in to check silver idols'
      }

      const res = await logVisit(payload)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/visits',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-jwt-token'
          },
          body: JSON.stringify(payload)
        })
      )
      expect(res.visit.id).toBe('v2')
    })

    it('logVisit throws server error message when !res.ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid visit kind' })
      })

      await expect(logVisit({ customerId: 'c1', locationId: 'loc_1', kind: 'walk_in' })).rejects.toThrow('Invalid visit kind')
    })

    it('updateVisit patches visit with token and payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, visit: { id: 'v2', followUpDone: true } })
      })

      const res = await updateVisit('v2', { followUpDone: true })
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/visits/v2',
        expect.objectContaining({
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-jwt-token'
          },
          body: JSON.stringify({ followUpDone: true })
        })
      )
      expect(res.visit.followUpDone).toBe(true)
    })

    it('updateVisit throws server error message when !res.ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Visit not found' })
      })

      await expect(updateVisit('v_missing', { followUpDone: true })).rejects.toThrow('Visit not found')
    })
  })
})
