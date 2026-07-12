import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase/admin'

async function handleProxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  // 1. Check for Authorization header
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ detail: 'Unauthorized: Missing token' }, { status: 401 })
  }

  const token = authHeader.split('Bearer ')[1]
  try {
    // 2. Verify Firebase ID Token
    const decodedToken = await adminAuth.verifyIdToken(token)
    
    // 3. Verify Admin Status
    const adminDoc = await adminDb.collection('admins').doc(decodedToken.uid).get()
    if (!adminDoc.exists) {
      return NextResponse.json({ detail: 'Forbidden: Admin access required' }, { status: 403 })
    }
  } catch (error) {
    console.error('Firebase Admin Auth failed:', error)
    return NextResponse.json({ detail: 'Unauthorized: Invalid token' }, { status: 401 })
  }

  // 4. Proxy to the FastAPI backend on Cloud Run
  const apiBase = process.env.SCREENER_API_URL || 'http://localhost:8000/api'
  const resolvedParams = await params
  const subPath = resolvedParams.path.join('/')
  
  // Forward search query parameters
  const urlObj = new URL(req.url)
  const queryStr = urlObj.search
  const targetUrl = `${apiBase}/${subPath}${queryStr}`

  const headers = new Headers()
  headers.set('Content-Type', 'application/json')
  
  const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    })

    const data = await response.text()
    
    // Copy the original headers to pass back to the frontend
    const responseHeaders = new Headers()
    responseHeaders.set('Content-Type', response.headers.get('Content-Type') || 'application/json')

    return new NextResponse(data, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch (err: any) {
    console.error('Error proxying request to backend:', err)
    return NextResponse.json({ detail: `Proxy Error: ${err.message}` }, { status: 502 })
  }
}

export const GET = handleProxy
export const POST = handleProxy
export const DELETE = handleProxy
export const PUT = handleProxy
