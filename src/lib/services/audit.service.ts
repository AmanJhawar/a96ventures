import { app } from '@/lib/firebase/config'
import { auth } from '@/lib/firebase/auth'
import {
  getFirestore,
  collection,
  getDocs,
  addDoc
} from 'firebase/firestore/lite'
import { AuditLogEntry, AuditActionType } from '@/lib/types'

const db = getFirestore(app)

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
  } catch (err) {
    console.warn('Failed to write audit log via server, falling back to client:', err)
  }

  // Client Firestore fallback
  try {
    const currentUser = auth.currentUser
    const now = new Date().toISOString()
    const docRef = await addDoc(collection(db, 'audit_logs'), cleanUndefined({
      timestamp: now,
      createdAt: now,
      userId: params.userId || currentUser?.uid || '',
      userEmail: params.userEmail || currentUser?.email || '',
      userName: params.userName || currentUser?.displayName || 'Admin',
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      entityName: params.entityName || '',
      locationId: params.locationId || '',
      locationName: params.locationName || '',
      description: params.description,
      diffs: params.diffs || [],
      metadata: params.metadata || {}
    }))
    return docRef.id
  } catch (clientErr) {
    console.warn('Client audit log write failed:', clientErr)
    return ''
  }
}

export interface GetAuditLogsFilter {
  userId?: string
  entityType?: string
  action?: string
  limitCount?: number
  page?: number
  isExport?: boolean
}

/**
 * Exports the complete audit trail from the server as CSV or JSON and downloads the file.
 */
export async function exportFullAuditTrail(options?: {
  format?: 'csv' | 'json'
  entityType?: string
  action?: string
}): Promise<{ count: number }> {
  const currentUser = auth.currentUser
  const token = currentUser ? await currentUser.getIdToken() : ''
  const format = options?.format || 'csv'
  const params = new URLSearchParams({ format })
  if (options?.entityType && options.entityType !== 'all') params.set('entityType', options.entityType)
  if (options?.action && options.action !== 'all') params.set('action', options.action)

  const res = await fetch(`/api/admin/audit/export?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to export audit trail (${res.status})`)
  }

  const countHeader = res.headers.get('X-Total-Count')
  const count = countHeader ? parseInt(countHeader, 10) : 0

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  a.download = `a96-audit-trail-${dateStr}.${format}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return { count }
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
 * Fetch audit logs via server code or client query.
 */
export async function getAuditLogs(filters?: GetAuditLogsFilter): Promise<AuditLogEntry[]> {
  try {
    const currentUser = auth.currentUser
    if (currentUser) {
      const token = await currentUser.getIdToken()
      const params = new URLSearchParams()
      if (filters?.isExport) params.set('export', 'true')
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
        const rawLogs: AuditLogEntry[] = data.logs || []
        return rawLogs.map((log) => ({
          ...log,
          timestamp: toIsoString(log.timestamp) || new Date().toISOString()
        }))
      }
    }
  } catch (apiErr) {
    console.warn('Audit logs API failed, falling back to direct Firestore:', apiErr)
  }

  // Client Firestore fallback
  const snap = await getDocs(collection(db, 'audit_logs'))
  const logs: AuditLogEntry[] = []
  snap.forEach((d) => {
    const data = d.data()
    if (filters?.userId && filters.userId !== 'all' && data.userId !== filters.userId) return
    if (filters?.entityType && filters.entityType !== 'all' && data.entityType !== filters.entityType) return
    if (filters?.action && filters.action !== 'all' && data.action !== filters.action) return

    logs.push({
      id: d.id,
      timestamp: toIsoString(data.timestamp || data.createdAt) || new Date().toISOString(),
      userId: data.userId || '',
      userName: data.userName || '',
      userEmail: data.userEmail || '',
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      entityName: data.entityName,
      locationId: data.locationId,
      locationName: data.locationName,
      description: data.description || '',
      diffs: data.diffs,
      metadata: data.metadata
    })
  })

  logs.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
  const limit = filters?.limitCount || 50
  return logs.slice(0, limit)
}
