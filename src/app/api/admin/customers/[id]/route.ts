import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCaller } from '@/lib/firebase/server-auth'
import {
  getCustomerByIdServer,
  updateCustomerServer,
  archiveCustomerServer,
  ConflictError
} from '@/lib/server/customers'
import { z } from 'zod'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { id } = await params
    const result = await getCustomerByIdServer(authResult.caller, id)
    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch customer'
    const status = msg.startsWith('Forbidden') ? 403 : msg.includes('not found') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { id } = await params
    const body = await req.json()
    const customer = await updateCustomerServer(authResult.caller, id, body)

    return NextResponse.json({ success: true, customer })
  } catch (err: unknown) {
    if (err instanceof ConflictError) {
      return NextResponse.json(
        {
          error: err.message,
          field: err.field,
          existingCustomerId: err.existingCustomerId
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

    const msg = err instanceof Error ? err.message : 'Failed to update customer'
    const status = msg.startsWith('Forbidden') ? 403 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { id } = await params
    await archiveCustomerServer(authResult.caller, id)

    return NextResponse.json({ success: true, message: 'Customer archived' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to archive customer'
    const status = msg.startsWith('Forbidden') ? 403 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
