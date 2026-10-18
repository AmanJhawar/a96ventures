import { app } from '@/lib/firebase/config'
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore/lite'
import { AdminUser, UserStatus, UserRole, UserPermissions } from '@/lib/types'
import { ROLE_PRESETS } from '@/lib/constants/permissions'
import { recordAuditLog } from './audit.service'
import { withTimeout } from './utils'

const db = getFirestore(app)
const USERS_COLLECTION = 'admins'

/**
 * Fetch all admin users and operators.
 */
export async function getAdminUsers(): Promise<AdminUser[]> {
  try {
    const querySnapshot = await withTimeout(getDocs(collection(db, USERS_COLLECTION)))
    const items: AdminUser[] = []

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data()
      const role: UserRole = data.role || 'super_admin'
      const defaultPerms = ROLE_PRESETS[role] || ROLE_PRESETS.super_admin

      items.push({
        id: docSnap.id,
        email: data.email || docSnap.id,
        displayName: data.displayName || data.name || data.email?.split('@')[0] || 'Admin',
        phoneNumber: data.phoneNumber || '',
        role: role,
        status: (data.status as UserStatus) || 'active',
        assignedLocationId: data.assignedLocationId || undefined,
        assignedLocationName: data.assignedLocationName || undefined,
        permissions: data.permissions || defaultPerms,
        createdAt: data.createdAt ? (typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString()) : new Date().toISOString(),
        updatedAt: data.updatedAt ? (typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString()) : new Date().toISOString(),
        lastLoginAt: data.lastLoginAt || undefined,
        createdById: data.createdById,
        createdByEmail: data.createdByEmail
      })
    })

    return items.sort((a, b) => a.displayName.localeCompare(b.displayName))
  } catch (err) {
    console.error('Failed to get admin users:', err)
    return []
  }
}

export interface CreateAdminUserParams {
  email: string
  displayName: string
  phoneNumber?: string
  role: UserRole
  status?: UserStatus
  assignedLocationId?: string
  assignedLocationName?: string
  permissions?: UserPermissions
  createdById?: string
  createdByEmail?: string
}

/**
 * Create a new admin operator profile.
 */
export async function createAdminUser(params: CreateAdminUserParams): Promise<string> {
  const emailClean = params.email.trim().toLowerCase()
  const role = params.role
  const perms = params.permissions || ROLE_PRESETS[role] || ROLE_PRESETS.store_manager
  const status = params.status || 'active'
  const now = new Date().toISOString()

  const docRef = await withTimeout(
    addDoc(collection(db, USERS_COLLECTION), {
      email: emailClean,
      displayName: params.displayName.trim(),
      phoneNumber: params.phoneNumber?.trim() || '',
      role: role,
      status: status,
      assignedLocationId: params.assignedLocationId || null,
      assignedLocationName: params.assignedLocationName || null,
      permissions: perms,
      createdAt: now,
      updatedAt: now,
      createdById: params.createdById || '',
      createdByEmail: params.createdByEmail || ''
    })
  )

  // Record Audit
  await recordAuditLog({
    userId: params.createdById,
    userEmail: params.createdByEmail,
    action: 'create',
    entityType: 'user',
    entityId: docRef.id,
    entityName: params.displayName.trim(),
    description: `Created operator account "${params.displayName.trim()}" (${emailClean}) with role ${role}`
  })

  return docRef.id
}

/**
 * Update operator profile or permissions.
 */
export async function updateAdminUser(
  id: string,
  updates: Partial<AdminUser>,
  actor?: { id: string; email: string }
): Promise<void> {
  const docRef = doc(db, USERS_COLLECTION, id)
  const currentSnap = await withTimeout(getDoc(docRef))
  if (!currentSnap.exists()) {
    throw new Error('Operator user not found')
  }

  const existing = currentSnap.data()
  const payload: Record<string, unknown> = {
    updatedAt: new Date().toISOString()
  }

  if (updates.displayName !== undefined) payload.displayName = updates.displayName.trim()
  if (updates.phoneNumber !== undefined) payload.phoneNumber = updates.phoneNumber.trim()
  if (updates.role !== undefined) payload.role = updates.role
  if (updates.status !== undefined) payload.status = updates.status
  if (updates.assignedLocationId !== undefined) payload.assignedLocationId = updates.assignedLocationId || null
  if (updates.assignedLocationName !== undefined) payload.assignedLocationName = updates.assignedLocationName || null
  if (updates.permissions !== undefined) payload.permissions = updates.permissions

  await withTimeout(updateDoc(docRef, payload))

  // Record audit
  await recordAuditLog({
    userId: actor?.id,
    userEmail: actor?.email,
    action: 'update',
    entityType: 'user',
    entityId: id,
    entityName: updates.displayName || existing.displayName || existing.email,
    description: `Updated profile & permissions for operator "${updates.displayName || existing.displayName || id}"`
  })
}

/**
 * Delete an operator account.
 */
export async function deleteAdminUser(
  id: string,
  actor?: { id: string; email: string }
): Promise<void> {
  const docRef = doc(db, USERS_COLLECTION, id)
  const snap = await withTimeout(getDoc(docRef))
  const data = snap.exists() ? snap.data() : null

  await withTimeout(deleteDoc(docRef))

  // Record audit
  await recordAuditLog({
    userId: actor?.id,
    userEmail: actor?.email,
    action: 'delete',
    entityType: 'user',
    entityId: id,
    entityName: data?.displayName || data?.email || id,
    description: `Deleted operator account "${data?.displayName || data?.email || id}"`
  })
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
