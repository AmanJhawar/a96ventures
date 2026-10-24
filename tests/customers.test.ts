import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import {
  CreateCustomerSchema,
  UpdateCustomerSchema,
  UpdatePanSchema,
  ConflictError,
  RateLimitError
} from '@/lib/server/customers'
import { redactAuditDiffs } from '@/lib/services/audit.service'
import { AuthenticatedCaller } from '@/lib/firebase/server-auth'
import { SUPER_ADMIN_PERMISSIONS, STORE_MANAGER_PERMISSIONS, SALES_CASHIER_PERMISSIONS } from '@/lib/constants/permissions'

describe('Customer API & Validation (Phase 3)', () => {
  describe('Zod Validation Schemas', () => {
    it('accepts valid customer registration inputs', () => {
      const valid = {
        firstName: 'Aman',
        lastName: 'Jhawar',
        countryCode: '+91',
        mobile: '9876543210',
        email: 'aman@a96ventures.com',
        address: {
          line1: '123 MG Road',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560001',
          country: 'India' as const
        },
        pan: 'ABCDE1234F',
        notes: 'VIP Client',
        source: 'walk_in' as const
      }

      const parsed = CreateCustomerSchema.parse(valid)
      expect(parsed.firstName).toBe('Aman')
      expect(parsed.lastName).toBe('Jhawar')
      expect(parsed.mobile).toBe('9876543210')
      expect(parsed.email).toBe('aman@a96ventures.com')
      expect(parsed.pan).toBe('ABCDE1234F')
    })

    it('rejects creation if required fields are missing', () => {
      expect(() => CreateCustomerSchema.parse({ lastName: 'Jhawar', mobile: '9876543210' })).toThrow()
      expect(() => CreateCustomerSchema.parse({ firstName: 'Aman', mobile: '9876543210' })).toThrow()
      expect(() => CreateCustomerSchema.parse({ firstName: 'Aman', lastName: 'Jhawar' })).toThrow()
    })

    it('rejects invalid email formats', () => {
      expect(() =>
        CreateCustomerSchema.parse({
          firstName: 'Aman',
          lastName: 'Jhawar',
          mobile: '9876543210',
          email: 'not-an-email'
        })
      ).toThrow(/Invalid email/)
    })

    it('rejects invalid Indian PIN codes (must be exactly 6 digits)', () => {
      expect(() =>
        CreateCustomerSchema.parse({
          firstName: 'Aman',
          lastName: 'Jhawar',
          mobile: '9876543210',
          address: {
            pincode: '56001', // 5 digits
            country: 'India' as const
          }
        })
      ).toThrow(/PIN code must be 6 digits/)
    })

    it('validates update schema with partial fields', () => {
      const parsed = UpdateCustomerSchema.parse({
        firstName: 'Vikram',
        email: 'vikram@example.com'
      })
      expect(parsed.firstName).toBe('Vikram')
      expect(parsed.email).toBe('vikram@example.com')
    })

    it('validates PAN update payload', () => {
      const parsed = UpdatePanSchema.parse({ pan: 'ABCDE1234F' })
      expect(parsed.pan).toBe('ABCDE1234F')
      expect(() => UpdatePanSchema.parse({ pan: '' })).toThrow(/PAN is required/)
    })
  })

  describe('Audit Trail Redaction (audit.service.ts)', () => {
    it('redacts diffs where field name is pan or PAN', () => {
      const diffs = [
        { field: 'pan', label: 'PAN Card', oldValue: 'ABCDE1234F', newValue: 'ZZZZZ9999Z' },
        { field: 'firstName', label: 'First Name', oldValue: 'Aman', newValue: 'Aman Kumar' }
      ]

      const sanitized = redactAuditDiffs(diffs)
      expect(sanitized).toEqual([
        { field: 'pan', label: 'PAN Card', oldValue: '[redacted]', newValue: '[redacted]' },
        { field: 'firstName', label: 'First Name', oldValue: 'Aman', newValue: 'Aman Kumar' }
      ])
    })

    it('redacts values that match PAN format even if field is named differently', () => {
      const diffs = [
        { field: 'taxId', label: 'Tax Identification', oldValue: 'ABCDE1234F', newValue: 'AAAPA1111A' },
        { field: 'phone', label: 'Phone', oldValue: '9876543210', newValue: '9876543211' }
      ]

      const sanitized = redactAuditDiffs(diffs)!
      expect(sanitized[0].oldValue).toBe('[redacted]')
      expect(sanitized[0].newValue).toBe('[redacted]')
      expect(sanitized[1].oldValue).toBe('9876543210')
    })

    it('handles empty or undefined diff lists cleanly', () => {
      expect(redactAuditDiffs(undefined)).toEqual([])
      expect(redactAuditDiffs([])).toEqual([])
    })
  })

  describe('Caller Permissions & Authorization Hierarchy', () => {
    const superAdminCaller: any = {
      callerUid: 'super_admin_1',
      callerEmail: 'admin@a96ventures.com',
      callerName: 'Super Admin',
      role: 'super_admin',
      status: 'active',
      perms: ['cus:v', 'cus:a', 'cus:e', 'cus:d', 'cus:x', 'cus:p', 'cus:k'],
      permissions: SUPER_ADMIN_PERMISSIONS
    }

    const cashierCaller: any = {
      callerUid: 'cashier_1',
      callerEmail: 'cashier@a96ventures.com',
      callerName: 'Cashier Staff',
      role: 'sales_cashier',
      status: 'active',
      perms: ['cus:v', 'cus:a', 'cus:k'],
      permissions: SALES_CASHIER_PERMISSIONS
    }

    const managerCaller: any = {
      callerUid: 'manager_1',
      callerEmail: 'manager@a96ventures.com',
      callerName: 'Store Manager',
      role: 'store_manager',
      status: 'active',
      perms: ['cus:v', 'cus:a', 'cus:e', 'cus:p', 'cus:k'],
      permissions: STORE_MANAGER_PERMISSIONS
    }

    it('cashier can add customers and enter PAN (editPan) but cannot reveal (viewPan)', () => {
      expect(cashierCaller.permissions.customers.add).toBe(true)
      expect(cashierCaller.permissions.customers.editPan).toBe(true)
      expect(cashierCaller.permissions.customers.viewPan).toBe(false)
      expect(cashierCaller.permissions.customers.export).toBe(false)
    })

    it('store manager can view, add, edit, and reveal PAN but cannot export', () => {
      expect(managerCaller.permissions.customers.view).toBe(true)
      expect(managerCaller.permissions.customers.add).toBe(true)
      expect(managerCaller.permissions.customers.edit).toBe(true)
      expect(managerCaller.permissions.customers.viewPan).toBe(true)
      expect(managerCaller.permissions.customers.export).toBe(false)
      expect(managerCaller.permissions.customers.delete).toBe(false)
    })

    it('super admin has full unrestricted customer access including export', () => {
      expect(superAdminCaller.permissions.customers.export).toBe(true)
      expect(superAdminCaller.permissions.customers.delete).toBe(true)
      expect(superAdminCaller.permissions.customers.viewPan).toBe(true)
    })
  })

  describe('Conflict & Rate Limit Error Objects', () => {
    it('instantiates ConflictError with field and existingCustomerId', () => {
      const err = new ConflictError('mobile', 'cust_123')
      expect(err.name).toBe('ConflictError')
      expect(err.field).toBe('mobile')
      expect(err.existingCustomerId).toBe('cust_123')
      expect(err.message).toContain('mobile')
    })

    it('instantiates RateLimitError with custom message', () => {
      const err = new RateLimitError('Rate limit exceeded: 10 per hour')
      expect(err.name).toBe('RateLimitError')
      expect(err.message).toBe('Rate limit exceeded: 10 per hour')
    })
  })

  describe('Customer Visit Dates & Stats Initialization', () => {
    it('createCustomerServer starts stats with firstVisitAt and lastVisitAt unset', async () => {
      const { createCustomerServer } = await import('@/lib/server/customers')
      const { adminDb } = await import('@/lib/firebase/admin')

      let writtenCustomer: any = null
      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({
            id: id || 'mock_cust_id',
            path: `${colName}/${id || 'mock_cust_id'}`
          }),
          add: vi.fn(async () => ({}))
        } as unknown as FirebaseFirestore.CollectionReference
      })

      vi.spyOn(adminDb, 'runTransaction').mockImplementation(async (cb: any) => {
        return cb({
          get: vi.fn(async () => ({ exists: false })),
          set: vi.fn((ref: any, data: any) => {
            if (ref.path?.startsWith('customers/')) {
              writtenCustomer = data
            }
          }),
          update: vi.fn(),
          delete: vi.fn()
        })
      })

      const superAdminCaller: AuthenticatedCaller = {
        callerUid: 'super_admin_1',
        callerEmail: 'admin@a96ventures.com',
        callerName: 'Super Admin',
        callerData: {
          email: 'admin@a96ventures.com',
          displayName: 'Super Admin',
          role: 'super_admin',
          status: 'active'
        },
        isSuperAdmin: true,
        callerPermissions: SUPER_ADMIN_PERMISSIONS,
        decodedToken: {}
      }

      const customer = await createCustomerServer(superAdminCaller, {
        firstName: 'Anjali',
        lastName: 'Sharma',
        mobile: '9876543210',
        countryCode: '+91',
        source: 'walk_in'
      })

      // Verification: firstVisitAt and lastVisitAt must be unset
      expect(customer.stats.firstVisitAt).toBeUndefined()
      expect(customer.stats.lastVisitAt).toBeUndefined()
      expect(customer.stats.visitCount).toBe(0)
      expect(customer.stats.openFollowUps).toBe(0)

      // Verified: createdAt is retained as ISO timestamp
      expect(customer.createdAt).toBeDefined()
      expect(writtenCustomer?.stats?.firstVisitAt).toBeUndefined()
      expect(writtenCustomer?.stats?.lastVisitAt).toBeUndefined()
    })

    it('computeCustomerVisitStats accurately calculates stats from visits (fix-customer-visit-dates)', async () => {
      const { computeCustomerVisitStats } = await import('../scripts/fix-customer-visit-dates.mjs')

      // Case 1: No visits
      expect(computeCustomerVisitStats([])).toEqual({
        firstVisitAt: null,
        lastVisitAt: null,
        visitCount: 0,
        openFollowUps: 0
      })

      // Case 2: Multiple visits with follow-ups
      const mockVisits = [
        { at: '2026-05-10', followUpOn: '2026-05-20', followUpDone: true },
        { at: '2026-03-01' },
        { at: '2026-09-15', followUpOn: '2026-09-25', followUpDone: false },
        { at: '2026-07-20', followUpOn: '2026-08-01', followUpDone: false }
      ]

      const stats = computeCustomerVisitStats(mockVisits)
      expect(stats.firstVisitAt).toBe('2026-03-01')
      expect(stats.lastVisitAt).toBe('2026-09-15')
      expect(stats.visitCount).toBe(4)
      expect(stats.openFollowUps).toBe(2)
    })

    it('getCustomersServer filters by never, 30, 90, 365 days and hasFollowUp', async () => {
      const { getCustomersServer } = await import('@/lib/server/customers')
      const { adminDb } = await import('@/lib/firebase/admin')

      const superAdminCaller: AuthenticatedCaller = {
        callerUid: 'super_admin_1',
        callerEmail: 'admin@a96ventures.com',
        callerName: 'Super Admin',
        callerData: {
          email: 'admin@a96ventures.com',
          displayName: 'Super Admin',
          role: 'super_admin',
          status: 'active'
        },
        isSuperAdmin: true,
        callerPermissions: SUPER_ADMIN_PERMISSIONS,
        decodedToken: {}
      }

      const mockCustomers = [
        {
          id: 'cust_unvisited',
          displayName: 'Never Visited Cust',
          isArchived: false,
          stats: { visitCount: 0, openFollowUps: 0 }
        },
        {
          id: 'cust_recent_10d',
          displayName: 'Recent 10d Cust',
          isArchived: false,
          stats: { firstVisitAt: '2026-10-14', lastVisitAt: '2026-10-14', visitCount: 1, openFollowUps: 1 }
        },
        {
          id: 'cust_mid_60d',
          displayName: 'Mid 60d Cust',
          isArchived: false,
          stats: { firstVisitAt: '2026-08-25', lastVisitAt: '2026-08-25', visitCount: 1, openFollowUps: 0 }
        },
        {
          id: 'cust_old_200d',
          displayName: 'Old 200d Cust',
          isArchived: false,
          stats: { firstVisitAt: '2026-04-01', lastVisitAt: '2026-04-01', visitCount: 1, openFollowUps: 1 }
        }
      ]

      vi.spyOn(adminDb, 'collection').mockImplementation(() => {
        return {
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnValue({
            get: vi.fn(async () => ({
              docs: mockCustomers.map((c) => ({
                id: c.id,
                data: () => c
              }))
            }))
          })
        } as unknown as FirebaseFirestore.CollectionReference
      })

      // Test 'never' filter
      const neverRes = await getCustomersServer(superAdminCaller, { lastVisit: 'never' })
      expect(neverRes.customers.map((c) => c.id)).toEqual(['cust_unvisited'])

      // Test 'hasFollowUp' filter
      const followUpRes = await getCustomersServer(superAdminCaller, { hasFollowUp: true })
      expect(followUpRes.customers.map((c) => c.id)).toEqual(['cust_recent_10d', 'cust_old_200d'])
    })
  })

  describe('Customer Profile Updates, Clear Fields, Archive, and Restore', () => {
    it('updateCustomerServer writes FieldValue.delete() for null or empty string middleName, email, notes, and address', async () => {
      const { updateCustomerServer } = await import('@/lib/server/customers')
      const { adminDb } = await import('@/lib/firebase/admin')
      const { FieldValue } = await import('firebase-admin/firestore')

      const superAdminCaller: AuthenticatedCaller = {
        callerUid: 'super_admin_1',
        callerEmail: 'admin@a96ventures.com',
        callerName: 'Super Admin',
        callerData: {
          email: 'admin@a96ventures.com',
          displayName: 'Super Admin',
          role: 'super_admin',
          status: 'active'
        },
        isSuperAdmin: true,
        callerPermissions: SUPER_ADMIN_PERMISSIONS,
        decodedToken: {}
      }

      const existingCustomer: any = {
        id: 'cust_clear_test',
        firstName: 'John',
        middleName: 'David',
        lastName: 'Doe',
        displayName: 'John David Doe',
        mobile: { countryCode: '+91', number: '9876543210', e164: '+919876543210' },
        email: 'john@example.com',
        notes: 'VIP customer',
        address: { line1: '123 Main St', city: 'Mumbai', pincode: '400001', country: 'India' },
        hasPan: false,
        isArchived: false
      }

      let writtenUpdates: any = null

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({
            id: id || 'mock_doc',
            path: `${colName}/${id || 'mock_doc'}`
          }),
          add: vi.fn(async () => ({}))
        } as unknown as FirebaseFirestore.CollectionReference
      })

      vi.spyOn(adminDb, 'runTransaction').mockImplementation(async (cb: any) => {
        return cb({
          get: vi.fn(async (ref: any) => {
            if (ref.path === 'customers/cust_clear_test') {
              return { exists: true, data: () => existingCustomer }
            }
            return { exists: false }
          }),
          set: vi.fn(),
          update: vi.fn((_ref: any, updates: any) => {
            writtenUpdates = updates
          }),
          delete: vi.fn()
        })
      })

      // Send explicit null for middleName and notes, empty string for email and address
      const res = await updateCustomerServer(superAdminCaller, 'cust_clear_test', {
        middleName: null,
        email: '',
        notes: null,
        address: ''
      })

      expect(writtenUpdates).toBeDefined()
      expect(writtenUpdates.middleName).toEqual(FieldValue.delete())
      expect(writtenUpdates.email).toEqual(FieldValue.delete())
      expect(writtenUpdates.notes).toEqual(FieldValue.delete())
      expect(writtenUpdates.address).toEqual(FieldValue.delete())

      // In memory returned object should have cleared fields omitted/undefined
      expect(res.middleName).toBeUndefined()
      expect(res.email).toBeUndefined()
      expect(res.notes).toBeUndefined()
      expect(res.address).toBeUndefined()
    })

    it('archiveCustomerServer releases the customer_mobiles reservation', async () => {
      const { archiveCustomerServer } = await import('@/lib/server/customers')
      const { adminDb } = await import('@/lib/firebase/admin')

      const superAdminCaller: AuthenticatedCaller = {
        callerUid: 'super_admin_1',
        callerEmail: 'admin@a96ventures.com',
        callerName: 'Super Admin',
        callerData: {
          email: 'admin@a96ventures.com',
          displayName: 'Super Admin',
          role: 'super_admin',
          status: 'active'
        },
        isSuperAdmin: true,
        callerPermissions: SUPER_ADMIN_PERMISSIONS,
        decodedToken: {}
      }

      const existingCustomer: any = {
        id: 'cust_archive_test',
        displayName: 'Archive Me',
        mobile: { countryCode: '+91', number: '9876543210', e164: '+919876543210' },
        isArchived: false
      }

      let deletedDocPath: string | null = null
      let updatedCustomerDoc: any = null

      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({
            id: id || 'mock_doc',
            path: `${colName}/${id || 'mock_doc'}`
          }),
          add: vi.fn(async () => ({}))
        } as unknown as FirebaseFirestore.CollectionReference
      })

      vi.spyOn(adminDb, 'runTransaction').mockImplementation(async (cb: any) => {
        return cb({
          get: vi.fn(async () => ({ exists: true, data: () => existingCustomer })),
          set: vi.fn(),
          update: vi.fn((_ref: any, data: any) => {
            updatedCustomerDoc = data
          }),
          delete: vi.fn((ref: any) => {
            deletedDocPath = ref.path
          })
        })
      })

      await archiveCustomerServer(superAdminCaller, 'cust_archive_test')

      expect(updatedCustomerDoc?.isArchived).toBe(true)
      // Confirmed: customer_mobiles reservation was deleted
      expect(deletedDocPath).toBe('customer_mobiles/+919876543210')
    })

    it('restoreCustomerServer re-reserves mobile and fails with 409 if someone else now has it', async () => {
      const { restoreCustomerServer, ConflictError } = await import('@/lib/server/customers')
      const { adminDb } = await import('@/lib/firebase/admin')

      const superAdminCaller: AuthenticatedCaller = {
        callerUid: 'super_admin_1',
        callerEmail: 'admin@a96ventures.com',
        callerName: 'Super Admin',
        callerData: {
          email: 'admin@a96ventures.com',
          displayName: 'Super Admin',
          role: 'super_admin',
          status: 'active'
        },
        isSuperAdmin: true,
        callerPermissions: SUPER_ADMIN_PERMISSIONS,
        decodedToken: {}
      }

      const archivedCustomer: any = {
        id: 'cust_restore_test',
        displayName: 'Restore Me',
        mobile: { countryCode: '+91', number: '9876543210', e164: '+919876543210' },
        isArchived: true
      }

      // Case 1: Another customer now holds the mobile number -> fails with 409 ConflictError
      vi.spyOn(adminDb, 'collection').mockImplementation((colName: string) => {
        return {
          doc: (id?: string) => ({
            id: id || 'mock_doc',
            path: `${colName}/${id || 'mock_doc'}`
          }),
          add: vi.fn(async () => ({}))
        } as unknown as FirebaseFirestore.CollectionReference
      })

      vi.spyOn(adminDb, 'runTransaction').mockImplementation(async (cb: any) => {
        return cb({
          get: vi.fn(async (ref: any) => {
            if (ref.path === 'customers/cust_restore_test') {
              return { exists: true, data: () => archivedCustomer }
            }
            if (ref.path === 'customer_mobiles/+919876543210') {
              return { exists: true, data: () => ({ customerId: 'other_active_cust' }) }
            }
            if (ref.path === 'customers/other_active_cust') {
              return { exists: true, data: () => ({ displayName: 'Other Person', isArchived: false }) }
            }
            return { exists: false }
          }),
          set: vi.fn(),
          update: vi.fn(),
          delete: vi.fn()
        })
      })

      await expect(restoreCustomerServer(superAdminCaller, 'cust_restore_test')).rejects.toThrow(ConflictError)

      // Case 2: Number is free -> succeeds, re-reserves mobile and unsets isArchived
      let mobileReservedData: any = null
      let restoredData: any = null

      vi.spyOn(adminDb, 'runTransaction').mockImplementation(async (cb: any) => {
        return cb({
          get: vi.fn(async (ref: any) => {
            if (ref.path === 'customers/cust_restore_test') {
              return { exists: true, data: () => archivedCustomer }
            }
            if (ref.path === 'customer_mobiles/+919876543210') {
              return { exists: false }
            }
            return { exists: false }
          }),
          set: vi.fn((ref: any, data: any) => {
            if (ref.path === 'customer_mobiles/+919876543210') {
              mobileReservedData = data
            }
          }),
          update: vi.fn((ref: any, data: any) => {
            if (ref.path === 'customers/cust_restore_test') {
              restoredData = data
            }
          }),
          delete: vi.fn()
        })
      })

      const restoreResult = await restoreCustomerServer(superAdminCaller, 'cust_restore_test')
      expect(restoreResult.success).toBe(true)
      expect(restoreResult.customer.isArchived).toBe(false)
      expect(restoredData?.isArchived).toBe(false)
      expect(mobileReservedData?.customerId).toBe('cust_restore_test')
      expect(mobileReservedData?.e164).toBe('+919876543210')
    })
  })
})

