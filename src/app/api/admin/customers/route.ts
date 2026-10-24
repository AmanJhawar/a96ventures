import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCaller } from '@/lib/firebase/server-auth'
import {
  createCustomerServer,
  getCustomersServer,
  ConflictError
} from '@/lib/server/customers'
import { z } from 'zod'

export async function GET(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') || undefined
    const cursor = searchParams.get('cursor') || undefined
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined
    const lastVisit = searchParams.get('lastVisit') || undefined
    const hasFollowUp = searchParams.get('hasFollowUp') === 'true' ? true : undefined

    const result = await getCustomersServer(authResult.caller, { q, cursor, limit, lastVisit, hasFollowUp })
    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    console.error('GET /api/admin/customers error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to fetch customers'
    const status = msg.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const body = await req.json()
    const customer = await createCustomerServer(authResult.caller, body)

    return NextResponse.json({ success: true, customer }, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof ConflictError) {
      return NextResponse.json(
        {
          error: err.message,
          field: err.field,
          existingCustomerId: err.existingCustomerId,
          existingCustomerName: err.existingCustomerName,
          isArchived: err.isArchived
        },
        { status: 409 }
      )
    }

    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', issues: err.issues },
        { status: 400 }
      )
    }

    console.error('POST /api/admin/customers error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to create customer'
    const status = msg.startsWith('Forbidden') ? 403 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
