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

      const sanitized = redactAuditDiffs(diffs)
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
    const superAdminCaller: AuthenticatedCaller = {
      callerUid: 'super_admin_1',
      callerEmail: 'admin@a96ventures.com',
      callerName: 'Super Admin',
      role: 'super_admin',
      status: 'active',
      perms: ['cus:v', 'cus:a', 'cus:e', 'cus:d', 'cus:x', 'cus:p', 'cus:k'],
      permissions: SUPER_ADMIN_PERMISSIONS
    }

    const cashierCaller: AuthenticatedCaller = {
      callerUid: 'cashier_1',
      callerEmail: 'cashier@a96ventures.com',
      callerName: 'Cashier Staff',
      role: 'sales_cashier',
      status: 'active',
      perms: ['cus:v', 'cus:a', 'cus:k'],
      permissions: SALES_CASHIER_PERMISSIONS
    }

    const managerCaller: AuthenticatedCaller = {
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
})
