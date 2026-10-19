import { app } from '@/lib/firebase/config'
import { auth } from '@/lib/firebase/auth'
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore/lite'
import { AdminUser, UserStatus, UserRole, UserPermissions } from '@/lib/types'

const db = getFirestore(app)

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

function cleanUndefined<T>(value: T): T {
  if (value === null || value === undefined) {
    return value
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => cleanUndefined(item)) as unknown as T
  }
  if (typeof value === 'object' && !(value instanceof Date)) {
    const res: Record<string, any> = {}
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) {
        res[k] = cleanUndefined(v)
      }
    }
    return res as T
  }
  return value
}

function toIsoString(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number') {
    const d = new Date(val)
    return isNaN(d.getTime()) ? '' : d.toISOString()
  }
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? '' : val.toISOString()
  }
  if (typeof val === 'object' && val !== null) {
    if ('toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
      try {
        const d = (val as { toDate: () => Date }).toDate()
        return isNaN(d.getTime()) ? '' : d.toISOString()
      } catch {
        // ignore
      }
    }
    if ('toMillis' in val && typeof (val as { toMillis: () => number }).toMillis === 'function') {
      try {
        const d = new Date((val as { toMillis: () => number }).toMillis())
        return isNaN(d.getTime()) ? '' : d.toISOString()
      } catch {
        // ignore
      }
    }
    if ('seconds' in val && typeof (val as { seconds: number }).seconds === 'number') {
      const d = new Date((val as { seconds: number }).seconds * 1000)
      return isNaN(d.getTime()) ? '' : d.toISOString()
    }
    if ('_seconds' in val && typeof (val as { _seconds: number })._seconds === 'number') {
      const d = new Date((val as { _seconds: number })._seconds * 1000)
      return isNaN(d.getTime()) ? '' : d.toISOString()
    }
  }
  return String(val || '')
}

/**
 * Fetch all admin users via the server Admin API with client Firestore fallback.
 */
export async function getAdminUsers(): Promise<AdminUser[]> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/admin/users', {
      method: 'GET',
      headers
    })

    if (res.ok) {
      const data = await res.json()
      return data.users || []
    }
  } catch (apiErr) {
    console.warn('Users API failed, falling back to direct Firestore:', apiErr)
  }

  // Client Firestore fallback
  const now = new Date().toISOString()
  const defaultPermissions: UserPermissions = {
    products: { view: true, add: false, edit: false, delete: false },
    purchases: { view: false, add: false, delete: false },
    movements: { view: false, transfer: false, adjustment: false, repair: false, melt: false, delete: false },
    sales: { view: false, add: false, delete: false },
    returns: { view: false, add: false, delete: false },
    inquiries: { view: false, edit: false, delete: false },
    locations: { view: false, add: false, edit: false, delete: false },
    brands: { view: false, add: false, edit: false, delete: false },
    team: { view: false, add: false, edit: false, delete: false },
    portfolio: { view: false, add: false, edit: false, delete: false },
    reports: { view: false, export: false },
    archive: { zeroBalance: false, uploadArchive: false },
    users: { view: false, add: false, edit: false, delete: false }
  }

  const snap = await getDocs(collection(db, 'admins'))
  const users: AdminUser[] = []
  snap.forEach((d) => {
    const data = d.data()
    users.push({
      id: d.id,
      email: data.email || '',
      displayName: data.displayName || data.name || '',
      role: data.role || 'staff',
      status: data.status || 'active',
      assignedLocationId: data.assignedLocationId || undefined,
      assignedLocationName: data.assignedLocationName || undefined,
      permissions: data.permissions || defaultPermissions,
      phoneNumber: data.phoneNumber || undefined,
      createdAt: toIsoString(data.createdAt) || now,
      updatedAt: toIsoString(data.updatedAt) || now,
      lastLoginAt: data.lastLoginAt ? toIsoString(data.lastLoginAt) : undefined
    })
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
 * Update user profile, credentials, role, status or permissions via the server Admin API with client Firestore fallback.
 */
export async function updateAdminUser(
  id: string,
  updates: Partial<AdminUser> & { password?: string }
): Promise<void> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/admin/users', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ id, ...updates })
    })

    if (res.ok) return

    if (res.status === 400) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || `Failed to update user (${res.status})`)
    }
  } catch (apiErr: any) {
    if (apiErr?.message && !apiErr.message.includes('(500)') && !apiErr.message.includes('(502)') && !apiErr.message.includes('fetch')) {
      throw apiErr
    }
    console.warn('Update user API failed, falling back to direct Firestore:', apiErr)
  }

  // Client Firestore fallback
  const cleanUpdates = cleanUndefined({ ...updates })
  delete cleanUpdates.password
  await updateDoc(doc(db, 'admins', id), cleanUndefined({
    ...cleanUpdates,
    updatedAt: new Date().toISOString()
  }))
}

/**
 * Delete a user account via the server Admin API with client Firestore fallback.
 */
export async function deleteAdminUser(id: string): Promise<void> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers
    })

    if (res.ok) return

    if (res.status === 400) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || `Failed to delete user (${res.status})`)
    }
  } catch (apiErr: any) {
    if (apiErr?.message && !apiErr.message.includes('(500)') && !apiErr.message.includes('(502)') && !apiErr.message.includes('fetch')) {
      throw apiErr
    }
    console.warn('Delete user API failed, falling back to direct Firestore:', apiErr)
  }

  // Client Firestore fallback
  await deleteDoc(doc(db, 'admins', id))
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
