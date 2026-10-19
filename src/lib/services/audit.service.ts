import { auth } from '@/lib/firebase/auth'
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
    return ''
  } catch (err) {
    console.error('Failed to write audit log via server:', err)
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

/**
 * Fetch audit logs via server code or client query.
 */
export async function getAuditLogs(filters?: GetAuditLogsFilter): Promise<AuditLogEntry[]> {
  const currentUser = auth.currentUser
  if (!currentUser) {
    throw new Error('Not authenticated')
  }

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

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to fetch audit logs (${res.status})`)
  }

  const data = await res.json()
  return data.logs || []
}
