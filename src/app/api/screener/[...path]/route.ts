import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminToken } from '@/lib/firebase/admin-verify'

async function handleProxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const result = await verifyAdminToken(req.headers.get('Authorization'))
  if (!result.ok) {
    return NextResponse.json({ detail: result.message }, { status: result.status })
  }

  const targetBaseUrl = process.env.SCREENER_API_URL || 'http://localhost:8000/api'
  const resolvedParams = await params
  const subPath = resolvedParams.path.join('/')
  const targetUrl = `${targetBaseUrl}/${subPath}${req.nextUrl.search}`

  const headers = new Headers()
  headers.set('Authorization', req.headers.get('Authorization')!)

  let body: string | undefined
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    body = await req.text()
  }

  try {
    const response = await fetch(targetUrl, { method: req.method, headers, body })
    const data = await response.text()
    const responseHeaders = new Headers()
    responseHeaders.set('Content-Type', response.headers.get('Content-Type') || 'application/json')
    return new NextResponse(data, { status: response.status, headers: responseHeaders })
  } catch (error) {
    console.error('API Proxy failed:', error)
    return NextResponse.json({ detail: 'Upstream request failed' }, { status: 502 })
  }
}

export const GET = handleProxy
export const POST = handleProxy
export const PUT = handleProxy
export const DELETE = handleProxy
