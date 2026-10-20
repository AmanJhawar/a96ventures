import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { adminDb } from '@/lib/firebase/admin'
import { reverseOrder } from '@/lib/server/orders'
import { Order } from '@/lib/types'

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
    console.error('POST /api/admin/orders/[id]/reverse error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to reverse order'
    const status = msg.includes('already reversed') || msg.includes('not found') || msg.includes('Cannot reverse') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
