import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  getIndianFiscalYear,
  validateOrderPayments,
  createOrder,
  reverseOrder,
  ValidationError
} from '@/lib/server/orders'
import {
  executeOrderLinesStockUpdate,
  OrderLineStockInput
} from '@/lib/server/ledger'
import { purgeArchivedOrdersServer } from '@/lib/server/archive'
import { computeArchiveChecksum, verifyArchiveIntegrity } from '@/lib/utils/archive-checksum'
import { NextRequest } from 'next/server'
import { Product, OrderPayment, Customer } from '@/lib/types'
import { adminDb } from '@/lib/firebase/admin'
import { SUPER_ADMIN_PERMISSIONS } from '@/lib/constants/permissions'

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

  describe('Zero-Balance Order Archiving & CRM Permanence', () => {
    it('(a) only the archived order IDs are deleted, and is safe to run twice on a resumed archive', async () => {
      const deletedDocPaths: string[] = []
      const fakeBatch = {
        delete: vi.fn((ref: { path: string }) => {
          deletedDocPaths.push(ref.path)
        }),
        commit: vi.fn(async () => {})
      }

      vi.spyOn(adminDb, 'batch').mockReturnValue(fakeBatch as unknown as FirebaseFirestore.WriteBatch)
      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id: string) => ({ id, path: `${colName}/${id}` })
        } as unknown as FirebaseFirestore.CollectionReference
      })

      const archivedOrderIds = ['ord_101', 'ord_102', 'ord_103']

      // First run
      const countRun1 = await purgeArchivedOrdersServer(archivedOrderIds)
      expect(countRun1).toBe(3)
      expect(deletedDocPaths).toEqual(['orders/ord_101', 'orders/ord_102', 'orders/ord_103'])

      // Second run (resumed archive: safe and idempotent)
      const countRun2 = await purgeArchivedOrdersServer(archivedOrderIds)
      expect(countRun2).toBe(3)
      expect(deletedDocPaths).toHaveLength(6)
      expect(deletedDocPaths.slice(3)).toEqual(['orders/ord_101', 'orders/ord_102', 'orders/ord_103'])

      // Empty or non-matching array does nothing
      const emptyCount = await purgeArchivedOrdersServer([])
      expect(emptyCount).toBe(0)
    })

    it('(b) customers, customer_mobiles, customer_pans, visits and counters are never touched', async () => {
      const deletedDocPaths: string[] = []
      const fakeBatch = {
        delete: vi.fn((ref: { path: string }) => {
          deletedDocPaths.push(ref.path)
        }),
        commit: vi.fn(async () => {})
      }

      vi.spyOn(adminDb, 'batch').mockReturnValue(fakeBatch as unknown as FirebaseFirestore.WriteBatch)
      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id: string) => ({ id, path: `${colName}/${id}` })
        } as unknown as FirebaseFirestore.CollectionReference
      })

      const orderIds = ['ord_archived_1', 'ord_archived_2']
      await purgeArchivedOrdersServer(orderIds)

      // Verified only orders were targeted for deletion
      expect(deletedDocPaths).toEqual(['orders/ord_archived_1', 'orders/ord_archived_2'])
      expect(deletedDocPaths.some((p) => p.startsWith('customers/'))).toBe(false)
      expect(deletedDocPaths.some((p) => p.startsWith('customer_mobiles/'))).toBe(false)
      expect(deletedDocPaths.some((p) => p.startsWith('customer_pans/'))).toBe(false)
      expect(deletedDocPaths.some((p) => p.startsWith('visits/'))).toBe(false)
      expect(deletedDocPaths.some((p) => p.startsWith('counters/'))).toBe(false)
    })

    it('(c) tampering with an archived bill fails the checksum, and an older v1.4 archive still verifies', async () => {
      // 1. Build a valid v1.5 archive payload with checksumScope: 'v2-orders'
      const v15Archive = {
        cutoffDate: '2026-03-31',
        openingDate: '2026-04-01',
        totalTransactions: 1,
        totalAuditLogs: 1,
        checksumScope: 'v2-orders',
        transactions: [{ id: 'tx_1', type: 'sale', quantity: 1 }],
        auditLogs: [{ id: 'aud_1', action: 'sale' }],
        productsSnapshot: [{ id: 'prod_1', stock: 10 }],
        ordersSnapshot: [
          {
            id: 'ord_1',
            orderNo: 'A96-2026-000001',
            date: '2026-03-15',
            customerName: 'Aman Jhawar',
            totals: { amountPaise: 500000 }
          }
        ]
      }

      const validV15Checksum = await computeArchiveChecksum(v15Archive)
      const v15File = {
        ...v15Archive,
        version: '1.5',
        checksum: validV15Checksum
      }

      // Valid v1.5 verifies cleanly
      const verifyResult1 = await verifyArchiveIntegrity(v15File)
      expect(verifyResult1.status).toBe('verified')

      // Tampering with an archived bill in ordersSnapshot fails checksum
      const tamperedV15File = {
        ...v15File,
        ordersSnapshot: [
          {
            id: 'ord_1',
            orderNo: 'A96-2026-000001',
            date: '2026-03-15',
            customerName: 'Aman Jhawar',
            totals: { amountPaise: 9999999 } // Tampered amount
          }
        ]
      }
      const tamperedResult = await verifyArchiveIntegrity(tamperedV15File)
      expect(tamperedResult.status).toBe('tampered')

      // 2. Older v1.4 archive (no checksumScope or ordersSnapshot in checksum) still verifies
      const v14ArchiveData = {
        cutoffDate: '2026-03-31',
        openingDate: '2026-04-01',
        totalTransactions: 1,
        totalAuditLogs: 1,
        transactions: [{ id: 'tx_legacy_1', type: 'sale', quantity: 2 }],
        auditLogs: [{ id: 'aud_legacy_1', action: 'create' }],
        productsSnapshot: [{ id: 'prod_legacy_1', stock: 5 }]
      }
      const validV14Checksum = await computeArchiveChecksum(v14ArchiveData)
      const v14File = {
        ...v14ArchiveData,
        version: '1.4',
        checksum: validV14Checksum,
        // Even if v1.4 has an ordersSnapshot or extra metadata, older archives verify without error
        ordersSnapshot: [{ id: 'ord_legacy_1', orderNo: 'A96-2025-000001' }]
      }
      const verifyV14Result = await verifyArchiveIntegrity(v14File)
      expect(verifyV14Result.status).toBe('verified')
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
      expect(updatedCustomerStats?.firstVisitAt).toBe('2026-05-15')
      expect(updatedCustomerStats?.lastVisitAt).toBe('2026-05-15')
    })

    it('creates a sale order for a walk-in customer without customer document or visit record', async () => {
      const { createOrder } = await import('@/lib/server/orders')
      const { adminDb } = await import('@/lib/firebase/admin')

      const bullionProduct: Product = {
        id: 'prod_peacock_10g',
        name: '10g Peacock',
        category: 'Bullions',
        brand: 'Local',
        metal: 'Gold',
        stock: 10,
        stockByLocation: { loc_alipore: 10 },
        weight: 10,
        weightMg: 10000,
        price: 150900,
        isArchived: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }

      let writtenOrder: Record<string, unknown> | null = null
      let writtenTx: Record<string, unknown> | null = null
      let writtenVisit: Record<string, unknown> | null = null

      const fakeTransaction = {
        get: vi.fn(async (ref: { path: string }) => {
          if (ref.path === 'system_control/zero_balance_run_lock') {
            return { exists: false, data: () => null }
          }
          if (ref.path === 'locations/loc_alipore') {
            return { exists: true, data: () => ({ name: 'Alipore Office' }) }
          }
          if (ref.path === 'counters/2026') {
            return { exists: false, data: () => null }
          }
          if (ref.path === 'products/prod_peacock_10g') {
            return { exists: true, id: bullionProduct.id, data: () => ({ ...bullionProduct }) }
          }
          return { exists: false, data: () => null }
        }),
        set: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
          if (ref.path.startsWith('orders/')) writtenOrder = data
          if (ref.path.startsWith('transactions/')) writtenTx = data
          if (ref.path.startsWith('visits/')) writtenVisit = data
        }),
        update: vi.fn()
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
        locationId: 'loc_alipore',
        date: '2026-10-22',
        lines: [{ productId: 'prod_peacock_10g', qty: 10, unitPricePaise: 15090000 }],
        payments: [{ mode: 'cash', amountPaise: 150900000 }],
        caller: { callerUid: 'admin_1', callerName: 'Admin', callerEmail: 'admin@a96.com' }
      })

      expect(order.orderNo).toBe('A96-2026-000001')
      expect(order.customerId).toBeUndefined()
      expect(order.customerSnapshot).toBeUndefined()
      expect(order.totals.amountPaise).toBe(150900000)
      expect(order.totals.units).toBe(10)
      expect(order.totals.weightMg.Gold).toBe(100000)
      expect(writtenOrder).toBeDefined()
      expect(writtenOrder?.customerId).toBeUndefined()
      expect(writtenTx).toBeDefined()
      expect(writtenTx?.productName).toBe('10g Peacock')
      expect(writtenTx?.totalAmount).toBe(1509000)
      expect(writtenVisit).toBeNull() // No visit created for walk-in customer
    })

    it('sets firstVisitAt only if unset or earlier than bill date, and lastVisitAt = max(existing, bill date)', async () => {
      const { createOrder } = await import('@/lib/server/orders')
      const { adminDb } = await import('@/lib/firebase/admin')

      const existingCustomer: Customer = {
        id: 'cust_backdated',
        firstName: 'Pooja',
        lastName: 'Patel',
        displayName: 'Pooja Patel',
        mobile: { countryCode: '+91', number: '9876543211', e164: '+919876543211' },
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
          firstVisitAt: '2026-05-10',
          lastVisitAt: '2026-05-20',
          visitCount: 3,
          orderCount: 2,
          lifetimeValuePaise: 100000,
          lifetimeWeightMg: { Gold: 20000, Silver: 0 },
          openFollowUps: 0
        }
      }

      const mockProduct = {
        id: 'prod_gold_coin',
        name: 'Gold Coin 20g',
        sku: 'GC-20G',
        metal: 'Gold',
        category: 'coin',
        stock: 10,
        stockByLocation: { loc_vault: 10 },
        weightGrams: 20,
        weightMg: 20000,
        purity: '999'
      }

      let updatedStats: any = null
      const fakeTx = {
        get: vi.fn(async (ref: { path: string }) => {
          if (ref.path === 'system/zero_balance_lock') return { exists: false }
          if (ref.path === 'locations/loc_vault') return { exists: true, data: () => ({ name: 'Main Vault' }) }
          if (ref.path === 'customers/cust_backdated') return { exists: true, id: 'cust_backdated', data: () => existingCustomer }
          if (ref.path === 'counters/2026') return { exists: true, data: () => ({ nextOrderNo: 2 }) }
          if (ref.path === 'products/prod_gold_coin') return { exists: true, id: 'prod_gold_coin', data: () => mockProduct }
          return { exists: false }
        }),
        set: vi.fn(),
        update: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
          if (ref.path === 'customers/cust_backdated') updatedStats = data.stats
        })
      }

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({ id: id || 'mock_doc', path: `${colName}/${id || 'mock_doc'}` }),
          add: vi.fn(async () => ({ id: 'mock_add_id' }))
        } as unknown as FirebaseFirestore.CollectionReference
      })
      vi.spyOn(adminDb, 'runTransaction').mockImplementation(async (cb: unknown) => {
        return (cb as (t: unknown) => Promise<unknown>)(fakeTx)
      })

      // 1. Backdated order (e.g. 2026-05-01): moves firstVisitAt earlier, but does NOT move lastVisitAt backwards
      await createOrder({
        type: 'sale',
        customerId: 'cust_backdated',
        locationId: 'loc_vault',
        date: '2026-05-01',
        lines: [{ productId: 'prod_gold_coin', qty: 1, unitPricePaise: 7500000 }],
        payments: [{ mode: 'cash', amountPaise: 7500000 }],
        caller: { callerUid: 'admin_1', callerName: 'Admin', callerEmail: 'admin@a96.com' }
      })

      expect(updatedStats?.firstVisitAt).toBe('2026-05-01') // moved back because 2026-05-01 < 2026-05-10
      expect(updatedStats?.lastVisitAt).toBe('2026-05-20') // preserved because max('2026-05-20', '2026-05-01')

      // 2. Future/newer order (e.g. 2026-05-28): moves lastVisitAt forward, firstVisitAt untouched
      existingCustomer.stats.firstVisitAt = '2026-05-01'
      existingCustomer.stats.lastVisitAt = '2026-05-20'
      await createOrder({
        type: 'sale',
        customerId: 'cust_backdated',
        locationId: 'loc_vault',
        date: '2026-05-28',
        lines: [{ productId: 'prod_gold_coin', qty: 1, unitPricePaise: 7500000 }],
        payments: [{ mode: 'cash', amountPaise: 7500000 }],
        caller: { callerUid: 'admin_1', callerName: 'Admin', callerEmail: 'admin@a96.com' }
      })

      expect(updatedStats?.firstVisitAt).toBe('2026-05-01')
      expect(updatedStats?.lastVisitAt).toBe('2026-05-28')
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

    it('refuses to reverse an order bill whose line was already reversed', async () => {
      const mockExistingOrder = {
        id: 'order_already_partially_reversed',
        orderNo: 'A96-2026-000002',
        type: 'sale',
        date: '2026-04-10',
        locationId: 'loc_vault',
        locationName: 'Main Vault',
        isReversed: false,
        lines: [
          {
            transactionId: 'tx_already_reversed_1',
            productId: 'prod_gold_coin',
            productName: '10g Gold Coin',
            metal: 'Gold',
            category: 'Bullions',
            qty: 1,
            unitPricePaise: 7500000,
            lineTotalPaise: 7500000
          }
        ],
        totals: {
          amountPaise: 7500000,
          units: 1,
          weightMg: { Gold: 10000, Silver: 0 }
        }
      }

      const mockAlreadyReversedTx = {
        id: 'tx_already_reversed_1',
        type: 'sale',
        orderId: 'order_already_partially_reversed',
        orderNo: 'A96-2026-000002',
        quantity: 1,
        locationId: 'loc_vault',
        isReversed: true
      }

      const fakeTransaction = {
        get: vi.fn(async (ref: { path: string }) => {
          if (ref.path === 'system/zero_balance_lock') {
            return { exists: false, data: () => ({ isLocked: false }) }
          }
          if (ref.path === 'orders/order_already_partially_reversed') {
            return { exists: true, id: 'order_already_partially_reversed', data: () => mockExistingOrder }
          }
          if (ref.path === 'transactions/tx_already_reversed_1') {
            return { exists: true, id: 'tx_already_reversed_1', data: () => mockAlreadyReversedTx }
          }
          return { exists: false }
        }),
        set: vi.fn(),
        update: vi.fn()
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

      await expect(
        reverseOrder({
          orderId: 'order_already_partially_reversed',
          caller: { callerUid: 'admin_1', callerName: 'Admin', callerEmail: 'admin@a96.com' }
        })
      ).rejects.toThrow(
        'Cannot reverse order "A96-2026-000002": line item transaction "tx_already_reversed_1" has already been reversed.'
      )
    })

    it('rejects with 400 "This bill is from a closed period and cannot be reversed" when line transaction no longer exists because it was archived', async () => {
      const mockOrderWithMissingTx = {
        id: 'order_closed_period',
        orderNo: 'A96-2026-000003',
        type: 'sale',
        locationId: 'loc_vault',
        date: '2026-05-15',
        isReversed: false,
        lines: [
          {
            transactionId: 'tx_archived_and_purged',
            productId: 'prod_gold_coin',
            qty: 1,
            unitPricePaise: 7500000,
            lineTotalPaise: 7500000
          }
        ],
        totals: {
          amountPaise: 7500000,
          units: 1,
          weightMg: { Gold: 10000, Silver: 0 }
        }
      }

      const fakeTransaction = {
        get: vi.fn(async (ref: { path: string }) => {
          if (ref.path === 'system/zero_balance_lock') {
            return { exists: false, data: () => ({ isLocked: false }) }
          }
          if (ref.path === 'orders/order_closed_period') {
            return { exists: true, id: 'order_closed_period', data: () => mockOrderWithMissingTx }
          }
          if (ref.path === 'transactions/tx_archived_and_purged') {
            // Transaction no longer exists because it was purged during Zero Balance
            return { exists: false }
          }
          return { exists: false }
        }),
        set: vi.fn(),
        update: vi.fn()
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

      await expect(
        reverseOrder({
          orderId: 'order_closed_period',
          caller: { callerUid: 'admin_1', callerName: 'Admin', callerEmail: 'admin@a96.com' }
        })
      ).rejects.toThrowError(ValidationError)
      await expect(
        reverseOrder({
          orderId: 'order_closed_period',
          caller: { callerUid: 'admin_1', callerName: 'Admin', callerEmail: 'admin@a96.com' }
        })
      ).rejects.toThrow('This bill is from a closed period and cannot be reversed')

      // Also verify that reverse API route maps this ValidationError to HTTP 400
      const { POST: reverseRouteHandler } = await import('@/app/api/admin/orders/[id]/reverse/route')
      const serverAuth = await import('@/lib/firebase/server-auth')

      vi.spyOn(serverAuth, 'getAuthenticatedCaller').mockResolvedValue({
        ok: true,
        caller: {
          callerUid: 'admin_1',
          callerName: 'Admin',
          callerEmail: 'admin@a96.com',
          callerData: { email: 'admin@a96.com', displayName: 'Admin', role: 'super_admin', status: 'active' },
          isSuperAdmin: true,
          callerPermissions: { ...SUPER_ADMIN_PERMISSIONS },
          decodedToken: {} as any
        }
      })

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        if (colName === 'orders') {
          return {
            doc: (id?: string) => ({
              id: id || 'mock_order_doc',
              path: `orders/${id || 'mock_order_doc'}`,
              get: vi.fn(async () => ({
                exists: true,
                data: () => mockOrderWithMissingTx
              }))
            })
          } as unknown as FirebaseFirestore.CollectionReference
        }
        return {
          doc: (id?: string) => ({ id: id || 'mock_doc', path: `${colName}/${id || 'mock_doc'}` }),
          add: vi.fn(async () => ({ id: 'mock_add_id' }))
        } as unknown as FirebaseFirestore.CollectionReference
      })

      const req = new NextRequest('http://localhost:3000/api/admin/orders/order_closed_period/reverse', {
        method: 'POST'
      })
      const res = await reverseRouteHandler(req, { params: Promise.resolve({ id: 'order_closed_period' }) })
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('This bill is from a closed period and cannot be reversed')
    })

    it('refuses to reverse an individual transaction line belonging to a bill via DELETE /api/admin/transactions', async () => {
      const { DELETE } = await import('@/app/api/admin/transactions/route')
      const serverAuth = await import('@/lib/firebase/server-auth')

      vi.spyOn(serverAuth, 'getAuthenticatedCaller').mockResolvedValue({
        ok: true,
        caller: {
          callerUid: 'super_admin_1',
          callerName: 'Super Admin',
          callerEmail: 'admin@a96.com',
          callerData: { email: 'admin@a96.com', displayName: 'Super Admin', role: 'super_admin', status: 'active' },
          isSuperAdmin: true,
          callerPermissions: { ...SUPER_ADMIN_PERMISSIONS },
          decodedToken: {}
        }
      })

      const mockBillLineTx = {
        id: 'tx_bill_line_1',
        type: 'sale',
        orderId: 'order_100',
        orderNo: 'A96-2026-000100',
        productId: 'prod_gold_coin',
        quantity: 1,
        isReversed: false
      }

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({
            id: id || 'mock_doc',
            path: `${colName}/${id || 'mock_doc'}`,
            get: vi.fn(async () => {
              if (id === 'tx_bill_line_1') {
                return { exists: true, id, data: () => mockBillLineTx }
              }
              return { exists: false }
            })
          })
        } as unknown as FirebaseFirestore.CollectionReference
      })

      const req = new NextRequest('http://localhost:3000/api/admin/transactions?id=tx_bill_line_1', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer mock_token' }
      })

      const res = await DELETE(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('This line belongs to bill A96-2026-000100; reverse the whole bill')
    })

    it('refuses to edit an individual transaction line belonging to a bill via PATCH /api/admin/transactions', async () => {
      const { PATCH } = await import('@/app/api/admin/transactions/route')
      const serverAuth = await import('@/lib/firebase/server-auth')

      vi.spyOn(serverAuth, 'getAuthenticatedCaller').mockResolvedValue({
        ok: true,
        caller: {
          callerUid: 'super_admin_1',
          callerName: 'Super Admin',
          callerEmail: 'admin@a96.com',
          callerData: { email: 'admin@a96.com', displayName: 'Super Admin', role: 'super_admin', status: 'active' },
          isSuperAdmin: true,
          callerPermissions: { ...SUPER_ADMIN_PERMISSIONS },
          decodedToken: {}
        }
      })

      const mockBillLineTx = {
        id: 'tx_bill_line_2',
        type: 'sale',
        orderId: 'order_200',
        orderNo: 'A96-2026-000200',
        productId: 'prod_gold_coin',
        quantity: 1,
        price: 5000,
        isReversed: false
      }

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({
            id: id || 'mock_doc',
            path: `${colName}/${id || 'mock_doc'}`,
            get: vi.fn(async () => {
              if (id === 'tx_bill_line_2') {
                return { exists: true, id, data: () => mockBillLineTx }
              }
              return { exists: false }
            })
          })
        } as unknown as FirebaseFirestore.CollectionReference
      })

      const req = new NextRequest('http://localhost:3000/api/admin/transactions', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer mock_token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'tx_bill_line_2', price: 6000 })
      })

      const res = await PATCH(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('This line belongs to bill A96-2026-000200; reverse the whole bill')
    })

    it('prevents double-click reversal when latest transaction in runTransaction is already reversed', async () => {
      const { DELETE } = await import('@/app/api/admin/transactions/route')
      const serverAuth = await import('@/lib/firebase/server-auth')

      vi.spyOn(serverAuth, 'getAuthenticatedCaller').mockResolvedValue({
        ok: true,
        caller: {
          callerUid: 'super_admin_1',
          callerName: 'Super Admin',
          callerEmail: 'admin@a96.com',
          callerData: { email: 'admin@a96.com', displayName: 'Super Admin', role: 'super_admin', status: 'active' },
          isSuperAdmin: true,
          callerPermissions: { ...SUPER_ADMIN_PERMISSIONS },
          decodedToken: {}
        }
      })

      const initialTx = {
        id: 'tx_double_click',
        type: 'sale',
        productId: 'prod_gold_coin',
        quantity: 1,
        isReversed: false
      }

      const concurrentReversedTx = {
        ...initialTx,
        isReversed: true
      }

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({
            id: id || 'mock_doc',
            path: `${colName}/${id || 'mock_doc'}`,
            get: vi.fn(async () => ({ exists: true, id, data: () => initialTx }))
          })
        } as unknown as FirebaseFirestore.CollectionReference
      })

      const fakeTransaction = {
        get: vi.fn(async (ref: { path: string }) => {
          if (ref.path === 'transactions/tx_double_click') {
            return { exists: true, id: 'tx_double_click', data: () => concurrentReversedTx }
          }
          return { exists: false }
        })
      }

      vi.spyOn(adminDb, 'runTransaction').mockImplementation(async (cb: unknown) => {
        return (cb as (t: unknown) => Promise<unknown>)(fakeTransaction)
      })

      const req = new NextRequest('http://localhost:3000/api/admin/transactions?id=tx_double_click', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer mock_token' }
      })

      const res = await DELETE(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('This transaction has already been reversed')
    })
  })

  describe('Orders API Rules & Guards (Location, Fiscal Cutoff, Future Dates, GET Filters, Error Classes)', () => {
    beforeEach(async () => {
      const systemLock = await import('@/lib/server/system-lock')
      vi.spyOn(systemLock, 'getClosedFiscalCutoff').mockResolvedValue(null)
    })

    it('Rule 1: Staff with assignedLocationId can only bill at their assigned location (POST /api/admin/orders)', async () => {
      const { POST } = await import('@/app/api/admin/orders/route')
      const serverAuth = await import('@/lib/firebase/server-auth')

      vi.spyOn(serverAuth, 'getAuthenticatedCaller').mockResolvedValue({
        ok: true,
        caller: {
          callerUid: 'staff_store_1',
          callerName: 'Store 1 Staff',
          callerEmail: 'staff1@a96.com',
          callerData: {
            email: 'staff1@a96.com',
            displayName: 'Store 1 Staff',
            role: 'sales_cashier',
            status: 'active',
            assignedLocationId: 'loc_store_1',
            assignedLocationName: 'Store 1'
          },
          isSuperAdmin: false,
          callerPermissions: { ...SUPER_ADMIN_PERMISSIONS },
          decodedToken: {}
        }
      })

      const body = {
        type: 'sale',
        locationId: 'loc_store_2',
        date: '2026-10-20',
        lines: [
          { productId: 'prod_gold_coin', qty: 1, unitPricePaise: 7500000 }
        ],
        payments: [
          { mode: 'cash', amountPaise: 7500000 }
        ]
      }

      const req = new NextRequest('http://localhost:3000/api/admin/orders', {
        method: 'POST',
        headers: { Authorization: 'Bearer mock_token', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const res = await POST(req)
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toContain('You are assigned to Store 1 and cannot record sale transactions at a different location.')
    })

    it('Rule 1: Staff with assignedLocationId can only reverse orders at their assigned location (POST /api/admin/orders/[id]/reverse)', async () => {
      const { POST } = await import('@/app/api/admin/orders/[id]/reverse/route')
      const serverAuth = await import('@/lib/firebase/server-auth')

      vi.spyOn(serverAuth, 'getAuthenticatedCaller').mockResolvedValue({
        ok: true,
        caller: {
          callerUid: 'staff_store_1',
          callerName: 'Store 1 Staff',
          callerEmail: 'staff1@a96.com',
          callerData: {
            email: 'staff1@a96.com',
            displayName: 'Store 1 Staff',
            role: 'sales_cashier',
            status: 'active',
            assignedLocationId: 'loc_store_1',
            assignedLocationName: 'Store 1'
          },
          isSuperAdmin: false,
          callerPermissions: { ...SUPER_ADMIN_PERMISSIONS },
          decodedToken: {}
        }
      })

      const mockOrderAtStore2 = {
        id: 'order_store_2_bill',
        orderNo: 'A96-2026-000500',
        type: 'sale',
        locationId: 'loc_store_2',
        date: '2026-10-20',
        isReversed: false
      }

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({
            id: id || 'mock_doc',
            path: `${colName}/${id || 'mock_doc'}`,
            get: vi.fn(async () => {
              if (id === 'order_store_2_bill') {
                return { exists: true, id, data: () => mockOrderAtStore2 }
              }
              return { exists: false }
            })
          })
        } as unknown as FirebaseFirestore.CollectionReference
      })

      const req = new NextRequest('http://localhost:3000/api/admin/orders/order_store_2_bill/reverse', {
        method: 'POST',
        headers: { Authorization: 'Bearer mock_token' }
      })

      const res = await POST(req, { params: Promise.resolve({ id: 'order_store_2_bill' }) })
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toContain('You are assigned to Store 1 and cannot reverse orders from a different location.')
    })

    it('Rule 2: Reject orders dated on or before getClosedFiscalCutoff() (POST /api/admin/orders)', async () => {
      const { POST } = await import('@/app/api/admin/orders/route')
      const serverAuth = await import('@/lib/firebase/server-auth')
      const systemLock = await import('@/lib/server/system-lock')

      vi.spyOn(serverAuth, 'getAuthenticatedCaller').mockResolvedValue({
        ok: true,
        caller: {
          callerUid: 'super_admin_1',
          callerName: 'Super Admin',
          callerEmail: 'admin@a96.com',
          callerData: { email: 'admin@a96.com', displayName: 'Super Admin', role: 'super_admin', status: 'active' },
          isSuperAdmin: true,
          callerPermissions: { ...SUPER_ADMIN_PERMISSIONS },
          decodedToken: {}
        }
      })

      vi.spyOn(systemLock, 'getClosedFiscalCutoff').mockResolvedValue('2026-03-31')

      const body = {
        type: 'sale',
        locationId: 'loc_main',
        date: '2026-03-31',
        lines: [
          { productId: 'prod_gold_coin', qty: 1, unitPricePaise: 7500000 }
        ],
        payments: [
          { mode: 'cash', amountPaise: 7500000 }
        ]
      }

      const req = new NextRequest('http://localhost:3000/api/admin/orders', {
        method: 'POST',
        headers: { Authorization: 'Bearer mock_token', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const res = await POST(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('Entries dated on or before 2026-03-31 are blocked.')
    })

    it('Rule 2: Reject reversing orders dated on or before getClosedFiscalCutoff() (POST /api/admin/orders/[id]/reverse)', async () => {
      const { POST } = await import('@/app/api/admin/orders/[id]/reverse/route')
      const serverAuth = await import('@/lib/firebase/server-auth')
      const systemLock = await import('@/lib/server/system-lock')

      vi.spyOn(serverAuth, 'getAuthenticatedCaller').mockResolvedValue({
        ok: true,
        caller: {
          callerUid: 'super_admin_1',
          callerName: 'Super Admin',
          callerEmail: 'admin@a96.com',
          callerData: { email: 'admin@a96.com', displayName: 'Super Admin', role: 'super_admin', status: 'active' },
          isSuperAdmin: true,
          callerPermissions: { ...SUPER_ADMIN_PERMISSIONS },
          decodedToken: {}
        }
      })

      vi.spyOn(systemLock, 'getClosedFiscalCutoff').mockResolvedValue('2026-03-31')

      const mockClosedOrder = {
        id: 'order_closed_fy',
        orderNo: 'A96-2025-000100',
        type: 'sale',
        locationId: 'loc_main',
        date: '2026-03-15',
        isReversed: false
      }

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({
            id: id || 'mock_doc',
            path: `${colName}/${id || 'mock_doc'}`,
            get: vi.fn(async () => {
              if (id === 'order_closed_fy') {
                return { exists: true, id, data: () => mockClosedOrder }
              }
              return { exists: false }
            })
          })
        } as unknown as FirebaseFirestore.CollectionReference
      })

      const req = new NextRequest('http://localhost:3000/api/admin/orders/order_closed_fy/reverse', {
        method: 'POST',
        headers: { Authorization: 'Bearer mock_token' }
      })

      const res = await POST(req, { params: Promise.resolve({ id: 'order_closed_fy' }) })
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('Cannot reverse order: It is dated on or before 2026-03-31.')
    })

    it('Rule 3: Reject future dates in IST when creating orders (POST /api/admin/orders)', async () => {
      const { POST } = await import('@/app/api/admin/orders/route')
      const serverAuth = await import('@/lib/firebase/server-auth')

      vi.spyOn(serverAuth, 'getAuthenticatedCaller').mockResolvedValue({
        ok: true,
        caller: {
          callerUid: 'super_admin_1',
          callerName: 'Super Admin',
          callerEmail: 'admin@a96.com',
          callerData: { email: 'admin@a96.com', displayName: 'Super Admin', role: 'super_admin', status: 'active' },
          isSuperAdmin: true,
          callerPermissions: { ...SUPER_ADMIN_PERMISSIONS },
          decodedToken: {}
        }
      })

      const body = {
        type: 'sale',
        locationId: 'loc_main',
        date: '2099-12-31',
        lines: [
          { productId: 'prod_gold_coin', qty: 1, unitPricePaise: 7500000 }
        ],
        payments: [
          { mode: 'cash', amountPaise: 7500000 }
        ]
      }

      const req = new NextRequest('http://localhost:3000/api/admin/orders', {
        method: 'POST',
        headers: { Authorization: 'Bearer mock_token', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const res = await POST(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('Order date cannot be in the future (2099-12-31)')
    })

    it('Rule 3: Reject reversing future-dated orders (POST /api/admin/orders/[id]/reverse)', async () => {
      const { POST } = await import('@/app/api/admin/orders/[id]/reverse/route')
      const serverAuth = await import('@/lib/firebase/server-auth')

      vi.spyOn(serverAuth, 'getAuthenticatedCaller').mockResolvedValue({
        ok: true,
        caller: {
          callerUid: 'super_admin_1',
          callerName: 'Super Admin',
          callerEmail: 'admin@a96.com',
          callerData: { email: 'admin@a96.com', displayName: 'Super Admin', role: 'super_admin', status: 'active' },
          isSuperAdmin: true,
          callerPermissions: { ...SUPER_ADMIN_PERMISSIONS },
          decodedToken: {}
        }
      })

      const mockFutureOrder = {
        id: 'order_future',
        orderNo: 'A96-2099-000001',
        type: 'sale',
        locationId: 'loc_main',
        date: '2099-12-31',
        isReversed: false
      }

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({
            id: id || 'mock_doc',
            path: `${colName}/${id || 'mock_doc'}`,
            get: vi.fn(async () => {
              if (id === 'order_future') {
                return { exists: true, id, data: () => mockFutureOrder }
              }
              return { exists: false }
            })
          })
        } as unknown as FirebaseFirestore.CollectionReference
      })

      const req = new NextRequest('http://localhost:3000/api/admin/orders/order_future/reverse', {
        method: 'POST',
        headers: { Authorization: 'Bearer mock_token' }
      })

      const res = await POST(req, { params: Promise.resolve({ id: 'order_future' }) })
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('Cannot reverse order: It is dated in the future (2099-12-31)')
    })

    it('GET /api/admin/orders forces locationId to caller assignedLocationId and accepts startDate/endDate', async () => {
      const { GET } = await import('@/app/api/admin/orders/route')
      const serverAuth = await import('@/lib/firebase/server-auth')
      const ordersModule = await import('@/lib/server/orders')

      vi.spyOn(serverAuth, 'getAuthenticatedCaller').mockResolvedValue({
        ok: true,
        caller: {
          callerUid: 'staff_store_1',
          callerName: 'Store 1 Staff',
          callerEmail: 'staff1@a96.com',
          callerData: {
            email: 'staff1@a96.com',
            displayName: 'Store 1 Staff',
            role: 'sales_cashier',
            status: 'active',
            assignedLocationId: 'loc_store_1',
            assignedLocationName: 'Store 1'
          },
          isSuperAdmin: false,
          callerPermissions: { ...SUPER_ADMIN_PERMISSIONS },
          decodedToken: {}
        }
      })

      const listSpy = vi.spyOn(ordersModule, 'listOrders').mockResolvedValue({
        orders: [],
        nextCursor: null
      })

      const req = new NextRequest(
        'http://localhost:3000/api/admin/orders?locationId=loc_store_99&startDate=2026-10-01&endDate=2026-10-20',
        {
          method: 'GET',
          headers: { Authorization: 'Bearer mock_token' }
        }
      )

      const res = await GET(req)
      expect(res.status).toBe(200)

      // Verified: caller's assignedLocationId was forced ('loc_store_1' instead of query's 'loc_store_99'),
      // and startDate / endDate were passed to listOrders
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          locationId: 'loc_store_1',
          startDate: '2026-10-01',
          endDate: '2026-10-20'
        })
      )
    })

    it('Maps validation errors to HTTP 400 by error class (ValidationError) without message text matching', async () => {
      const { POST } = await import('@/app/api/admin/orders/route')
      const serverAuth = await import('@/lib/firebase/server-auth')
      const ordersModule = await import('@/lib/server/orders')
      const systemLock = await import('@/lib/server/system-lock')

      vi.spyOn(serverAuth, 'getAuthenticatedCaller').mockResolvedValue({
        ok: true,
        caller: {
          callerUid: 'super_admin_1',
          callerName: 'Super Admin',
          callerEmail: 'admin@a96.com',
          callerData: { email: 'admin@a96.com', displayName: 'Super Admin', role: 'super_admin', status: 'active' },
          isSuperAdmin: true,
          callerPermissions: { ...SUPER_ADMIN_PERMISSIONS },
          decodedToken: {}
        }
      })

      vi.spyOn(systemLock, 'getClosedFiscalCutoff').mockResolvedValue(null)

      vi.spyOn(ordersModule, 'createOrder').mockRejectedValue(
        new ordersModule.ValidationError('Custom business logic constraint violation')
      )

      const body = {
        type: 'sale',
        locationId: 'loc_main',
        date: '2026-10-20',
        lines: [
          { productId: 'prod_gold_coin', qty: 1, unitPricePaise: 7500000 }
        ],
        payments: [
          { mode: 'cash', amountPaise: 7500000 }
        ]
      }

      const req = new NextRequest('http://localhost:3000/api/admin/orders', {
        method: 'POST',
        headers: { Authorization: 'Bearer mock_token', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const res = await POST(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('Custom business logic constraint violation')
    })
  })
})

