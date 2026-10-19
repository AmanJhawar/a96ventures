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

    // Check size of JSON-stringified claims payload
    const payload = JSON.stringify({
      role: 'super_admin',
      perms: codes
    })

    const payloadBytes = Buffer.byteLength(payload, 'utf8')
    // Firebase custom claims hard cap is 1000 bytes.
    // Our compact short-code array must easily fit (400 bytes vs 851 bytes previously)
    expect(payloadBytes).toBeLessThanOrEqual(400)
    expect(payloadBytes).toBeLessThan(1000)
  })

  it('decompresses short codes back to full Permissions object accurately', () => {
    const testPerms: UserPermissions = {
      ...EMPTY_PERMISSIONS,
      products: { view: true, add: false, edit: true, delete: false },
      sales: { view: true, add: false, delete: false },
      reports: { view: true, export: false }
    }

    const shortCodes = permissionsToShortCodes(testPerms)
    const decompressed = shortCodesToPermissions(shortCodes)

    expect(decompressed.products?.view).toBe(true)
    expect(decompressed.products?.edit).toBe(true)
    expect(decompressed.products?.add).toBe(false)
    expect(decompressed.sales?.view).toBe(true)
    expect(decompressed.sales?.add).toBe(false)
    expect(decompressed.reports?.view).toBe(true)
    expect(decompressed.reports?.export).toBe(false)
  })

  it('encodes an empty permissions set without errors', () => {
    const codes = permissionsToShortCodes(EMPTY_PERMISSIONS)
    expect(codes).toEqual([])

    const decompressed = shortCodesToPermissions([])
    expect(decompressed.products?.view).toBe(false)
  })
})
