import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { createOrder, listOrders, ValidationError } from '@/lib/server/orders'
import { getClosedFiscalCutoff, SystemLockedError } from '@/lib/server/system-lock'
import { getTodayIST } from '@/lib/utils/date'

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
      const issue = parsed.error.issues[0]
      const errorMsg = issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Validation failed'
      return NextResponse.json(
        { error: errorMsg, details: parsed.error.format() },
        { status: 400 }
      )
    }

    const { type, customerId, locationId, date } = parsed.data

    // Check future date (IST)
    const today = getTodayIST()
    if (date > today) {
      return NextResponse.json(
        { error: `Order date cannot be in the future (${date}). Current date in IST is ${today}.` },
        { status: 400 }
      )
    }

    // Check closed fiscal cutoff
    const closedCutoff = await getClosedFiscalCutoff()
    if (closedCutoff && date <= closedCutoff) {
      return NextResponse.json(
        {
          error: `Entries dated on or before ${closedCutoff} are blocked. The financial period up to ${closedCutoff} has been closed and archived.`
        },
        { status: 400 }
      )
    }

    // Staff Assigned Location Enforcement
    // Staff with assignedLocationId cannot transact at unauthorized stores
    const isSuperAdmin = caller.isSuperAdmin
    const userAssignedLoc = caller.callerData.assignedLocationId
    if (!isSuperAdmin && userAssignedLoc) {
      if (locationId !== userAssignedLoc) {
        return NextResponse.json(
          {
            error: `Access Denied: You are assigned to ${caller.callerData.assignedLocationName || 'another store'} and cannot record ${type} transactions at a different location.`
          },
          { status: 403 }
        )
      }
    }

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
    if (err instanceof ValidationError || (err instanceof Error && (err.name === 'ValidationError' || (err as { type?: string }).type === 'ValidationError'))) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 })
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.format() }, { status: 400 })
    }
    if (err instanceof SystemLockedError || (err instanceof Error && (err.name === 'SystemLockedError' || (err as { statusCode?: number }).statusCode === 423))) {
      return NextResponse.json({ error: (err as Error).message }, { status: 423 })
    }
    console.error('POST /api/admin/orders error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to create order'
    return NextResponse.json({ error: msg, message: msg }, { status: 500 })
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
    const locationIdParam = searchParams.get('locationId') || undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined
    const cursor = searchParams.get('cursor') || undefined
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined

    const userAssignedLoc = caller.callerData.assignedLocationId
    // Force locationId to the caller's assignedLocationId when set
    const effectiveLocationId = userAssignedLoc || locationIdParam

    const { orders, nextCursor } = await listOrders({
      customerId,
      locationId: effectiveLocationId,
      startDate,
      endDate,
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

