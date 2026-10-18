import { auth } from '@/lib/firebase/auth'
import { AdminUser, UserStatus, UserRole, UserPermissions } from '@/lib/types'

async function getAuthHeaders(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser
  if (!currentUser) {
    throw new Error('Authentication required')
  }
  const token = await currentUser.getIdToken()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  }
}

/**
 * Fetch all admin users via the server Admin API.
 */
export async function getAdminUsers(): Promise<AdminUser[]> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/admin/users', {
      method: 'GET',
      headers
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || `Failed to fetch users (${res.status})`)
    }

    const data = await res.json()
    return data.users || []
  } catch (err) {
    console.error('Failed to get admin users:', err)
    return []
  }
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
  temporaryPassword?: string
}

/**
 * Create a new admin user profile through Firebase Admin on the server.
 * Returns the newly created user ID and any temporary password generated.
 */
export async function createAdminUser(params: CreateAdminUserParams): Promise<CreateUserResult> {
  const headers = await getAuthHeaders()
  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers,
    body: JSON.stringify(params)
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.error || `Failed to create user (${res.status})`)
  }

  const data = await res.json()
  return {
    id: data.user?.id || data.id,
    temporaryPassword: data.temporaryPassword
  }
}

/**
 * Update user profile, credentials, role, status or permissions via the server Admin API.
 */
export async function updateAdminUser(
  id: string,
  updates: Partial<AdminUser> & { password?: string },
  _actor?: { id: string; email: string }
): Promise<void> {
  const headers = await getAuthHeaders()
  const res = await fetch('/api/admin/users', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ id, ...updates })
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.error || `Failed to update user (${res.status})`)
  }
}

/**
 * Delete a user account via the server Admin API.
 */
export async function deleteAdminUser(
  id: string,
  _actor?: { id: string; email: string }
): Promise<void> {
  const headers = await getAuthHeaders()
  const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.error || `Failed to delete user (${res.status})`)
  }
}

/**
 * Quick toggle status between active and suspended.
 */
export async function updateUserStatus(
  id: string,
  status: UserStatus,
  actor?: { id: string; email: string }
): Promise<void> {
  await updateAdminUser(id, { status }, actor)
}
