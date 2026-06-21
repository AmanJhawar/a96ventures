import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { adminAuth, adminDb } from '@/lib/firebase/admin'

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path')

  if (!path) {
    return NextResponse.json({ message: 'Missing path parameter' }, { status: 400 })
  }

  // Verify authentication
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const token = authHeader.split('Bearer ')[1]
  try {
    const decodedToken = await adminAuth.verifyIdToken(token)
    const uid = decodedToken.uid

    // Check if user is an admin
    const adminDoc = await adminDb.collection('admins').doc(uid).get()
    if (!adminDoc.exists) {
      return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 })
    }
  } catch (error) {
    console.error('Authentication error:', error)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    revalidatePath(path)
    return NextResponse.json({ revalidated: true, now: Date.now() })
  } catch (err) {
    console.error('Error revalidating path:', path, err)
    return NextResponse.json({ message: 'Error revalidating', error: String(err) }, { status: 500 })
  }
}
