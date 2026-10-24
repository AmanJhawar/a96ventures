import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCaller } from '@/lib/firebase/server-auth'
import { restoreCustomerServer, ConflictError } from '@/lib/server/customers'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { id } = await params
    const result = await restoreCustomerServer(authResult.caller, id)

    return NextResponse.json(result)
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

    const msg = err instanceof Error ? err.message : 'Failed to restore customer'
    const status = msg.startsWith('Forbidden') ? 403 : msg.includes('not found') ? 404 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
