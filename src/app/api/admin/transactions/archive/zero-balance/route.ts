import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { executeZeroBalanceCutoffServer } from '@/lib/server/archive'
import { ValidationError } from '@/lib/errors'
import { SystemLockedError } from '@/lib/server/system-lock'

/**
 * POST /api/admin/transactions/archive/zero-balance
 * Executes or resumes Master Zero-Balance fiscal cutoff up to the specified cutoff date.
 * Requires: archive.zeroBalance permission and fresh authentication within 5 minutes.
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (!hasModulePermission(caller, 'archive', 'zeroBalance')) {
      return NextResponse.json(
        { error: 'Forbidden: Super Admin or Master Zero-Balance authorization required' },
        { status: 403 }
      )
    }

    const body = await req.json().catch(() => ({}))

    const result = await executeZeroBalanceCutoffServer({
      caller,
      cutoffDate: body?.cutoffDate,
      expectedTransactionCount: body?.expectedTransactionCount,
      expectedAuditCount: body?.expectedAuditCount,
      confirmationPhrase: body?.confirmationPhrase
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }

    const errorWithCode = err as { code?: string; message?: string }
    if (errorWithCode?.code === 'auth/requires-recent-login') {
      return NextResponse.json(
        {
          error: errorWithCode.message || 'Fresh authentication required',
          code: 'auth/requires-recent-login'
        },
        { status: 401 }
      )
    }

    if (errorWithCode?.code === 'COUNT_MISMATCH') {
      return NextResponse.json({ error: errorWithCode.message }, { status: 409 })
    }

    if (err instanceof SystemLockedError || errorWithCode?.message?.includes('currently locked')) {
      return NextResponse.json({ error: errorWithCode.message || 'System is currently locked' }, { status: 423 })
    }

    console.error('POST /api/admin/transactions/archive/zero-balance error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to execute zero-balance cutoff'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
