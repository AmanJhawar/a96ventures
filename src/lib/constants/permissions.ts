import { UserPermissions, UserRole } from '@/lib/types'

export const SUPER_ADMIN_PERMISSIONS: UserPermissions = {
  products: { view: true, add: true, edit: true, delete: true },
  purchases: { view: true, add: true, delete: true },
  movements: {
    view: true,
    transfer: true,
    adjustment: true,
    repair: true,
    melt: true,
    delete: true
  },
  sales: { view: true, add: true, delete: true },
  returns: { view: true, add: true, delete: true },
  inquiries: { view: true, edit: true, delete: true },
  locations: { view: true, add: true, edit: true, delete: true },
  brands: { view: true, add: true, edit: true, delete: true },
  team: { view: true, add: true, edit: true, delete: true },
  portfolio: { view: true, add: true, edit: true, delete: true },
  reports: { view: true, export: true },
  archive: { zeroBalance: true, uploadArchive: true },
  users: { view: true, add: true, edit: true, delete: true }
}

export const STORE_MANAGER_PERMISSIONS: UserPermissions = {
  products: { view: true, add: true, edit: true, delete: false },
  purchases: { view: true, add: true, delete: false },
  movements: {
    view: true,
    transfer: true,
    adjustment: true,
    repair: true,
    melt: true,
    delete: false
  },
  sales: { view: true, add: true, delete: false },
  returns: { view: true, add: true, delete: false },
  inquiries: { view: true, edit: true, delete: false },
  locations: { view: true, add: false, edit: false, delete: false },
  brands: { view: true, add: false, edit: false, delete: false },
  team: { view: true, add: false, edit: false, delete: false },
  portfolio: { view: true, add: false, edit: false, delete: false },
  reports: { view: true, export: true },
  archive: { zeroBalance: false, uploadArchive: false },
  users: { view: true, add: false, edit: false, delete: false }
}

export const SALES_CASHIER_PERMISSIONS: UserPermissions = {
  products: { view: true, add: false, edit: false, delete: false },
  purchases: { view: false, add: false, delete: false },
  movements: {
    view: false,
    transfer: false,
    adjustment: false,
    repair: false,
    melt: false,
    delete: false
  },
  sales: { view: true, add: true, delete: false },
  returns: { view: true, add: true, delete: false },
  inquiries: { view: true, edit: false, delete: false },
  locations: { view: true, add: false, edit: false, delete: false },
  brands: { view: false, add: false, edit: false, delete: false },
  team: { view: false, add: false, edit: false, delete: false },
  portfolio: { view: false, add: false, edit: false, delete: false },
  reports: { view: false, export: false },
  archive: { zeroBalance: false, uploadArchive: false },
  users: { view: false, add: false, edit: false, delete: false }
}

export const VAULT_CUSTODIAN_PERMISSIONS: UserPermissions = {
  products: { view: true, add: true, edit: true, delete: false },
  purchases: { view: true, add: true, delete: false },
  movements: {
    view: true,
    transfer: true,
    adjustment: true,
    repair: true,
    melt: true,
    delete: false
  },
  sales: { view: false, add: false, delete: false },
  returns: { view: false, add: false, delete: false },
  inquiries: { view: false, edit: false, delete: false },
  locations: { view: true, add: false, edit: false, delete: false },
  brands: { view: false, add: false, edit: false, delete: false },
  team: { view: false, add: false, edit: false, delete: false },
  portfolio: { view: false, add: false, edit: false, delete: false },
  reports: { view: false, export: false },
  archive: { zeroBalance: false, uploadArchive: false },
  users: { view: false, add: false, edit: false, delete: false }
}

export const ROLE_PRESETS: Record<UserRole, UserPermissions> = {
  super_admin: SUPER_ADMIN_PERMISSIONS,
  store_manager: STORE_MANAGER_PERMISSIONS,
  sales_cashier: SALES_CASHIER_PERMISSIONS,
  vault_custodian: VAULT_CUSTODIAN_PERMISSIONS,
  custom: STORE_MANAGER_PERMISSIONS
}

export const ROLE_LABELS: Record<UserRole, { label: string; description: string }> = {
  super_admin: {
    label: 'Super Admin',
    description: 'Full uninhibited access across all modules, zero-balance export & user permissions.'
  },
  store_manager: {
    label: 'Store Manager',
    description: 'Manages inventory, stock movements, purchases, and sales; cannot delete core catalogs.'
  },
  sales_cashier: {
    label: 'Sales Cashier',
    description: 'Front-desk point of sale. Records sales, returns, customer inquiries; read-only stock.'
  },
  vault_custodian: {
    label: 'Vault Custodian',
    description: 'Handles purchases, stock transfers, repairs, scrap melts, and physical audits.'
  },
  custom: {
    label: 'Custom Access',
    description: 'Individually selected permissions tailored to specific responsibilities.'
  }
}
