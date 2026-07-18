import { NextRequest, NextResponse } from 'next/server'

async function handleProxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  // 1. Check for Authorization header
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ detail: 'Unauthorized: Missing token' }, { status: 401 })
  }

  const token = authHeader.split('Bearer ')[1]
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID

  try {
    // 2. Verify Token & Admin Status via Firestore REST API
    // The security rules allow users to read their own document in the admins collection.
    // By passing the user's token directly, we verify both the token's validity AND their admin status in one go.
    // (If the token is invalid or expired, it returns 401/403. If the doc doesn't exist, it returns 404).
    
    // First, we need to extract the UID from the JWT token payload (it's base64url encoded)
    const payloadBase64 = token.split('.')[1]
    let base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/')
    const pad = base64.length % 4
    if (pad) base64 += '='.repeat(4 - pad)
    const payloadJson = atob(base64)
    const payload = JSON.parse(payloadJson)
    const uid = payload.user_id

    if (!uid) {
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
      return NextResponse.json({ detail: 'Unauthorized: Token verification failed' }, { status: 401 })
    }

    // 3. Proxy Request to Cloud Run API
    const targetBaseUrl = process.env.SCREENER_API_URL || 'http://localhost:8000/api'
    const resolvedParams = await params
    const targetUrl = `${targetBaseUrl.replace(/\/api$/, '')}/api/screener/${resolvedParams.path.join('/')}${req.nextUrl.search}`
    
    // Forward the original authorization header so the Cloud Run API could verify if it wanted to
    const headers = new Headers()
    headers.set('Authorization', authHeader)
    
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
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
