"use client"

import React, { createContext, useContext, useMemo } from 'react'
import { AdminUser, UserPermissions } from '@/lib/types'
import { EMPTY_PERMISSIONS, SUPER_ADMIN_PERMISSIONS } from '@/lib/constants/permissions'

interface PermissionsContextValue {
  adminUser: AdminUser | null
  permissions: UserPermissions
  isSuperAdmin: boolean
  hasPermission: (module: keyof UserPermissions, action: string) => boolean
  userIdentity: {
    id: string
    name: string
    email: string
  }
  operatorIdentity: {
    id: string
    name: string
    email: string
  }
}

// Strict Default Deny: Unauthenticated or uninitialized contexts have zero privileges
const PermissionsContext = createContext<PermissionsContextValue>({
  adminUser: null,
  permissions: EMPTY_PERMISSIONS,
  isSuperAdmin: false,
  hasPermission: () => false,
  userIdentity: { id: '', name: 'Unauthorized', email: '' },
  operatorIdentity: { id: '', name: 'Unauthorized', email: '' }
})

export function PermissionsProvider({
  children,
  adminUser
}: {
  children: React.ReactNode
  adminUser: AdminUser | null
}) {
  // Root admin profile (super_admin) retains full super admin privileges. Missing role never grants access.
  const isSuperAdmin = Boolean(
    adminUser &&
    adminUser.status === 'active' &&
    adminUser.role === 'super_admin'
  )

  const permissions = useMemo(() => {
    if (!adminUser || adminUser.status !== 'active') return EMPTY_PERMISSIONS
    if (isSuperAdmin) return SUPER_ADMIN_PERMISSIONS
    return adminUser.permissions || EMPTY_PERMISSIONS
  }, [adminUser, isSuperAdmin])

  const userIdentity = useMemo(() => {
    return {
      id: adminUser?.id || '',
      name: adminUser?.displayName || 'Anonymous User',
      email: adminUser?.email || ''
    }
  }, [adminUser])

  const hasPermission = useMemo(() => {
    return (module: keyof UserPermissions, action: string): boolean => {
      // Default deny for inactive or null users
      if (!adminUser || adminUser.status !== 'active') return false
      // Super admin has full access across all operations
      if (isSuperAdmin) return true

      const modulePerms = permissions[module] as Record<string, boolean> | undefined
      if (!modulePerms) return false
      return Boolean(modulePerms[action])
    }
  }, [adminUser, isSuperAdmin, permissions])

  const value = useMemo(
    () => ({
      adminUser,
      permissions,
      isSuperAdmin,
      hasPermission,
      userIdentity,
      operatorIdentity: userIdentity
    }),
    [adminUser, permissions, isSuperAdmin, hasPermission, userIdentity]
  )

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
}

export function usePermissions() {
  return useContext(PermissionsContext)
}

/**
 * Guard component that renders children only if the logged-in user possesses the required permission.
 */
export function PermissionGate({
  module,
  action,
  fallback = null,
  children
}: {
  module: keyof UserPermissions
  action: string
  fallback?: React.ReactNode
  children: React.ReactNode
}) {
  const { hasPermission } = usePermissions()
  if (!hasPermission(module, action)) {
    return <>{fallback}</>
  }
  return <>{children}</>
}
