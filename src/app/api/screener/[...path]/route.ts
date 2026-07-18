import { NextRequest, NextResponse } from 'next/server'

async function handleProxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  // 1. Check for Authorization header
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ detail: 'Unauthorized: Missing token' }, { status: 401 })
  }

  const token = authHeader.split('Bearer ')[1]

  try {
    // 2. Verify Token & Admin Status via Firestore REST API
    const payloadBase64 = token.split('.')[1]
    let base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/')
    const pad = base64.length % 4
    if (pad) base64 += '='.repeat(4 - pad)
    
    const payloadJson = atob(base64)
    const payload = JSON.parse(payloadJson)
    const uid = payload.user_id
    const projectId = payload.aud

    if (!uid || !projectId) {
      return NextResponse.json({ detail: 'Unauthorized: Invalid token payload' }, { status: 401 })
    }

    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/admins/${uid}`
    const adminCheckRes = await fetch(firestoreUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (adminCheckRes.status === 404) {
      return NextResponse.json({ detail: 'Forbidden: Admin access required' }, { status: 403 })
    } else if (!adminCheckRes.ok) {
      const errorText = await adminCheckRes.text()
      return NextResponse.json({ detail: `Unauthorized: Token verification failed (${adminCheckRes.status} ${adminCheckRes.statusText}) - ${errorText}` }, { status: 401 })
    }

    // 3. Proxy Request to Cloud Run API
    const targetBaseUrl = process.env.SCREENER_API_URL || 'http://localhost:8000/api'
    const resolvedParams = await params
    const subPath = resolvedParams.path.join('/')
    const targetUrl = `${targetBaseUrl}/${subPath}${req.nextUrl.search}`

    // Forward the original authorization header so the Cloud Run API could verify if it wanted to
    const headers = new Headers()
    headers.set('Authorization', authHeader)

    let body = undefined
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      body = await req.text()
    }
    
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    })

    const data = await response.text()
    
    const responseHeaders = new Headers()
    responseHeaders.set('Content-Type', response.headers.get('Content-Type') || 'application/json')

    return new NextResponse(data, {
      status: response.status,
      headers: responseHeaders,
    })

  } catch (error) {
    console.error('API Proxy failed:', error)
    return NextResponse.json({ detail: 'Internal Server Error' }, { status: 500 })
  }
}

export const GET = handleProxy
export const POST = handleProxy
export const PUT = handleProxy
export const DELETE = handleProxy
