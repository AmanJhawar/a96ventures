import { app } from '@/lib/firebase/config'
import { auth } from '@/lib/firebase/auth'
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  limit
} from 'firebase/firestore/lite'
import { AuditLogEntry, AuditActionType } from '@/lib/types'
import { withTimeout } from './utils'

const db = getFirestore(app)
const AUDIT_COLLECTION = 'audit_logs'

export interface RecordAuditParams {
  userId?: string
  userName?: string
  userEmail?: string
  action: AuditActionType
  entityType: AuditLogEntry['entityType']
  entityId: string
  entityName?: string
  locationId?: string
  locationName?: string
  description: string
  diffs?: AuditLogEntry['diffs']
  metadata?: Record<string, unknown>
}

function toIsoString(ts: unknown): string {
  if (!ts) return new Date().toISOString()
  if (typeof ts === 'string') return ts
  if (typeof ts === 'object' && ts !== null) {
    if ('toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
      return (ts as { toDate: () => Date }).toDate().toISOString()
    }
    if ('_seconds' in ts) {
      return new Date((ts as { _seconds: number })._seconds * 1000).toISOString()
    }
  }
  return new Date().toISOString()
}

/**
 * Record an immutable audit log entry via server code (or client fallback).
 * Server route uses Firebase Admin SDK with elevated privileges.
 */
export async function recordAuditLog(params: RecordAuditParams): Promise<string> {
  try {
    const currentUser = auth.currentUser
    if (currentUser) {
      const token = await currentUser.getIdToken()
      const res = await fetch('/api/admin/audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(params)
      })
      if (res.ok) {
        const data = await res.json()
        return data.id || ''
      }
    }

    // Client fallback if offline or pre-auth
    const verifiedName = currentUser?.displayName || (currentUser?.email ? currentUser.email.split('@')[0] : 'Admin')
    const docRef = await addDoc(collection(db, AUDIT_COLLECTION), {
      userId: currentUser?.uid || params.userId || 'admin',
      userName: verifiedName,
      userEmail: currentUser?.email || params.userEmail || 'admin@a96ventures.com',
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      entityName: params.entityName || '',
      locationId: params.locationId || '',
      locationName: params.locationName || '',
      description: params.description,
      diffs: params.diffs || [],
      metadata: params.metadata || {},
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp()
    })
    return docRef.id
  } catch (err) {
    console.error('Failed to write audit log:', err)
    return ''
  }
}

export interface GetAuditLogsFilter {
  userId?: string
  entityType?: string
  action?: string
  limitCount?: number
  page?: number
}

/**
 * Fetch audit logs via server code or client query.
 */
export async function getAuditLogs(filters?: GetAuditLogsFilter): Promise<AuditLogEntry[]> {
  try {
    const currentUser = auth.currentUser
    if (currentUser) {
      const token = await currentUser.getIdToken()
      const params = new URLSearchParams()
      if (filters?.limitCount) params.set('limit', String(filters.limitCount))
      if (filters?.page) params.set('page', String(filters.page))
      if (filters?.userId && filters.userId !== 'all') params.set('userId', filters.userId)
      if (filters?.entityType && filters.entityType !== 'all') params.set('entityType', filters.entityType)
      if (filters?.action && filters.action !== 'all') params.set('action', filters.action)

      const res = await fetch(`/api/admin/audit?${params.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      if (res.ok) {
        const data = await res.json()
        if (data.logs) return data.logs
      }
    }

    const maxItems = filters?.limitCount || 200
    const colRef = collection(db, AUDIT_COLLECTION)

    const querySnapshot = await withTimeout(
      getDocs(query(colRef, limit(maxItems)))
    )

    const items: AuditLogEntry[] = []
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data()
      items.push({
        id: docSnap.id,
        userId: data.userId || '',
        userName: data.userName || (data.userEmail ? String(data.userEmail).split('@')[0] : 'Admin User'),
        userEmail: data.userEmail || '',
        action: data.action || 'update',
        entityType: data.entityType || 'product',
        entityId: data.entityId || '',
        entityName: data.entityName,
        locationId: data.locationId,
        locationName: data.locationName,
        description: data.description || '',
        diffs: data.diffs || [],
        timestamp: toIsoString(data.timestamp || data.createdAt),
        metadata: data.metadata
      })
    })

    // Filter in-memory
    let filtered = items
    if (filters?.userId && filters.userId !== 'all') {
      filtered = filtered.filter((i) => i.userId === filters.userId)
    }
    if (filters?.entityType && filters.entityType !== 'all') {
      filtered = filtered.filter((i) => i.entityType === filters.entityType)
    }
    if (filters?.action && filters.action !== 'all') {
      filtered = filtered.filter((i) => i.action === filters.action)
    }

    return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  } catch (err) {
    console.error('Failed to get audit logs:', err)
    return []
  }
}
