import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createVisit,
  updateVisit,
  deleteVisit,
  listDueFollowUps,
  MANUAL_VISIT_KINDS
} from '@/lib/server/visits'
import { Customer, Visit } from '@/lib/types'
import { adminDb } from '@/lib/firebase/admin'

describe('Visits API and Follow-ups (Phase 5)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Validation of Visit Kinds', () => {
    it('defines permitted manual visit kinds', () => {
      expect(MANUAL_VISIT_KINDS).toEqual(['walk_in', 'inquiry', 'follow_up', 'repair'])
    })

    it('rejects logging purchase or return visits manually', async () => {
      const caller = { callerUid: 'staff_1', callerName: 'Staff', callerEmail: 'staff@a96.com' }

      await expect(
        createVisit({
          customerId: 'cust_1',
          locationId: 'loc_vault',
          kind: 'purchase' as unknown as 'walk_in',
          caller
        })
      ).rejects.toThrow(/Only manual visits/)

      await expect(
        createVisit({
          customerId: 'cust_1',
          locationId: 'loc_vault',
          kind: 'return' as unknown as 'walk_in',
          caller
        })
      ).rejects.toThrow(/Only manual visits/)
    })

    it('rejects deleting purchase or return visits directly', async () => {
      const caller = { callerUid: 'staff_1', callerName: 'Staff', callerEmail: 'staff@a96.com' }

      const mockPurchaseVisit: Visit = {
        id: 'visit_purchase_1',
        customerId: 'cust_1',
        locationId: 'loc_vault',
        at: '2026-05-01',
        staffId: 'staff_1',
        staffName: 'Staff',
        kind: 'purchase',
        orderId: 'order_123',
        followUpDone: false
      }

      const fakeTransaction = {
        get: vi.fn(async (ref: { path: string }) => {
          if (ref.path === 'visits/visit_purchase_1') {
            return { exists: true, data: () => mockPurchaseVisit }
          }
          return { exists: false }
        }),
        delete: vi.fn(),
        update: vi.fn()
      }

      vi.spyOn(adminDb, 'runTransaction').mockImplementation(async (cb: unknown) => {
        return (cb as (t: unknown) => Promise<unknown>)(fakeTransaction)
      })

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({ id: id || 'doc_id', path: `${colName}/${id || 'doc_id'}` }),
          add: vi.fn(async () => ({ id: 'mock_add_id' }))
        } as unknown as FirebaseFirestore.CollectionReference
      })

      await expect(
        deleteVisit({
          visitId: 'visit_purchase_1',
          caller
        })
      ).rejects.toThrow(/Cannot delete purchase or return visits directly/)
    })
  })

  describe('Follow-up State Transitions & openFollowUps Invariants', () => {
    const caller = { callerUid: 'staff_1', callerName: 'Staff', callerEmail: 'staff@a96.com' }

    it('increments openFollowUps and visitCount when a follow-up is scheduled', async () => {
      const mockCustomer: Customer = {
        id: 'cust_1',
        firstName: 'Rahul',
        lastName: 'Sharma',
        displayName: 'Rahul Sharma',
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
          visitCount: 2,
          orderCount: 1,
          lifetimeValuePaise: 5000000,
          lifetimeWeightMg: { Gold: 10000, Silver: 0 },
          openFollowUps: 0
        }
      }

      let writtenVisit: Visit | null = null
      let updatedCustomerStats: Record<string, unknown> | null = null

      const fakeTransaction = {
        get: vi.fn(async (ref: { path: string }) => {
          if (ref.path === 'customers/cust_1') {
            return { exists: true, data: () => mockCustomer }
          }
          if (ref.path === 'locations/loc_vault') {
            return { exists: true, data: () => ({ name: 'Main Vault' }) }
          }
          return { exists: false }
        }),
        set: vi.fn((ref: { path: string }, data: unknown) => {
          if (ref.path.startsWith('visits/')) writtenVisit = data as Visit
        }),
        update: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
          if (ref.path === 'customers/cust_1') updatedCustomerStats = data.stats as Record<string, unknown>
        })
      }

      vi.spyOn(adminDb, 'runTransaction').mockImplementation(async (cb: unknown) => {
        return (cb as (t: unknown) => Promise<unknown>)(fakeTransaction)
      })

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({ id: id || 'doc_id', path: `${colName}/${id || 'doc_id'}` }),
          add: vi.fn(async () => ({ id: 'mock_add_id' }))
        } as unknown as FirebaseFirestore.CollectionReference
      })

      const visit = await createVisit({
        customerId: 'cust_1',
        locationId: 'loc_vault',
        kind: 'inquiry',
        at: '2026-05-10',
        note: 'Customer interested in 50g gold bar',
        followUpOn: '2026-05-20',
        caller
      })

      expect(visit.kind).toBe('inquiry')
      expect(visit.followUpOn).toBe('2026-05-20')
      expect(visit.followUpDone).toBe(false)
      expect(writtenVisit).toBeDefined()
      expect(updatedCustomerStats?.visitCount).toBe(3)
      expect(updatedCustomerStats?.openFollowUps).toBe(1)
      expect(updatedCustomerStats?.lastVisitAt).toBe('2026-05-10')
    })

    it('resolves a prior follow-up when followUpOf is specified in a new visit', async () => {
      const mockCustomer: Customer = {
        id: 'cust_1',
        firstName: 'Rahul',
        lastName: 'Sharma',
        displayName: 'Rahul Sharma',
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
          visitCount: 3,
          orderCount: 1,
          lifetimeValuePaise: 5000000,
          lifetimeWeightMg: { Gold: 10000, Silver: 0 },
          openFollowUps: 1
        }
      }

      const mockPriorVisit: Visit = {
        id: 'visit_prev_1',
        customerId: 'cust_1',
        locationId: 'loc_vault',
        at: '2026-05-10',
        staffId: 'staff_1',
        staffName: 'Staff',
        kind: 'inquiry',
        followUpOn: '2026-05-20',
        followUpDone: false
      }

      let updatedPriorVisit: Record<string, unknown> | null = null
      let updatedCustomerStats: Record<string, unknown> | null = null

      const fakeTransaction = {
        get: vi.fn(async (ref: { path: string }) => {
          if (ref.path === 'customers/cust_1') {
            return { exists: true, data: () => mockCustomer }
          }
          if (ref.path === 'locations/loc_vault') {
            return { exists: true, data: () => ({ name: 'Main Vault' }) }
          }
          if (ref.path === 'visits/visit_prev_1') {
            return { exists: true, data: () => mockPriorVisit }
          }
          return { exists: false }
        }),
        set: vi.fn(),
        update: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
          if (ref.path === 'visits/visit_prev_1') updatedPriorVisit = data
          if (ref.path === 'customers/cust_1') updatedCustomerStats = data.stats as Record<string, unknown>
        })
      }

      vi.spyOn(adminDb, 'runTransaction').mockImplementation(async (cb: unknown) => {
        return (cb as (t: unknown) => Promise<unknown>)(fakeTransaction)
      })

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({ id: id || 'doc_id', path: `${colName}/${id || 'doc_id'}` }),
          add: vi.fn(async () => ({ id: 'mock_add_id' }))
        } as unknown as FirebaseFirestore.CollectionReference
      })

      const visit = await createVisit({
        customerId: 'cust_1',
        locationId: 'loc_vault',
        kind: 'follow_up',
        at: '2026-05-20',
        note: 'Customer phoned back and confirmed rate enquiry',
        followUpOf: 'visit_prev_1',
        caller
      })

      expect(visit.followUpOf).toBe('visit_prev_1')
      expect(updatedPriorVisit?.followUpDone).toBe(true)
      // Prior was open (1), closed by this visit without scheduling a new followUpOn -> openFollowUps becomes 0
      expect(updatedCustomerStats?.openFollowUps).toBe(0)
      expect(updatedCustomerStats?.visitCount).toBe(4)
    })

    it('accurately updates openFollowUps when updating visit completion status', async () => {
      const mockCustomer: Customer = {
        id: 'cust_1',
        firstName: 'Rahul',
        lastName: 'Sharma',
        displayName: 'Rahul Sharma',
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
          visitCount: 3,
          orderCount: 1,
          lifetimeValuePaise: 5000000,
          lifetimeWeightMg: { Gold: 10000, Silver: 0 },
          openFollowUps: 1
        }
      }

      const mockVisit: Visit = {
        id: 'visit_open_1',
        customerId: 'cust_1',
        locationId: 'loc_vault',
        at: '2026-05-10',
        staffId: 'staff_1',
        staffName: 'Staff',
        kind: 'follow_up',
        followUpOn: '2026-05-25',
        followUpDone: false
      }

      let updatedCustomerStatsOpen: number | null = null

      const fakeTransaction = {
        get: vi.fn(async (ref: { path: string }) => {
          if (ref.path === 'visits/visit_open_1') return { exists: true, data: () => mockVisit }
          if (ref.path === 'customers/cust_1') return { exists: true, data: () => mockCustomer }
          return { exists: false }
        }),
        update: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
          if (ref.path === 'customers/cust_1') {
            updatedCustomerStatsOpen = data['stats.openFollowUps'] as number
          }
        })
      }

      vi.spyOn(adminDb, 'runTransaction').mockImplementation(async (cb: unknown) => {
        return (cb as (t: unknown) => Promise<unknown>)(fakeTransaction)
      })

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({ id: id || 'doc_id', path: `${colName}/${id || 'doc_id'}` }),
          add: vi.fn(async () => ({ id: 'mock_add_id' }))
        } as unknown as FirebaseFirestore.CollectionReference
      })

      // Marking followUpDone: true should decrement openFollowUps from 1 to 0
      const updated = await updateVisit({
        visitId: 'visit_open_1',
        followUpDone: true,
        caller
      })

      expect(updated.followUpDone).toBe(true)
      expect(updatedCustomerStatsOpen).toBe(0)
    })

    it('decrements visitCount and openFollowUps on deleting an open visit', async () => {
      const mockCustomer: Customer = {
        id: 'cust_1',
        firstName: 'Rahul',
        lastName: 'Sharma',
        displayName: 'Rahul Sharma',
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
          visitCount: 5,
          orderCount: 1,
          lifetimeValuePaise: 5000000,
          lifetimeWeightMg: { Gold: 10000, Silver: 0 },
          openFollowUps: 2
        }
      }

      const mockVisitToDelete: Visit = {
        id: 'visit_to_delete',
        customerId: 'cust_1',
        locationId: 'loc_vault',
        at: '2026-05-15',
        staffId: 'staff_1',
        staffName: 'Staff',
        kind: 'inquiry',
        followUpOn: '2026-05-30',
        followUpDone: false
      }

      let updatedCustomerStats: Record<string, unknown> | null = null
      let deletedPath: string | null = null

      const fakeTransaction = {
        get: vi.fn(async (ref: { path: string }) => {
          if (ref.path === 'visits/visit_to_delete') return { exists: true, data: () => mockVisitToDelete }
          if (ref.path === 'customers/cust_1') return { exists: true, data: () => mockCustomer }
          return { exists: false }
        }),
        delete: vi.fn((ref: { path: string }) => {
          deletedPath = ref.path
        }),
        update: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
          if (ref.path === 'customers/cust_1') updatedCustomerStats = data.stats as Record<string, unknown>
        })
      }

      vi.spyOn(adminDb, 'runTransaction').mockImplementation(async (cb: unknown) => {
        return (cb as (t: unknown) => Promise<unknown>)(fakeTransaction)
      })

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({ id: id || 'doc_id', path: `${colName}/${id || 'doc_id'}` }),
          add: vi.fn(async () => ({ id: 'mock_add_id' }))
        } as unknown as FirebaseFirestore.CollectionReference
      })

      const res = await deleteVisit({ visitId: 'visit_to_delete', caller })
      expect(res.success).toBe(true)
      expect(deletedPath).toBe('visits/visit_to_delete')
      expect(updatedCustomerStats?.visitCount).toBe(4)
      expect(updatedCustomerStats?.openFollowUps).toBe(1)
    })
  })

  describe('Due Follow-ups Query', () => {
    it('returns only open follow-ups on or before the cutoff date, enriched with customer details', async () => {
      const mockVisitsSnap = {
        empty: false,
        docs: [
          {
            id: 'v_due_1',
            data: () => ({
              customerId: 'cust_1',
              locationId: 'loc_vault',
              at: '2026-05-01',
              kind: 'inquiry',
              note: 'Wants gold coin quote',
              followUpOn: '2026-05-15',
              followUpDone: false
            })
          }
        ]
      }

      const mockCustomer = {
        displayName: 'Rahul Sharma',
        mobile: { e164: '+919876543210' },
        address: { city: 'Bengaluru' }
      }

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        if (colName === 'visits') {
          return {
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            get: vi.fn(async () => mockVisitsSnap)
          } as unknown as FirebaseFirestore.CollectionReference
        }
        if (colName === 'customers') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({ exists: true, id: 'cust_1', data: () => mockCustomer }))
            }))
          } as unknown as FirebaseFirestore.CollectionReference
        }
        return {
          get: vi.fn(async () => ({ empty: true, docs: [] }))
        } as unknown as FirebaseFirestore.CollectionReference
      })

      const due = await listDueFollowUps('2026-05-20')
      expect(due).toHaveLength(1)
      expect(due[0].customerName).toBe('Rahul Sharma')
      expect(due[0].customerMobile).toBe('+919876543210')
      expect(due[0].customerCity).toBe('Bengaluru')
      expect(due[0].followUpOn).toBe('2026-05-15')
    })
  })
})
