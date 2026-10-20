import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { updateVisit, deleteVisit } from '@/lib/server/visits'

const updateVisitSchema = z.object({
  note: z.string().optional(),
  followUpOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'followUpOn must be YYYY-MM-DD').nullable().optional(),
  followUpDone: z.boolean().optional()
})

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (!hasModulePermission(caller, 'visits', 'edit')) {
      return NextResponse.json({ error: 'Forbidden: visits.edit permission required' }, { status: 403 })
    }

    const { id: visitId } = await context.params
    if (!visitId) {
      return NextResponse.json({ error: 'Visit ID is required' }, { status: 400 })
    }

    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid or missing JSON body' }, { status: 400 })
    }

    const parsed = updateVisitSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 })
    }

    const visit = await updateVisit({
      visitId,
      ...parsed.data,
      caller: {
        callerUid: caller.callerUid,
        callerName: caller.callerName,
        callerEmail: caller.callerEmail
      }
    })

    return NextResponse.json({ success: true, visit })
  } catch (err: unknown) {
    console.error('PATCH /api/admin/visits/[id] error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to update visit'
    const status = msg.includes('not found') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (!hasModulePermission(caller, 'visits', 'delete')) {
      return NextResponse.json({ error: 'Forbidden: visits.delete permission required' }, { status: 403 })
    }

    const { id: visitId } = await context.params
    if (!visitId) {
      return NextResponse.json({ error: 'Visit ID is required' }, { status: 400 })
    }

    const result = await deleteVisit({
      visitId,
      caller: {
        callerUid: caller.callerUid,
        callerName: caller.callerName,
        callerEmail: caller.callerEmail
      }
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    console.error('DELETE /api/admin/visits/[id] error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to delete visit'
    const status = msg.includes('Cannot delete') ? 400 : msg.includes('not found') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
