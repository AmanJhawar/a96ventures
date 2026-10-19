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
    emailSent: data.emailSent
  }
}

/**
 * Trigger sending a password setup / reset email link to a user.
 */
export async function sendPasswordResetEmail(id: string): Promise<boolean> {
  const headers = await getAuthHeaders()
  const res = await fetch('/api/admin/users', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ id, sendPasswordResetEmail: true })
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.error || `Failed to send reset email (${res.status})`)
  }

  const data = await res.json()
  return Boolean(data.emailSent)
}

/**
 * Update user profile, credentials, role, status or permissions via the server Admin API.
 */
export async function updateAdminUser(
  id: string,
  updates: Partial<AdminUser> & { password?: string }
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
export async function deleteAdminUser(id: string): Promise<void> {
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
  status: UserStatus
): Promise<void> {
  await updateAdminUser(id, { status })
}
