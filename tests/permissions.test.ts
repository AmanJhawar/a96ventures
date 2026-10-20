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
    // Our compact short-code array must easily fit (under 500 bytes)
    expect(payloadBytes).toBeLessThanOrEqual(500)
    expect(payloadBytes).toBeLessThan(1000)
  })

  it('decompresses short codes back to full Permissions object accurately', () => {
    const testPerms: UserPermissions = {
      ...EMPTY_PERMISSIONS,
      products: { view: true, add: false, edit: true, delete: false },
      sales: { view: true, add: false, delete: false },
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
