"use client"

import React, { createContext, useContext, useMemo } from 'react'
import { AdminUser, UserPermissions } from '@/lib/types'
import { SUPER_ADMIN_PERMISSIONS } from '@/lib/constants/permissions'

interface PermissionsContextValue {
  adminUser: AdminUser | null
  permissions: UserPermissions
  isSuperAdmin: boolean
  hasPermission: (module: keyof UserPermissions, action: string) => boolean
  operatorIdentity: {
    id: string
    name: string
    email: string
  }
}

const PermissionsContext = createContext<PermissionsContextValue>({
  adminUser: null,
  permissions: SUPER_ADMIN_PERMISSIONS,
  isSuperAdmin: true,
  hasPermission: () => true,
  operatorIdentity: { id: 'super_admin', name: 'Super Admin', email: 'admin@a96ventures.com' }
})

export function PermissionsProvider({
  children,
  adminUser
}: {
  children: React.ReactNode
  adminUser: AdminUser | null
}) {
  const isSuperAdmin = adminUser?.role === 'super_admin' || !adminUser

  const permissions = useMemo(() => {
    if (!adminUser) return SUPER_ADMIN_PERMISSIONS
    if (adminUser.role === 'super_admin') return SUPER_ADMIN_PERMISSIONS
    return adminUser.permissions || SUPER_ADMIN_PERMISSIONS
  }, [adminUser])

  const operatorIdentity = useMemo(() => {
    return {
      id: adminUser?.id || 'admin',
      name: adminUser?.displayName || 'Admin',
      email: adminUser?.email || 'admin@a96ventures.com'
    }
  }, [adminUser])

  const hasPermission = useMemo(() => {
    return (module: keyof UserPermissions, action: string): boolean => {
      if (isSuperAdmin) return true
      const modulePerms = permissions[module] as Record<string, boolean> | undefined
      if (!modulePerms) return false
      return Boolean(modulePerms[action])
    }
  }, [isSuperAdmin, permissions])

  const value = useMemo(
    () => ({
      adminUser,
      permissions,
      isSuperAdmin,
      hasPermission,
      operatorIdentity
    }),
    [adminUser, permissions, isSuperAdmin, hasPermission, operatorIdentity]
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
