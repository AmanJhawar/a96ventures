import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  getIndianFiscalYear,
  validateOrderPayments,
  createOrder,
  reverseOrder
} from '@/lib/server/orders'
import {
  executeOrderLinesStockUpdate,
  OrderLineStockInput
} from '@/lib/server/ledger'
import { purgeCrmDataServer } from '@/lib/server/archive'
import { Product, OrderPayment, Customer } from '@/lib/types'
import { adminDb } from '@/lib/firebase/admin'

describe('Orders and Bills with Payments (Phase 4)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  describe('Indian Fiscal Year & Bill Numbering', () => {
    it('accurately resolves Indian fiscal years across calendar transitions', () => {
      // April starts the new FY
      expect(getIndianFiscalYear('2026-04-01')).toBe('2026')
      expect(getIndianFiscalYear('2026-10-20')).toBe('2026')
      expect(getIndianFiscalYear('2026-12-31')).toBe('2026')

      // Jan, Feb, Mar belong to previous calendar year's FY
      expect(getIndianFiscalYear('2027-01-01')).toBe('2026')
      expect(getIndianFiscalYear('2027-02-15')).toBe('2026')
      expect(getIndianFiscalYear('2027-03-31')).toBe('2026')

      // Next April starts FY 2027
      expect(getIndianFiscalYear('2027-04-01')).toBe('2027')
    })

    it('throws on invalid date inputs', () => {
      expect(() => getIndianFiscalYear('')).toThrow()
      expect(() => getIndianFiscalYear('not-a-date')).toThrow()
      expect(() => getIndianFiscalYear('2026/05/10')).toThrow()
    })
  })

  describe('Payment Split Validation', () => {
    it('accepts exact payment sum in paise', () => {
      const payments: OrderPayment[] = [
        { mode: 'cash', amountPaise: 50000 },
        { mode: 'upi', amountPaise: 50000 }
      ]
      expect(() => validateOrderPayments(payments, 100000)).not.toThrow()
    })

    it('rejects payments 1 paisa short', () => {
      const payments: OrderPayment[] = [
        { mode: 'cash', amountPaise: 99999 }
      ]
      expect(() => validateOrderPayments(payments, 100000)).toThrow(/Payment mismatch/)
    })

    it('rejects payments 1 paisa over', () => {
      const payments: OrderPayment[] = [
        { mode: 'cash', amountPaise: 100001 }
      ]
      expect(() => validateOrderPayments(payments, 100000)).toThrow(/Payment mismatch/)
    })

    it('rejects payments without at least one entry', () => {
      expect(() => validateOrderPayments([], 100000)).toThrow(/At least one payment entry is required/)
    })

    it('requires metal, weightMg, and purity for old_metal mode', () => {
      // Missing metal
      expect(() =>
        validateOrderPayments(
          [{ mode: 'old_metal', amountPaise: 50000, weightMg: 5000, purity: '916' }],
          50000
        )
      ).toThrow(/requires metal/)

      // Missing weightMg
      expect(() =>
        validateOrderPayments(
          [{ mode: 'old_metal', amountPaise: 50000, metal: 'Gold', purity: '916' }],
          50000
        )
      ).toThrow(/requires weightMg/)

      // Non-integer or negative weightMg
      expect(() =>
        validateOrderPayments(
          [{ mode: 'old_metal', amountPaise: 50000, metal: 'Gold', weightMg: -100, purity: '916' }],
          50000
        )
      ).toThrow(/requires weightMg as a positive integer/)

      // Missing purity
      expect(() =>
        validateOrderPayments(
          [{ mode: 'old_metal', amountPaise: 50000, metal: 'Gold', weightMg: 5000 }],
          50000
        )
      ).toThrow(/requires a non-empty purity string/)

      // Valid old_metal payment
      expect(() =>
        validateOrderPayments(
          [{ mode: 'old_metal', amountPaise: 50000, metal: 'Gold', weightMg: 5000, purity: '916' }],
          50000
        )
      ).not.toThrow()
    })
  })

  describe('Multi-Line Inventory Stock Validation (Atomic Rollback Safety)', () => {
    const mockGoldCoin: Product = {
      id: 'prod_gold_coin',
      name: '10g Gold Coin',
      category: 'Bullions',
      metal: 'Gold',
      sku: 'GC-10G',
      stock: 5,
      stockByLocation: { loc_vault: 5 },
      weight: 10,
      weightMg: 10000,
      purity: '999'
    }

    const mockSilverBar: Product = {
      id: 'prod_silver_bar',
      name: '100g Silver Bar',
      category: 'Bullions',
      metal: 'Silver',
      sku: 'SB-100G',
      stock: 2,
      stockByLocation: { loc_vault: 2 },
      weight: 100,
      weightMg: 100000,
      purity: '999'
    }

    const mockGoldRing: Product = {
      id: 'prod_gold_ring',
      name: 'Gold Ring',
      category: 'Bullions',
      metal: 'Gold',
      sku: 'GR-5G',
      stock: 1, // Only 1 in stock!
      stockByLocation: { loc_vault: 1 },
      weight: 5,
      weightMg: 5000,
      purity: '916'
    }

    const mockGoldChain: Product = {
      id: 'prod_gold_chain',
      name: 'Gold Chain',
      category: 'Bullions',
      metal: 'Gold',
      sku: 'GC-20G',
      stock: 10,
      stockByLocation: { loc_vault: 10 },
      weight: 20,
      weightMg: 20000,
      purity: '916'
    }

    it('fails immediately and commits nothing if line 3 of a 4-line order is out of stock', () => {
      const productsMap = new Map<string, Product>([
        [mockGoldCoin.id, mockGoldCoin],
        [mockSilverBar.id, mockSilverBar],
        [mockGoldRing.id, mockGoldRing],
        [mockGoldChain.id, mockGoldChain]
      ])

      const fourLines: OrderLineStockInput[] = [
        { productId: mockGoldCoin.id, qty: 1, unitPricePaise: 7500000 },
        { productId: mockSilverBar.id, qty: 1, unitPricePaise: 950000 },
        { productId: mockGoldRing.id, qty: 3, unitPricePaise: 3500000 }, // Line 3: Requested 3, but only 1 available!
        { productId: mockGoldChain.id, qty: 1, unitPricePaise: 14000000 }
      ]

      expect(() =>
        executeOrderLinesStockUpdate({
          lines: fourLines,
          productsMap,
          locationId: 'loc_vault',
          locationName: 'Main Vault',
          type: 'sale'
        })
      ).toThrow(/Insufficient stock at Main Vault. Available: 1, Requested: 3/)
    })

    it('stages valid stock updates and computes totals correctly across multiple lines', () => {
      const productsMap = new Map<string, Product>([
        [mockGoldCoin.id, mockGoldCoin],
        [mockSilverBar.id, mockSilverBar]
      ])

      const validLines: OrderLineStockInput[] = [
        { productId: mockGoldCoin.id, qty: 2, unitPricePaise: 7500000 }, // 150,000 INR
        { productId: mockSilverBar.id, qty: 1, unitPricePaise: 950000 } // 9,500 INR
      ]

      const result = executeOrderLinesStockUpdate({
        lines: validLines,
        productsMap,
        locationId: 'loc_vault',
        locationName: 'Main Vault',
        type: 'sale'
      })

      expect(result.totals.amountPaise).toBe(15950000)
      expect(result.totals.units).toBe(3)
      expect(result.totals.weightMg.Gold).toBe(20000) // 2 * 10,000mg
      expect(result.totals.weightMg.Silver).toBe(100000) // 1 * 100,000mg

      // Verify stock update for Gold Coin (from 5 to 3)
      const coinUpdate = result.productUpdates.get(mockGoldCoin.id)
      expect(coinUpdate?.stock).toBe(3)
      expect((coinUpdate?.stockByLocation as Record<string, number>)?.loc_vault).toBe(3)

      // Verify stock update for Silver Bar (from 2 to 1)
      const barUpdate = result.productUpdates.get(mockSilverBar.id)
      expect(barUpdate?.stock).toBe(1)
      expect((barUpdate?.stockByLocation as Record<string, number>)?.loc_vault).toBe(1)
    })
  })

  describe('Comprehensive Zero-Balance CRM Purge', () => {
    it('purges orders, visits, customers, customer_mobiles, customer_pans, and counters', async () => {
      // Mock Firestore collections and batch delete
      const deletedDocPaths: string[] = []
      const fakeBatch = {
        delete: vi.fn((ref: { path: string }) => {
          deletedDocPaths.push(ref.path)
        }),
        commit: vi.fn(async () => {})
      }

      vi.spyOn(adminDb, 'batch').mockReturnValue(fakeBatch as unknown as FirebaseFirestore.WriteBatch)

      // Mock collection queries
      const mockOrdersSnap = {
        empty: false,
        size: 2,
        docs: [
          { ref: { path: 'orders/order_1', delete: vi.fn() } },
          { ref: { path: 'orders/order_2', delete: vi.fn() } }
        ]
      }

      const mockVisitsSnap = {
        empty: false,
        size: 1,
        docs: [{ ref: { path: 'visits/visit_1', delete: vi.fn() } }]
      }

      const mockCustomersSnap = {
        empty: false,
        size: 1,
        docs: [
          {
            ref: {
              path: 'customers/cust_1',
              delete: vi.fn(async () => {
                deletedDocPaths.push('customers/cust_1')
              }),
              collection: vi.fn(() => ({
                get: vi.fn(async () => ({
                  empty: false,
                  docs: [{ ref: { path: 'customers/cust_1/private/pan' } }]
                }))
              }))
            }
          }
        ]
      }

      const mockMobilesSnap = {
        empty: false,
        size: 1,
        docs: [{ ref: { path: 'customer_mobiles/+919876543210' } }]
      }

      const mockPansSnap = {
        empty: false,
        size: 1,
        docs: [{ ref: { path: 'customer_pans/hash_abc' } }]
      }

      const mockCountersSnap = {
        empty: false,
        size: 1,
        docs: [{ ref: { path: 'counters/2026' } }]
      }

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        if (colName === 'orders') {
          return {
            where: vi.fn().mockReturnThis(),
            get: vi.fn(async () => mockOrdersSnap)
          } as unknown as FirebaseFirestore.CollectionReference
        }
        if (colName === 'visits') {
          return {
            where: vi.fn().mockReturnThis(),
            get: vi.fn(async () => mockVisitsSnap)
          } as unknown as FirebaseFirestore.CollectionReference
        }
        if (colName === 'customers') {
          return {
            get: vi.fn(async () => mockCustomersSnap)
          } as unknown as FirebaseFirestore.CollectionReference
        }
        if (colName === 'customer_mobiles') {
          return {
            get: vi.fn(async () => mockMobilesSnap)
          } as unknown as FirebaseFirestore.CollectionReference
        }
        if (colName === 'customer_pans') {
          return {
            get: vi.fn(async () => mockPansSnap)
          } as unknown as FirebaseFirestore.CollectionReference
        }
        if (colName === 'counters') {
          return {
            get: vi.fn(async () => mockCountersSnap)
          } as unknown as FirebaseFirestore.CollectionReference
        }
        return {
          get: vi.fn(async () => ({ empty: true, docs: [] }))
        } as unknown as FirebaseFirestore.CollectionReference
      })

      const stats = await purgeCrmDataServer('2026-03-31')

      expect(stats.purgedOrders).toBe(2)
      expect(stats.purgedVisits).toBe(1)
      expect(stats.purgedCustomers).toBe(1)
      expect(stats.purgedMobiles).toBe(1)
      expect(stats.purgedPans).toBe(1)
      expect(stats.resetCounters).toBe(1)

      // Verified that customer private subcollection doc was purged
      expect(deletedDocPaths).toContain('customers/cust_1/private/pan')
      // Verified that customer doc itself was deleted
      expect(deletedDocPaths).toContain('customers/cust_1')
      // Verified that indexes were purged
      expect(deletedDocPaths).toContain('customer_mobiles/+919876543210')
      expect(deletedDocPaths).toContain('customer_pans/hash_abc')
      // Verified that counters were reset
      expect(deletedDocPaths).toContain('counters/2026')
    })
  })

  describe('createOrder and reverseOrder Transactional Workflows', () => {
    it('executes createOrder and updates customer stats, counters, and visits', async () => {
      const mockCustomer: Customer = {
        id: 'cust_aman',
        firstName: 'Aman',
        lastName: 'Jhawar',
        displayName: 'Aman Jhawar',
        mobile: { countryCode: '+91', number: '9876543210', e164: '+919876543210' },
        hasPan: false,
        source: 'walk_in',
        inquiryIds: [],
        searchTerms: [],
        isArchived: false,
        createdAt: '2026-04-01T00:00:00.000Z',
        createdBy: 'admin',
        updatedAt: '2026-04-01T00:00:00.000Z',
        updatedBy: 'admin',
        stats: {
          visitCount: 0,
          orderCount: 0,
          lifetimeValuePaise: 0,
          lifetimeWeightMg: { Gold: 0, Silver: 0 },
          openFollowUps: 0
        }
      }

      const mockProduct: Product = {
        id: 'prod_gold_coin',
        name: '10g Gold Coin',
        category: 'Bullions',
        metal: 'Gold',
        sku: 'GC-10G',
        stock: 5,
        stockByLocation: { loc_vault: 5 },
        weight: 10,
        weightMg: 10000,
        purity: '999'
      }

      let writtenVisit: any = null
      let updatedCustomerStats: any = null

      const fakeTransaction = {
        get: vi.fn(async (ref: { path: string }) => {
          if (ref.path === 'system/zero_balance_lock') {
            return { exists: false, data: () => ({ isLocked: false }) }
          }
          if (ref.path === 'locations/loc_vault') {
            return { exists: true, data: () => ({ name: 'Main Vault' }) }
          }
          if (ref.path === 'customers/cust_aman') {
            return { exists: true, id: 'cust_aman', data: () => mockCustomer }
          }
          if (ref.path === 'counters/2026') {
            return { exists: true, data: () => ({ nextOrderNo: 1 }) }
          }
          if (ref.path === 'products/prod_gold_coin') {
            return { exists: true, id: 'prod_gold_coin', data: () => mockProduct }
          }
          return { exists: false }
        }),
        set: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
          if (ref.path.startsWith('visits/')) writtenVisit = data
        }),
        update: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
          if (ref.path === 'customers/cust_aman') updatedCustomerStats = data.stats as Record<string, unknown>
        })
      }

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({ id: id || 'mock_doc', path: `${colName}/${id || 'mock_doc'}` }),
          add: vi.fn(async () => ({ id: 'mock_add_id' }))
        } as unknown as FirebaseFirestore.CollectionReference
      })

      vi.spyOn(adminDb, 'runTransaction').mockImplementation(async (cb: unknown) => {
        return (cb as (t: unknown) => Promise<unknown>)(fakeTransaction)
      })

      const order = await createOrder({
        type: 'sale',
        customerId: 'cust_aman',
        locationId: 'loc_vault',
        date: '2026-05-15',
        lines: [{ productId: 'prod_gold_coin', qty: 2, unitPricePaise: 7500000 }],
        payments: [{ mode: 'cash', amountPaise: 15000000 }],
        caller: { callerUid: 'admin_1', callerName: 'Admin', callerEmail: 'admin@a96.com' }
      })

      expect(order.orderNo).toBe('A96-2026-000001')
      expect(order.totals.amountPaise).toBe(15000000)
      expect(order.totals.weightMg.Gold).toBe(20000)
      expect(writtenVisit).toBeDefined()
      expect(writtenVisit?.kind).toBe('purchase')
      expect(updatedCustomerStats?.orderCount).toBe(1)
      expect(updatedCustomerStats?.visitCount).toBe(1)
      expect(updatedCustomerStats?.lifetimeValuePaise).toBe(15000000)
    })

    it('executes reverseOrder and restores customer stats and marks order reversed', async () => {
      const mockCustomer: Customer = {
        id: 'cust_aman',
        firstName: 'Aman',
        lastName: 'Jhawar',
        displayName: 'Aman Jhawar',
        mobile: { countryCode: '+91', number: '9876543210', e164: '+919876543210' },
        hasPan: false,
        source: 'walk_in',
        inquiryIds: [],
        searchTerms: [],
        isArchived: false,
        createdAt: '2026-04-01T00:00:00.000Z',
        createdBy: 'admin',
        updatedAt: '2026-04-01T00:00:00.000Z',
        updatedBy: 'admin',
        stats: {
          visitCount: 1,
          orderCount: 1,
          lifetimeValuePaise: 15000000,
          lifetimeWeightMg: { Gold: 20000, Silver: 0 },
          openFollowUps: 0
        }
      }

      const mockExistingOrder = {
        id: 'order_1',
        orderNo: 'A96-2026-000001',
        type: 'sale',
        customerId: 'cust_aman',
        locationId: 'loc_vault',
        locationName: 'Main Vault',
        date: '2026-05-15',
        isReversed: false,
        lines: [
          {
            transactionId: 'tx_1',
            productId: 'prod_gold_coin',
            productName: '10g Gold Coin',
            metal: 'Gold',
            category: 'Bullions',
            qty: 2,
            unitPricePaise: 7500000,
            lineTotalPaise: 15000000
          }
        ],
        totals: {
          amountPaise: 15000000,
          units: 2,
          weightMg: { Gold: 20000, Silver: 0 }
        }
      }

      const mockTx = {
        id: 'tx_1',
        type: 'sale',
        quantity: 2,
        locationId: 'loc_vault',
        locationName: 'Main Vault',
        isReversed: false
      }

      const mockProduct: Product = {
        id: 'prod_gold_coin',
        name: '10g Gold Coin',
        category: 'Bullions',
        metal: 'Gold',
        sku: 'GC-10G',
        stock: 3,
        stockByLocation: { loc_vault: 3 },
        weight: 10,
        weightMg: 10000,
        purity: '999'
      }

      let restoredCustomerStats: any = null
      let restoredProductUpdates: any = null

      const fakeTransaction = {
        get: vi.fn(async (ref: { path: string }) => {
          if (ref.path === 'system/zero_balance_lock') {
            return { exists: false, data: () => ({ isLocked: false }) }
          }
          if (ref.path === 'orders/order_1') {
            return { exists: true, id: 'order_1', data: () => mockExistingOrder }
          }
          if (ref.path === 'customers/cust_aman') {
            return { exists: true, id: 'cust_aman', data: () => mockCustomer }
          }
          if (ref.path === 'transactions/tx_1') {
            return { exists: true, id: 'tx_1', data: () => mockTx }
          }
          if (ref.path === 'products/prod_gold_coin') {
            return { exists: true, id: 'prod_gold_coin', data: () => mockProduct }
          }
          return { exists: false }
        }),
        set: vi.fn(),
        update: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
          if (ref.path === 'customers/cust_aman') restoredCustomerStats = data.stats as Record<string, unknown>
          if (ref.path === 'products/prod_gold_coin') restoredProductUpdates = data
        })
      }

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({ id: id || 'mock_doc', path: `${colName}/${id || 'mock_doc'}` }),
          add: vi.fn(async () => ({ id: 'mock_add_id' }))
        } as unknown as FirebaseFirestore.CollectionReference
      })

      vi.spyOn(adminDb, 'runTransaction').mockImplementation(async (cb: unknown) => {
        return (cb as (t: unknown) => Promise<unknown>)(fakeTransaction)
      })

      const reversed = await reverseOrder({
        orderId: 'order_1',
        caller: { callerUid: 'admin_1', callerName: 'Admin', callerEmail: 'admin@a96.com' }
      })

      expect(reversed.isReversed).toBe(true)
      expect(restoredCustomerStats?.orderCount).toBe(0)
      expect(restoredCustomerStats?.lifetimeValuePaise).toBe(0)
      // Stock restored from 3 back to 5
      expect(restoredProductUpdates?.stock).toBe(5)
    })
  })
})
