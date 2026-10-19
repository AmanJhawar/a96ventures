import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import {
  buildMasterArchiveServer,
  getSavedArchiveServer,
  listSavedArchivesServer
} from '@/lib/server/archive'
import { getClosedFiscalCutoff } from '@/lib/server/system-lock'
import { getTodayIST, isValidDateStringIST } from '@/lib/utils/date'

export async function GET(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (!hasModulePermission(caller, 'archive', 'zeroBalance') && !hasModulePermission(caller, 'archive', 'uploadArchive')) {
      return NextResponse.json(
        { error: 'Forbidden: Super Admin or Master Archive authorization required' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)

    // 1. List saved server archives
    if (searchParams.get('list') === 'true') {
      const archives = await listSavedArchivesServer()
      const lastClosedCutoff = await getClosedFiscalCutoff()
      return NextResponse.json({ success: true, archives, lastClosedCutoff })
    }

    // 2. Fetch specific server archive by archiveId
    const archiveId = searchParams.get('archiveId')
    if (archiveId) {
      const archive = await getSavedArchiveServer(archiveId)
      if (searchParams.get('download') === 'true') {
        const filename = `${archiveId}.json`
        return new NextResponse(JSON.stringify(archive, null, 2), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${filename}"`
          }
        })
      }
      const lastClosedCutoff = await getClosedFiscalCutoff()
      return NextResponse.json({ success: true, archive, lastClosedCutoff })
    }

    // 3. Build live server archive up to cutoff date
    const rawCutoff = searchParams.get('cutoffDate') || undefined
    let cutoffDate: string | undefined = undefined
    if (rawCutoff) {
      const trimmed = rawCutoff.trim()
      if (!isValidDateStringIST(trimmed)) {
        return NextResponse.json(
          { error: `Invalid cutoffDate parameter: "${rawCutoff}". Date must be in YYYY-MM-DD format.` },
          { status: 400 }
        )
      }
      const today = getTodayIST()
      if (trimmed > today) {
        return NextResponse.json(
          { error: `Cutoff date (${trimmed}) cannot be in the future. It must be on or before today (${today}).` },
          { status: 400 }
        )
      }
      cutoffDate = trimmed
    }

    const { archive, count, auditCount, openingDate, checksum } = await buildMasterArchiveServer({ cutoffDate })
    const lastClosedCutoff = await getClosedFiscalCutoff()

    if (searchParams.get('download') === 'true') {
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const filename = cutoffDate
        ? `a96-audit-archive-cutoff-${cutoffDate}-${dateStr}.json`
        : `a96-audit-archive-${dateStr}.json`
      return new NextResponse(JSON.stringify(archive, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      })
    }

    return NextResponse.json({
      success: true,
      count,
      auditCount,
      checksum,
      cutoffDate,
      openingDate,
      lastClosedCutoff,
      archive
    })
  } catch (err: unknown) {
    console.error('GET /api/admin/transactions/archive error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to retrieve or generate archive'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (!hasModulePermission(caller, 'archive', 'zeroBalance') && !hasModulePermission(caller, 'archive', 'uploadArchive')) {
      return NextResponse.json(
        { error: 'Forbidden: Super Admin or Master Archive authorization required' },
        { status: 403 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const { searchParams } = new URL(req.url)
    const rawCutoff = body.cutoffDate || searchParams.get('cutoffDate') || undefined
    let cutoffDate: string | undefined = undefined
    if (rawCutoff) {
      const trimmed = String(rawCutoff).trim()
      if (!isValidDateStringIST(trimmed)) {
        return NextResponse.json(
          { error: `Invalid cutoffDate parameter: "${rawCutoff}". Date must be in YYYY-MM-DD format.` },
          { status: 400 }
        )
      }
      const today = getTodayIST()
      if (trimmed > today) {
        return NextResponse.json(
          { error: `Cutoff date (${trimmed}) cannot be in the future. It must be on or before today (${today}).` },
          { status: 400 }
        )
      }
      cutoffDate = trimmed
    }

    const { archive, count, auditCount, openingDate, checksum } = await buildMasterArchiveServer({ cutoffDate })
    const lastClosedCutoff = await getClosedFiscalCutoff()

    return NextResponse.json({
      success: true,
      count,
      auditCount,
      checksum,
      cutoffDate,
      openingDate,
      lastClosedCutoff,
      archive
    })
  } catch (err: unknown) {
    console.error('POST /api/admin/transactions/archive error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to generate archive from server'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
