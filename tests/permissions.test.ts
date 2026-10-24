import { describe, it, expect } from 'vitest'
import {
  permissionsToShortCodes,
  shortCodesToPermissions,
  SUPER_ADMIN_PERMISSIONS,
  EMPTY_PERMISSIONS
} from '@/lib/constants/permissions'
import { UserPermissions } from '@/lib/types'

describe('Custom Claims Permissions Compression', () => {
  it('compresses full super admin permissions to compact short codes array', () => {
    const codes = permissionsToShortCodes(SUPER_ADMIN_PERMISSIONS)

    // Should include codes like 'prd:v', 'sal:v', etc.
    expect(codes).toContain('prd:v')
    expect(codes).toContain('sal:v')
    expect(codes).toContain('sal:a')
    expect(codes).toContain('sal:e')
    expect(codes).toContain('pur:e')
    expect(codes).toContain('cus:v')
    expect(codes).toContain('cus:a')
    expect(codes).toContain('cus:e')
    expect(codes).toContain('cus:d')
    expect(codes).toContain('cus:x')
    expect(codes).toContain('cus:p')
    expect(codes).toContain('cus:k')
    expect(codes).toContain('vis:v')
    expect(codes).toContain('vis:a')
    expect(codes).toContain('vis:e')
    expect(codes).toContain('vis:d')

    // Check size of JSON-stringified claims payload
    const payload = JSON.stringify({
      role: 'super_admin',
      perms: codes
    })

    const payloadBytes = Buffer.byteLength(payload, 'utf8')
    // Firebase custom claims hard cap is 1,000 bytes.
    // Our compact short-code array must easily fit (around ~500 bytes, far below 1,000 bytes)
    expect(payloadBytes).toBeLessThanOrEqual(550)
    expect(payloadBytes).toBeLessThan(1000)
  })

  it('decompresses short codes back to full Permissions object accurately', () => {
    const testPerms: UserPermissions = {
      ...EMPTY_PERMISSIONS,
      products: { view: true, add: false, edit: true, delete: false },
      sales: { view: true, add: false, edit: false, delete: false },
      reports: { view: true, export: false },
      customers: {
        view: true,
        add: true,
        edit: false,
        delete: false,
        export: false,
        viewPan: false,
        editPan: true
      },
      visits: {
        view: true,
        add: true,
        edit: false,
        delete: false
      }
    }

    const shortCodes = permissionsToShortCodes(testPerms)
    expect(shortCodes).toContain('cus:v')
    expect(shortCodes).toContain('cus:a')
    expect(shortCodes).toContain('cus:k')
    expect(shortCodes).not.toContain('cus:p')
    expect(shortCodes).toContain('vis:v')
    expect(shortCodes).toContain('vis:a')

    const decompressed = shortCodesToPermissions(shortCodes)

    expect(decompressed.products?.view).toBe(true)
    expect(decompressed.products?.edit).toBe(true)
    expect(decompressed.products?.add).toBe(false)
    expect(decompressed.sales?.view).toBe(true)
    expect(decompressed.reports?.view).toBe(true)
    expect(decompressed.customers?.view).toBe(true)
    expect(decompressed.customers?.add).toBe(true)
    expect(decompressed.customers?.editPan).toBe(true)
    expect(decompressed.customers?.viewPan).toBe(false)
    expect(decompressed.customers?.export).toBe(false)
    expect(decompressed.visits?.view).toBe(true)
    expect(decompressed.visits?.add).toBe(true)
    expect(decompressed.visits?.delete).toBe(false)
  })

  it('encodes an empty permissions set without errors', () => {
    const codes = permissionsToShortCodes(EMPTY_PERMISSIONS)
    expect(codes).toEqual([])

    const decompressed = shortCodesToPermissions([])
    expect(decompressed.products?.view).toBe(false)
    expect(decompressed.customers?.view).toBe(false)
    expect(decompressed.visits?.view).toBe(false)
  })
})

describe('CRM Permissions Migration Logic (scripts/migrate-crm-permissions.mjs)', () => {
  it('correctly identifies legacy non-custom users and adds role-preset CRM blocks', async () => {
    const { computeAdminCrmPermissions, permissionsToShortCodes } = await import(
      '../scripts/migrate-crm-permissions.mjs'
    )

    // Legacy sales_cashier without customers or visits
    const legacyCashier = {
      role: 'sales_cashier',
      displayName: 'Counter Cashier',
      email: 'cashier@a96ventures.com',
      permissions: {
        sales: { view: true, add: true, edit: false, delete: false },
        products: { view: true, add: false, edit: false, delete: false }
      }
    }

    const result = computeAdminCrmPermissions(legacyCashier)
    expect(result.needsMigration).toBe(true)
    expect(result.isCustom).toBe(false)
    expect(result.updatedPermissions.customers).toEqual({
      view: true,
      add: true,
      edit: false,
      delete: false,
      export: false,
      viewPan: false,
      editPan: true
    })
    expect(result.updatedPermissions.visits).toEqual({
      view: true,
      add: true,
      edit: true,
      delete: false
    })

    const shortCodes = permissionsToShortCodes(result.updatedPermissions)
    expect(shortCodes).toContain('cus:v')
    expect(shortCodes).toContain('cus:a')
    expect(shortCodes).toContain('cus:k')
    expect(shortCodes).not.toContain('cus:p')
    expect(shortCodes).toContain('vis:v')
    expect(shortCodes).toContain('vis:a')
    expect(shortCodes).toContain('vis:e')
    expect(shortCodes).not.toContain('vis:d')
  })

  it('correctly handles custom-role users with all-false CRM blocks', async () => {
    const { computeAdminCrmPermissions, permissionsToShortCodes, EMPTY_CUSTOMERS_PERMISSIONS, EMPTY_VISITS_PERMISSIONS } = await import(
      '../scripts/migrate-crm-permissions.mjs'
    )

    const legacyCustomUser = {
      role: 'custom',
      displayName: 'Custom Auditor',
      email: 'auditor@a96ventures.com',
      permissions: {
        reports: { view: true, export: true }
      }
    }

    const result = computeAdminCrmPermissions(legacyCustomUser)
    expect(result.needsMigration).toBe(true)
    expect(result.isCustom).toBe(true)
    expect(result.updatedPermissions.customers).toEqual(EMPTY_CUSTOMERS_PERMISSIONS)
    expect(result.updatedPermissions.visits).toEqual(EMPTY_VISITS_PERMISSIONS)

    // All false blocks produce zero custom/visits short codes
    const shortCodes = permissionsToShortCodes(result.updatedPermissions)
    const crmCodes = shortCodes.filter((c: string) => c.startsWith('cus:') || c.startsWith('vis:'))
    expect(crmCodes).toHaveLength(0)
  })

  it('returns needsMigration = false when both customers and visits blocks already exist', async () => {
    const { computeAdminCrmPermissions } = await import(
      '../scripts/migrate-crm-permissions.mjs'
    )

    const modernAdmin = {
      role: 'store_manager',
      displayName: 'Manager',
      permissions: {
        customers: {
          view: true,
          add: true,
          edit: true,
          delete: false,
          export: false,
          viewPan: true,
          editPan: true
        },
        visits: {
          view: true,
          add: true,
          edit: true,
          delete: false
        }
      }
    }

    const result = computeAdminCrmPermissions(modernAdmin)
    expect(result.needsMigration).toBe(false)
    expect(result.updatedPermissions.customers.viewPan).toBe(true)
  })
})
