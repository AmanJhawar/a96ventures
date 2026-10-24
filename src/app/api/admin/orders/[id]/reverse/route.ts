import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { adminDb } from '@/lib/firebase/admin'
import { reverseOrder, ValidationError } from '@/lib/server/orders'
import { Order } from '@/lib/types'
import { getClosedFiscalCutoff, SystemLockedError } from '@/lib/server/system-lock'
import { getTodayIST } from '@/lib/utils/date'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    const { id: orderId } = await context.params
    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
    }

    // Check order type to enforce specific delete permission
    const orderDoc = await adminDb.collection('orders').doc(orderId).get()
    if (!orderDoc.exists) {
      return NextResponse.json({ error: `Order "${orderId}" not found` }, { status: 404 })
    }
    const orderData = orderDoc.data() as Order

    // Check future date (IST)
    const today = getTodayIST()
    if (orderData.date > today) {
      return NextResponse.json(
        { error: `Cannot reverse order: It is dated in the future (${orderData.date}). Today is ${today}.` },
        { status: 400 }
      )
    }

    // Check closed fiscal cutoff
    const closedCutoff = await getClosedFiscalCutoff()
    if (closedCutoff && orderData.date <= closedCutoff) {
      return NextResponse.json(
        {
          error: `Cannot reverse order: It is dated on or before ${closedCutoff}. The financial period up to ${closedCutoff} has been closed and archived.`
        },
        { status: 400 }
      )
    }

    // Staff Assigned Location Enforcement
    if (!caller.isSuperAdmin && caller.callerData.assignedLocationId) {
      if (orderData.locationId !== caller.callerData.assignedLocationId) {
        return NextResponse.json(
          {
            error: `Access Denied: You are assigned to ${caller.callerData.assignedLocationName || 'another store'} and cannot reverse orders from a different location.`
          },
          { status: 403 }
        )
      }
    }

    if (orderData.type === 'sale' && !hasModulePermission(caller, 'sales', 'delete')) {
      return NextResponse.json({ error: 'Forbidden: sales.delete permission required to reverse sales' }, { status: 403 })
    }
    if (orderData.type === 'return' && !hasModulePermission(caller, 'returns', 'delete')) {
      return NextResponse.json({ error: 'Forbidden: returns.delete permission required to reverse returns' }, { status: 403 })
    }

    const order = await reverseOrder({
      orderId,
      caller: {
        callerUid: caller.callerUid,
        callerName: caller.callerName,
        callerEmail: caller.callerEmail
      }
    })

    return NextResponse.json({ success: true, order })
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.format() }, { status: 400 })
    }
    if (err instanceof SystemLockedError) {
      return NextResponse.json({ error: err.message }, { status: 423 })
    }
    console.error('POST /api/admin/orders/[id]/reverse error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to reverse order'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

