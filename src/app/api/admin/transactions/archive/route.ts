import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import {
  buildMasterArchiveServer,
  getSavedArchiveServer,
  listSavedArchivesServer
} from '@/lib/server/archive'

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
      return NextResponse.json({ success: true, archives })
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
      return NextResponse.json({ success: true, archive })
    }

    // 3. Build live server archive up to cutoff date
    const cutoffDate = searchParams.get('cutoffDate') || undefined
    const { archive, count, auditCount, openingDate, checksum } = await buildMasterArchiveServer({ cutoffDate })

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
    const cutoffDate = body.cutoffDate || searchParams.get('cutoffDate') || undefined

    const { archive, count, auditCount, openingDate, checksum } = await buildMasterArchiveServer({ cutoffDate })

    return NextResponse.json({
      success: true,
      count,
      auditCount,
      checksum,
      cutoffDate,
      openingDate,
      archive
    })
  } catch (err: unknown) {
    console.error('POST /api/admin/transactions/archive error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to generate archive from server'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
