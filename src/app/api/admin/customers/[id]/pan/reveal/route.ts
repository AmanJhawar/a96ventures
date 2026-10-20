import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCaller } from '@/lib/firebase/server-auth'
import { revealCustomerPanServer, RateLimitError } from '@/lib/server/customers'

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
    const result = await revealCustomerPanServer(authResult.caller, id)

    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 })
    }

    const msg = err instanceof Error ? err.message : 'Failed to reveal customer PAN'
    const status = msg.startsWith('Forbidden') ? 403 : msg.includes('not found') ? 404 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
