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

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/i

/**
 * Redacts any audit diff where the field name is 'pan' or the value matches the PAN pattern.
 * Ensures plaintext PANs never leak into immutable audit trails.
 */
export function redactAuditDiffs(diffs?: AuditLogEntry['diffs']): AuditLogEntry['diffs'] {
  if (!Array.isArray(diffs)) return []
  return diffs.map((diff) => {
    const isPanField =
      diff.field?.toLowerCase() === 'pan' ||
      diff.label?.toLowerCase() === 'pan' ||
      diff.field?.toLowerCase().includes('pan')

    const isOldPan =
      typeof diff.oldValue === 'string' && PAN_REGEX.test(diff.oldValue.replace(/\s+/g, ''))
    const isNewPan =
      typeof diff.newValue === 'string' && PAN_REGEX.test(diff.newValue.replace(/\s+/g, ''))

    if (isPanField || isOldPan || isNewPan) {
      return {
        ...diff,
        oldValue: diff.oldValue !== undefined && diff.oldValue !== null && diff.oldValue !== '' ? '[redacted]' : diff.oldValue,
        newValue: diff.newValue !== undefined && diff.newValue !== null && diff.newValue !== '' ? '[redacted]' : diff.newValue
      }
    }
    return diff
  })
}

/**
 * Record an immutable audit log entry via server code (or client fallback).
 * Server route uses Firebase Admin SDK with elevated privileges.
 */
export async function recordAuditLog(params: RecordAuditParams): Promise<string> {
  const sanitizedParams = {
    ...params,
    diffs: redactAuditDiffs(params.diffs)
  }

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
        body: JSON.stringify(sanitizedParams)
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
      userId: sanitizedParams.userId || currentUser?.uid || '',
      userEmail: sanitizedParams.userEmail || currentUser?.email || '',
      userName: sanitizedParams.userName || currentUser?.displayName || 'Admin',
      action: sanitizedParams.action,
      entityType: sanitizedParams.entityType,
      entityId: sanitizedParams.entityId,
      entityName: sanitizedParams.entityName || '',
      locationId: sanitizedParams.locationId || '',
      locationName: sanitizedParams.locationName || '',
      description: sanitizedParams.description,
      diffs: sanitizedParams.diffs || [],
      metadata: sanitizedParams.metadata || {}
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
    const res: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
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
