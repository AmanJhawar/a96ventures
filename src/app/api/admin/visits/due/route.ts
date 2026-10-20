import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { listDueFollowUps } from '@/lib/server/visits'
import { getTodayIST } from '@/lib/utils/date'

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
    const rawUntil = searchParams.get('until')
    const until = rawUntil ? rawUntil.trim() : getTodayIST()

    if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) {
      return NextResponse.json(
        { error: `Invalid until date: "${until}". Expected format YYYY-MM-DD.` },
        { status: 400 }
      )
    }

    const visits = await listDueFollowUps(until)

    return NextResponse.json({ success: true, visits })
  } catch (err: unknown) {
    console.error('GET /api/admin/visits/due error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to retrieve due follow-ups'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
