import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { verifyAdminToken } from '@/lib/firebase/admin-verify'

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path')

  if (!path) {
    return NextResponse.json({ message: 'Missing path parameter' }, { status: 400 })
  }

  const result = await verifyAdminToken(request.headers.get('Authorization'))
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status })
  }

  try {
    revalidatePath(path)
    return NextResponse.json({ revalidated: true, now: Date.now() })
  } catch (err) {
    console.error('Error revalidating path:', path, err)
    return NextResponse.json({ message: 'Internal server error while revalidating path' }, { status: 500 })
  }
}
