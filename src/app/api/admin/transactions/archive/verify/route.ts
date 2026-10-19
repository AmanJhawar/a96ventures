import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCaller } from '@/lib/firebase/server-auth'
import { verifyArchiveAgainstServer } from '@/lib/server/archive'

export async function POST(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const body = await req.json().catch(() => ({}))
    const { checksum, signature, archiveId } = body || {}

    const result = await verifyArchiveAgainstServer({
      checksum: typeof checksum === 'string' ? checksum : undefined,
      signature: typeof signature === 'string' ? signature : undefined,
      archiveId: typeof archiveId === 'string' ? archiveId : undefined
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    console.error('POST /api/admin/transactions/archive/verify error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to verify archive'
    return NextResponse.json({ error: msg, status: 'unverified' }, { status: 500 })
  }
}
