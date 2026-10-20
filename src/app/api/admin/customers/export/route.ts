import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCaller } from '@/lib/firebase/server-auth'
import { exportCustomersCSVServer } from '@/lib/server/customers'

export async function GET(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { csv, count } = await exportCustomersCSVServer(authResult.caller)

    const dateStr = new Date().toISOString().split('T')[0]
    const filename = `a96-customers-${dateStr}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Total-Count': String(count)
      }
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to export customers'
    const status = msg.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
