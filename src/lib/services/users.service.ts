import { apiClient, ApiError } from '@/lib/api-client'
import { db } from '@/lib/firebase/config'
import { collection, getDocs } from 'firebase/firestore/lite'
import { AdminUser, UserStatus, UserRole, UserPermissions } from '@/lib/types'

function shouldFallback(err: unknown): boolean {
  if (err instanceof Error && err.message === 'Authentication required') {
    return false
  }
  if (err instanceof ApiError) {
    return err.status >= 500 || err.status === 0
  }
  return true
}

/**
 * Fetch all admin users via the server Admin API.
 */
export async function getAdminUsers(): Promise<AdminUser[]> {
  try {
    const data = await apiClient.get<{ success: boolean; users: AdminUser[] }>('/api/admin/users', undefined, {
      actionName: 'fetch admin users'
    })
    if (data?.users) {
      return (data.users || []).sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || '')))
    }
  } catch (err) {
    if (!shouldFallback(err)) throw err
    console.warn('Admin users API failed, falling back to direct Firestore:', err)
  }

  // Client Firestore fallback
  const snap = await getDocs(collection(db, 'admins'))
  const users: AdminUser[] = []
  snap.forEach((d) => {
    users.push({ id: d.id, ...d.data() } as AdminUser)
  })
  return users.sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || '')))
}

export interface CreateAdminUserParams {
  email: string
  displayName: string
  password?: string
  phoneNumber?: string
  role: UserRole
  status?: UserStatus
  assignedLocationId?: string
  assignedLocationName?: string
  permissions?: UserPermissions
  createdById?: string
  createdByEmail?: string
}

export interface CreateUserResult {
  id: string
  emailSent?: boolean
}

/**
 * Create a new admin user profile through Firebase Admin on the server.
 * Returns the newly created user ID and confirmation of password link email.
 */
export async function createAdminUser(params: CreateAdminUserParams): Promise<CreateUserResult> {
  const data = await apiClient.post<{ user?: { id: string }; id?: string; emailSent?: boolean }>(
    '/api/admin/users',
    params,
    { actionName: 'create admin user' }
  )
  return {
    id: data.user?.id || data.id || '',
    emailSent: data.emailSent
  }
}

/**
 * Trigger sending a password setup / reset email link to a user.
 */
export async function sendPasswordResetEmail(id: string): Promise<boolean> {
  const data = await apiClient.put<{ success: boolean; emailSent?: boolean }>(
    '/api/admin/users',
    { id, sendPasswordResetEmail: true },
    { actionName: 'send reset email' }
  )
  return Boolean(data.emailSent)
}

/**
 * Update user profile, credentials, role, status or permissions via the server Admin API.
 */
export async function updateAdminUser(
  id: string,
  updates: Partial<AdminUser> & { password?: string }
): Promise<void> {
  await apiClient.put('/api/admin/users', { id, ...updates }, { actionName: 'update admin user' })
}

/**
 * Delete a user account via the server Admin API.
 */
export async function deleteAdminUser(id: string): Promise<void> {
  await apiClient.delete('/api/admin/users', { id }, { actionName: 'delete admin user' })
}

/**
 * Quick toggle status between active and suspended.
 */
export async function updateUserStatus(
  id: string,
  status: UserStatus
): Promise<void> {
  await updateAdminUser(id, { status })
}
