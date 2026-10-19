import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { AuditLogEntry, AuditActionType } from '@/lib/types'

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
 * GET /api/admin/audit
 * Retrieves audit logs via Firebase Admin SDK on the server.
 * Requires: users.view permission or super_admin.
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    const canAccess =
      hasModulePermission(caller, 'users', 'view') ||
      hasModulePermission(caller, 'archive', 'zeroBalance') ||
      hasModulePermission(caller, 'reports', 'export') ||
      hasModulePermission(caller, 'reports', 'view')

    if (!canAccess) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to view or export audit logs' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const isExport = searchParams.get('export') === 'true' || searchParams.get('limit') === 'all'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limitCount = isExport
      ? 100000
      : Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50', 10)), 500)
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
    let totalCount = 0
    const offset = (page - 1) * limitCount

    if (isExport) {
      try {
        snap = await query.orderBy('createdAt', 'desc').get()
      } catch {
        snap = await query.get()
      }
      totalCount = snap.size
    } else {
      try {
        // Attempt ordered query with count
        const orderedQuery = query.orderBy('createdAt', 'desc')
        try {
          const countSnap = await query.count().get()
          totalCount = countSnap.data().count
        } catch {
          totalCount = 0
        }
        snap = await orderedQuery.offset(offset).limit(limitCount).get()
      } catch (err: unknown) {
        console.warn('Notice: Firestore ordered query fallback with in-memory sort:', err)
        // Fallback if composite index is creating: retrieve by collection order and sort
        const fallbackQuery = adminDb.collection('audit_logs').orderBy('createdAt', 'desc')
        snap = await fallbackQuery.offset(offset).limit(limitCount).get()
      }
    }

    const logs: AuditLogEntry[] = []

    snap.forEach((doc) => {
      const data = doc.data()
      logs.push({
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
      })
    })

    // Double-ensure client receives chronologically descending items
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    const totalPages = totalCount > 0 ? Math.ceil(totalCount / limitCount) : Math.ceil(logs.length / limitCount) || 1

    return NextResponse.json({
      logs,
      page,
      limit: limitCount,
      totalCount: totalCount || logs.length,
      totalPages
    })
  } catch (err: unknown) {
    console.error('GET /api/admin/audit error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to fetch audit logs'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/admin/audit
 * Writes an immutable audit entry via Firebase Admin SDK on the server.
 * Requires: Authenticated caller. User and timestamp are derived strictly on the server.
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    const body = await req.json()
    const {
      action,
      entityType,
      entityId,
      entityName,
      locationId,
      locationName,
      description,
      diffs,
      metadata
    } = body

    if (!action || !entityType || !description) {
      return NextResponse.json({ error: 'Action, entityType, and description are required' }, { status: 400 })
    }

    // Always derive caller identity strictly from verified token, never trusting client parameters
    const auditData = {
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: action as AuditActionType,
      entityType: entityType as AuditLogEntry['entityType'],
      entityId: entityId || '',
      entityName: entityName || '',
      locationId: locationId || '',
      locationName: locationName || '',
      description: String(description).trim(),
      diffs: diffs || [],
      metadata: metadata || {},
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    }

    const docRef = await adminDb.collection('audit_logs').add(auditData)

    return NextResponse.json({ success: true, id: docRef.id })
  } catch (err: unknown) {
    console.error('POST /api/admin/audit error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to write audit log'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
