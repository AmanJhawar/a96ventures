import { apiClient, getAuthHeaders, ApiError } from '@/lib/api-client'
import { auth } from '@/lib/firebase/auth'
import { db } from '@/lib/firebase/config'
import { collection, getDocs, addDoc } from 'firebase/firestore/lite'
import { AuditLogEntry, AuditActionType } from '@/lib/types'

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
  }
  return ''
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
 * Record an immutable audit log entry via the server Admin API.
 */
export async function recordAuditLog(params: RecordAuditParams): Promise<string> {
  const sanitizedParams = {
    ...params,
    diffs: redactAuditDiffs(params.diffs)
  }

  try {
    const data = await apiClient.post<{ id?: string }>('/api/admin/audit', sanitizedParams, {
      actionName: 'record audit log'
    })
    return data.id || ''
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
      diffs: sanitizedParams.diffs,
      metadata: sanitizedParams.metadata
    }))
    return docRef.id
  } catch (clientErr) {
    console.error('Failed to write audit log to Firestore directly:', clientErr)
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
  const headers = await getAuthHeaders().catch(() => ({} as Record<string, string>))
  const format = options?.format || 'csv'
  const params = new URLSearchParams({ format })
  if (options?.entityType && options.entityType !== 'all') params.set('entityType', options.entityType)
  if (options?.action && options.action !== 'all') params.set('action', options.action)

  const res = await fetch(`/api/admin/audit/export?${params.toString()}`, { headers })

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

/**
 * Fetch audit logs via server API.
 */
export async function getAuditLogs(filters?: GetAuditLogsFilter): Promise<AuditLogEntry[]> {
  const params: Record<string, string | number | boolean | undefined> = {
    export: filters?.isExport ? true : undefined,
    limit: filters?.limitCount ? Number(filters.limitCount) : undefined,
    page: filters?.page ? Number(filters.page) : undefined,
    userId: filters?.userId && filters.userId !== 'all' ? filters.userId : undefined,
    entityType: filters?.entityType && filters.entityType !== 'all' ? filters.entityType : undefined,
    action: filters?.action && filters.action !== 'all' ? filters.action : undefined
  }

  try {
    const data = await apiClient.get<{ logs: AuditLogEntry[] }>('/api/admin/audit', params, {
      actionName: 'fetch audit logs'
    })
    if (data && Array.isArray(data.logs)) return data.logs
  } catch (err) {
    if (!shouldFallback(err)) throw err
    console.warn('Audit logs API failed, falling back to direct Firestore:', err)
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
