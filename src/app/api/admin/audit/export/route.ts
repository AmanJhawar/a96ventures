import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { escapeCSVCell } from '@/lib/utils/csv'
import { AuditLogEntry } from '@/lib/types'

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
 * GET /api/admin/audit/export
 * Exports the COMPLETE audit trail on the server with no 500-entry limit.
 * Permitted for: users.view, archive.zeroBalance, reports.export, or super_admin.
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    const canExport =
      hasModulePermission(caller, 'users', 'view') ||
      hasModulePermission(caller, 'archive', 'zeroBalance') ||
      hasModulePermission(caller, 'reports', 'export') ||
      hasModulePermission(caller, 'reports', 'view')

    if (!canExport) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to export audit logs. Required: View Users, Master Archive, or Export Reports.' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const format = (searchParams.get('format') || 'csv').toLowerCase()
    const userIdFilter = searchParams.get('userId')
    const entityTypeFilter = searchParams.get('entityType')
    const actionFilter = searchParams.get('action')

    let query: FirebaseFirestore.Query = adminDb.collection('audit_logs')

    if (userIdFilter && userIdFilter !== 'all') {
      query = query.where('userId', '==', userIdFilter)
    }
    if (entityTypeFilter && entityTypeFilter !== 'all') {
      query = query.where('entityType', '==', entityTypeFilter)
    }
    if (actionFilter && actionFilter !== 'all') {
      query = query.where('action', '==', actionFilter)
    }

    let snap: FirebaseFirestore.QuerySnapshot
    try {
      snap = await query.orderBy('createdAt', 'desc').get()
    } catch {
      // Fallback if composite index is pending: fetch without order and sort in memory
      snap = await query.get()
    }

    const logs: AuditLogEntry[] = snap.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
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
      }
    })

    // Sort descending by timestamp
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

    if (format === 'json') {
      return new NextResponse(JSON.stringify(logs, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="a96-audit-trail-${dateStr}.json"`,
          'X-Total-Count': String(logs.length)
        }
      })
    }

    // CSV format
    const headers = [
      'Timestamp (ISO)',
      'Action',
      'Entity Type',
      'Entity ID',
      'Entity Name',
      'User Name',
      'User Email',
      'Location ID',
      'Location Name',
      'Description',
      'Diffs Count'
    ]

    const rows = logs.map((log) => [
      log.timestamp,
      log.action,
      log.entityType,
      log.entityId,
      log.entityName || '',
      log.userName,
      log.userEmail,
      log.locationId || '',
      log.locationName || '',
      log.description,
      log.diffs ? log.diffs.length : 0
    ])

    const headerLine = headers.map((h) => escapeCSVCell(h)).join(',')
    const rowLines = rows.map((r) => r.map((c) => escapeCSVCell(c)).join(','))
    const csvContent = '\uFEFF' + [headerLine, ...rowLines].join('\r\n')

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="a96-audit-trail-${dateStr}.csv"`,
        'X-Total-Count': String(logs.length)
      }
    })
  } catch (err: unknown) {
    console.error('GET /api/admin/audit/export error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to export audit logs'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
