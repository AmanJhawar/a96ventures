import { UserPermissions, UserRole } from '@/lib/types'

export const EMPTY_PERMISSIONS: UserPermissions = {
  products: { view: false, add: false, edit: false, delete: false },
  purchases: { view: false, add: false, edit: false, delete: false },
  movements: {
    view: false,
    transfer: false,
    adjustment: false,
    repair: false,
    melt: false,
    delete: false
  },
  sales: { view: false, add: false, edit: false, delete: false },
  returns: { view: false, add: false, delete: false },
  inquiries: { view: false, edit: false, delete: false },
  locations: { view: false, add: false, edit: false, delete: false },
  brands: { view: false, add: false, edit: false, delete: false },
  team: { view: false, add: false, edit: false, delete: false },
  portfolio: { view: false, add: false, edit: false, delete: false },
  reports: { view: false, export: false },
  archive: { zeroBalance: false, uploadArchive: false },
  users: { view: false, add: false, edit: false, delete: false },
  customers: {
    view: false,
    add: false,
    edit: false,
    delete: false,
    export: false,
    viewPan: false,
    editPan: false
  },
  visits: { view: false, add: false, edit: false, delete: false }
}

export const SUPER_ADMIN_PERMISSIONS: UserPermissions = {
  products: { view: true, add: true, edit: true, delete: true },
  purchases: { view: true, add: true, edit: true, delete: true },
  movements: {
    view: true,
    transfer: true,
    adjustment: true,
    repair: true,
    melt: true,
    delete: true
  },
  sales: { view: true, add: true, edit: true, delete: true },
  returns: { view: true, add: true, delete: true },
  inquiries: { view: true, edit: true, delete: true },
  locations: { view: true, add: true, edit: true, delete: true },
  brands: { view: true, add: true, edit: true, delete: true },
  team: { view: true, add: true, edit: true, delete: true },
  portfolio: { view: true, add: true, edit: true, delete: true },
  reports: { view: true, export: true },
  archive: { zeroBalance: true, uploadArchive: true },
  users: { view: true, add: true, edit: true, delete: true },
  customers: {
    view: true,
    add: true,
    edit: true,
    delete: true,
    export: true,
    viewPan: true,
    editPan: true
  },
  visits: { view: true, add: true, edit: true, delete: true }
}

export const STORE_MANAGER_PERMISSIONS: UserPermissions = {
  products: { view: true, add: true, edit: true, delete: false },
  purchases: { view: true, add: true, edit: true, delete: false },
  movements: {
    view: true,
    transfer: true,
    adjustment: true,
    repair: true,
    melt: true,
    delete: false
  },
  sales: { view: true, add: true, edit: true, delete: false },
  returns: { view: true, add: true, delete: false },
  inquiries: { view: true, edit: true, delete: false },
  locations: { view: true, add: false, edit: false, delete: false },
  brands: { view: true, add: false, edit: false, delete: false },
  team: { view: true, add: false, edit: false, delete: false },
  portfolio: { view: true, add: false, edit: false, delete: false },
  reports: { view: true, export: true },
  archive: { zeroBalance: false, uploadArchive: false },
  users: { view: true, add: false, edit: false, delete: false },
  customers: {
    view: true,
    add: true,
    edit: true,
    delete: false,
    export: false,
    viewPan: true,
    editPan: true
  },
  visits: { view: true, add: true, edit: true, delete: false }
}

export const SALES_CASHIER_PERMISSIONS: UserPermissions = {
  products: { view: true, add: false, edit: false, delete: false },
  purchases: { view: false, add: false, edit: false, delete: false },
  movements: {
    view: false,
    transfer: false,
    adjustment: false,
    repair: false,
    melt: false,
    delete: false
  },
  sales: { view: true, add: true, edit: false, delete: false },
  returns: { view: true, add: true, delete: false },
  inquiries: { view: true, edit: false, delete: false },
  locations: { view: true, add: false, edit: false, delete: false },
  brands: { view: false, add: false, edit: false, delete: false },
  team: { view: false, add: false, edit: false, delete: false },
  portfolio: { view: false, add: false, edit: false, delete: false },
  reports: { view: false, export: false },
  archive: { zeroBalance: false, uploadArchive: false },
  users: { view: false, add: false, edit: false, delete: false },
  customers: {
    view: true,
    add: true,
    edit: false,
    delete: false,
    export: false,
    viewPan: false,
    editPan: true
  },
  visits: { view: true, add: true, edit: false, delete: false }
}

export const VAULT_CUSTODIAN_PERMISSIONS: UserPermissions = {
  products: { view: true, add: true, edit: true, delete: false },
  purchases: { view: true, add: true, edit: true, delete: false },
  movements: {
    view: true,
    transfer: true,
    adjustment: true,
    repair: true,
    melt: true,
    delete: false
  },
  sales: { view: false, add: false, edit: false, delete: false },
  returns: { view: false, add: false, delete: false },
  inquiries: { view: false, edit: false, delete: false },
  locations: { view: true, add: false, edit: false, delete: false },
  brands: { view: false, add: false, edit: false, delete: false },
  team: { view: false, add: false, edit: false, delete: false },
  portfolio: { view: false, add: false, edit: false, delete: false },
  reports: { view: false, export: false },
  archive: { zeroBalance: false, uploadArchive: false },
  users: { view: false, add: false, edit: false, delete: false },
  customers: {
    view: false,
    add: false,
    edit: false,
    delete: false,
    export: false,
    viewPan: false,
    editPan: false
  },
  visits: { view: false, add: false, edit: false, delete: false }
}

export const ROLE_PRESETS: Record<UserRole, UserPermissions> = {
  super_admin: SUPER_ADMIN_PERMISSIONS,
  store_manager: STORE_MANAGER_PERMISSIONS,
  sales_cashier: SALES_CASHIER_PERMISSIONS,
  vault_custodian: VAULT_CUSTODIAN_PERMISSIONS,
  custom: EMPTY_PERMISSIONS
}

export const ROLE_LABELS: Record<UserRole, { label: string; description: string }> = {
  super_admin: {
    label: 'Super Admin',
    description: 'Full unrestricted access across all modules, fiscal closing, and user management.'
  },
  store_manager: {
    label: 'Store Manager',
    description: 'Inventory, purchases, sales, and movements; cannot delete core catalog items.'
  },
  sales_cashier: {
    label: 'Sales Cashier',
    description: 'Point of sale operations, customer returns, and read-only inventory.'
  },
  vault_custodian: {
    label: 'Vault Custodian',
    description: 'Purchases, transfers, repairs, scrap melts, and physical audits.'
  },
  custom: {
    label: 'Custom Access',
    description: 'Customized permission set tailored to specific staff responsibilities.'
  }
}

export const MODULE_SHORT_CODES: Record<keyof UserPermissions, string> = {
  products: 'prd',
  purchases: 'pur',
  movements: 'mov',
  sales: 'sal',
  returns: 'ret',
  inquiries: 'inq',
  locations: 'loc',
  brands: 'brd',
  team: 'tem',
  portfolio: 'prt',
  reports: 'rep',
  archive: 'arc',
  users: 'usr',
  customers: 'cus',
  visits: 'vis'
}

export const ACTION_SHORT_CODES: Record<string, string> = {
  view: 'v',
  add: 'a',
  edit: 'e',
  delete: 'd',
  transfer: 't',
  adjustment: 'j',
  repair: 'r',
  melt: 'm',
  export: 'x',
  zeroBalance: 'z',
  uploadArchive: 'u',
  viewPan: 'p',
  editPan: 'k'
}

export const SHORT_TO_MODULE: Record<string, keyof UserPermissions> = Object.fromEntries(
  Object.entries(MODULE_SHORT_CODES).map(([k, v]) => [v, k as keyof UserPermissions])
)

export const SHORT_TO_ACTION: Record<string, string> = Object.fromEntries(
  Object.entries(ACTION_SHORT_CODES).map(([k, v]) => [v, k])
)

/**
 * Compresses UserPermissions to an array of short codes for granted permissions only (e.g. ['prd:v', 'sal:v']).
 * Minimizes Firebase Custom Claims footprint from ~851 bytes down to ~50-120 bytes, far below the 1,000-byte token limit.
 */
export function permissionsToShortCodes(permissions: UserPermissions): string[] {
  const codes: string[] = []
  if (!permissions || typeof permissions !== 'object') return codes

  for (const [moduleKey, actions] of Object.entries(permissions)) {
    const modCode = MODULE_SHORT_CODES[moduleKey as keyof UserPermissions] || moduleKey
    if (actions && typeof actions === 'object') {
      for (const [actionKey, isGranted] of Object.entries(actions as Record<string, boolean>)) {
        if (isGranted === true) {
          const actCode = ACTION_SHORT_CODES[actionKey] || actionKey
          codes.push(`${modCode}:${actCode}`)
        }
      }
    }
  }
  return codes
}

/**
 * Reconstructs a full UserPermissions object from an array of short codes.
 */
export function shortCodesToPermissions(codes: string[]): UserPermissions {
  const result: UserPermissions = JSON.parse(JSON.stringify(EMPTY_PERMISSIONS))
  if (!Array.isArray(codes)) return result

  for (const code of codes) {
    if (typeof code !== 'string') continue
    const [modCode, actCode] = code.split(':')
    const moduleKey = SHORT_TO_MODULE[modCode] || (modCode as keyof UserPermissions)
    const actionKey = SHORT_TO_ACTION[actCode] || actCode

    if (result[moduleKey] && typeof (result[moduleKey] as Record<string, boolean>)[actionKey] === 'boolean') {
      (result[moduleKey] as Record<string, boolean>)[actionKey] = true
    }
  }
  return result
}
