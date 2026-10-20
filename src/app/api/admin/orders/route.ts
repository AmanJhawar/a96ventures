import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { createOrder, listOrders } from '@/lib/server/orders'

const paymentSchema = z.object({
  mode: z.enum(['cash', 'upi', 'card', 'bank', 'old_metal']),
  amountPaise: z.number().int().positive(),
  reference: z.string().optional(),
  metal: z.enum(['Gold', 'Silver']).optional(),
  weightMg: z.number().int().positive().optional(),
  purity: z.string().optional()
})

const orderLineSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  qty: z.number().int().positive('qty must be a positive integer'),
  pieceWeightMg: z.number().int().positive().optional(),
  unitPricePaise: z.number().int().nonnegative('unitPricePaise must be non-negative')
})

const createOrderSchema = z.object({
  type: z.enum(['sale', 'return']),
  customerId: z.string().optional(),
  locationId: z.string().min(1, 'locationId is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'),
  lines: z.array(orderLineSchema).min(1, 'At least one line item is required'),
  payments: z.array(paymentSchema).min(1, 'At least one payment is required'),
  notes: z.string().optional()
})

export async function POST(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid or missing JSON body' }, { status: 400 })
    }

    const parsed = createOrderSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.format() },
        { status: 400 }
      )
    }

    const { type, customerId } = parsed.data

    // Check module permissions
    if (type === 'sale' && !hasModulePermission(caller, 'sales', 'add')) {
      return NextResponse.json({ error: 'Forbidden: sales.add permission required' }, { status: 403 })
    }
    if (type === 'return' && !hasModulePermission(caller, 'returns', 'add')) {
      return NextResponse.json({ error: 'Forbidden: returns.add permission required' }, { status: 403 })
    }
    if (customerId && !hasModulePermission(caller, 'customers', 'view')) {
      return NextResponse.json({ error: 'Forbidden: customers.view permission required to attach customer' }, { status: 403 })
    }

    const order = await createOrder({
      ...parsed.data,
      caller: {
        callerUid: caller.callerUid,
        callerName: caller.callerName,
        callerEmail: caller.callerEmail
      }
    })

    return NextResponse.json({ success: true, order }, { status: 201 })
  } catch (err: unknown) {
    console.error('POST /api/admin/orders error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to create order'
    const status = msg.includes('Insufficient stock') || msg.includes('Payment mismatch') || msg.includes('not found') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (!hasModulePermission(caller, 'sales', 'view') && !hasModulePermission(caller, 'returns', 'view')) {
      return NextResponse.json({ error: 'Forbidden: sales.view or returns.view permission required' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const customerId = searchParams.get('customerId') || undefined
    const locationId = searchParams.get('locationId') || undefined
    const cursor = searchParams.get('cursor') || undefined
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined

    const { orders, nextCursor } = await listOrders({
      customerId,
      locationId,
      cursor,
      limit
    })

    return NextResponse.json({ success: true, orders, nextCursor })
  } catch (err: unknown) {
    console.error('GET /api/admin/orders error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to list orders'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
