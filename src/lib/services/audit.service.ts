import { app } from '@/lib/firebase/config'
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  where
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

/**
 * Record an immutable audit log entry in Firestore.
 * Automatically injects ISO timestamp and server timestamp.
 */
export async function recordAuditLog(params: RecordAuditParams): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, AUDIT_COLLECTION), {
      userId: params.userId || 'system',
      userName: params.userName || 'System User',
      userEmail: params.userEmail || 'admin@a96ventures.com',
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      entityName: params.entityName || '',
      locationId: params.locationId || '',
      locationName: params.locationName || '',
      description: params.description,
      diffs: params.diffs || [],
      metadata: params.metadata || {},
      timestamp: new Date().toISOString(),
      createdAt: serverTimestamp()
    })
    return docRef.id
  } catch (err) {
    // Non-blocking fallback: never fail user operations due to audit failure, but log to console
    console.error('Failed to write audit log:', err)
    return ''
  }
}

export interface GetAuditLogsFilter {
  userId?: string
  entityType?: string
  action?: string
  limitCount?: number
}

/**
 * Fetch audit logs sorted by timestamp descending.
 */
export async function getAuditLogs(filters?: GetAuditLogsFilter): Promise<AuditLogEntry[]> {
  try {
    const maxItems = filters?.limitCount || 200
    const colRef = collection(db, AUDIT_COLLECTION)

    // Using client-side filter sorting to prevent complex index requirement errors in Firestore
    const querySnapshot = await withTimeout(
      getDocs(query(colRef, limit(maxItems)))
    )

    const items: AuditLogEntry[] = []
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data()
      items.push({
        id: docSnap.id,
        userId: data.userId || '',
        userName: data.userName || 'Unknown User',
        userEmail: data.userEmail || '',
        action: data.action || 'update',
        entityType: data.entityType || 'product',
        entityId: data.entityId || '',
        entityName: data.entityName,
        locationId: data.locationId,
        locationName: data.locationName,
        description: data.description || '',
        diffs: data.diffs || [],
        timestamp: data.timestamp || new Date().toISOString(),
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

    // Sort descending by timestamp
    return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  } catch (err) {
    console.error('Failed to get audit logs:', err)
    return []
  }
}
