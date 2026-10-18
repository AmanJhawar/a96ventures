import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { Location } from '@/lib/types'

/**
 * GET /api/admin/locations
 * Fetches all inventory locations.
 * Requires: locations.view permission.
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (!hasModulePermission(caller, 'locations', 'view')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to view locations' }, { status: 403 })
    }

    const snap = await adminDb.collection('locations').get()
    const items: Location[] = []
    snap.forEach((doc) => {
      const data = doc.data()
      items.push({
        id: doc.id,
        name: data.name || '',
        description: data.description || '',
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      } as Location)
    })

    items.sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json({ success: true, locations: items })
  } catch (err: unknown) {
    console.error('GET /api/admin/locations error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to fetch locations'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/admin/locations
 * Creates a new storage location.
 * Requires: locations.add permission.
 * Logs an immutable audit entry with server timestamp and verified caller identity.
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (!hasModulePermission(caller, 'locations', 'add')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to add locations' }, { status: 403 })
    }

    const body = await req.json()
    const name = String(body.name || '').trim()
    const description = String(body.description || '').trim()

    if (!name) {
      return NextResponse.json({ error: 'Location name is required' }, { status: 400 })
    }

    const docRef = await adminDb.collection('locations').add({
      name,
      description,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: caller.callerUid,
      createdByEmail: caller.callerEmail
    })

    // Write server audit log
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: 'create',
      entityType: 'location',
      entityId: docRef.id,
      entityName: name,
      locationId: docRef.id,
      locationName: name,
      description: `Added inventory location "${name}"${description ? ` (${description})` : ''}`,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    })

    return NextResponse.json({ success: true, id: docRef.id })
  } catch (err: unknown) {
    console.error('POST /api/admin/locations error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to add location'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

/**
 * PUT /api/admin/locations
 * Updates an existing storage location.
 * Requires: locations.edit permission.
 * Logs an immutable audit entry with server timestamp and verified caller identity.
 */
export async function PUT(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (!hasModulePermission(caller, 'locations', 'edit')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to edit locations' }, { status: 403 })
    }

    const body = await req.json()
    const id = String(body.id || '').trim()
    const name = String(body.name || '').trim()
    const description = String(body.description || '').trim()

    if (!id || !name) {
      return NextResponse.json({ error: 'Location ID and name are required' }, { status: 400 })
    }

    const locRef = adminDb.collection('locations').doc(id)
    const locSnap = await locRef.get()
    if (!locSnap.exists) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    const oldData = locSnap.data() || {}
    await locRef.update({
      name,
      description,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: caller.callerUid,
      updatedByEmail: caller.callerEmail
    })

    // Write server audit log
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: 'update',
      entityType: 'location',
      entityId: id,
      entityName: name,
      locationId: id,
      locationName: name,
      description: `Updated location "${oldData.name || id}" to "${name}"`,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('PUT /api/admin/locations error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to update location'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

/**
 * DELETE /api/admin/locations
 * Deletes a location if no products hold stock in it.
 * Requires: locations.delete permission.
 * Logs an immutable audit entry with server timestamp and verified caller identity.
 */
export async function DELETE(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (!hasModulePermission(caller, 'locations', 'delete')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to delete locations' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Location ID is required' }, { status: 400 })
    }

    const locRef = adminDb.collection('locations').doc(id)
    const locSnap = await locRef.get()
    if (!locSnap.exists) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    const locData = locSnap.data() || {}

    // Verify no product holds stock at this location
    const prodsSnap = await adminDb.collection('products').get()
    const hasStock = prodsSnap.docs.some((doc) => {
      const p = doc.data()
      if (p.isArchived) return false
      const locStock = p.stockByLocation?.[id] || 0
      return Number(locStock) > 0
    })

    if (hasStock) {
      return NextResponse.json({
        error: 'Cannot delete this location because products currently hold stock here. Transfer or adjust stock first.'
      }, { status: 400 })
    }

    await locRef.delete()

    // Write server audit log
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: 'delete',
      entityType: 'location',
      entityId: id,
      entityName: locData.name || id,
      locationId: id,
      locationName: locData.name || id,
      description: `Deleted inventory location "${locData.name || id}"`,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('DELETE /api/admin/locations error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to delete location'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
