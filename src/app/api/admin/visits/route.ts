import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { createVisit, listVisits, MANUAL_VISIT_KINDS } from '@/lib/server/visits'

const createVisitSchema = z.object({
  customerId: z.string().min(1, 'customerId is required'),
  locationId: z.string().min(1, 'locationId is required'),
  kind: z.enum(MANUAL_VISIT_KINDS, {
    message: 'kind must be one of: walk_in, inquiry, follow_up, repair'
  }),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'at must be YYYY-MM-DD').optional(),
  note: z.string().optional(),
  inquiryId: z.string().optional(),
  followUpOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'followUpOn must be YYYY-MM-DD').optional(),
  followUpOf: z.string().optional()
})

export async function POST(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (!hasModulePermission(caller, 'visits', 'add')) {
      return NextResponse.json({ error: 'Forbidden: visits.add permission required' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid or missing JSON body' }, { status: 400 })
    }

    const parsed = createVisitSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 })
    }

    const visit = await createVisit({
      ...parsed.data,
      caller: {
        callerUid: caller.callerUid,
        callerName: caller.callerName,
        callerEmail: caller.callerEmail
      }
    })

    return NextResponse.json({ success: true, visit }, { status: 201 })
  } catch (err: unknown) {
    console.error('POST /api/admin/visits error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to create visit'
    const status = msg.includes('not found') || msg.includes('Invalid') ? 400 : 500
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

    if (!hasModulePermission(caller, 'visits', 'view')) {
      return NextResponse.json({ error: 'Forbidden: visits.view permission required' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const customerId = searchParams.get('customerId') || undefined
    const locationId = searchParams.get('locationId') || undefined
    const cursor = searchParams.get('cursor') || undefined
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined

    const { visits, nextCursor } = await listVisits({
      customerId,
      locationId,
      cursor,
      limit
    })

    return NextResponse.json({ success: true, visits, nextCursor })
  } catch (err: unknown) {
    console.error('GET /api/admin/visits error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to list visits'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
