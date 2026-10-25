import { apiClient, getAuthHeaders } from '@/lib/api-client'
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
    console.warn('Failed to write audit log via server:', err)
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

  const data = await apiClient.get<{ logs: AuditLogEntry[] }>('/api/admin/audit', params, {
    actionName: 'fetch audit logs'
  })

  return data.logs || []
}
