import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { SUPER_ADMIN_PERMISSIONS, EMPTY_PERMISSIONS } from '@/lib/constants/permissions'
import { UserRole } from '@/lib/types'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing token' }, { status: 401 })
    }

    const token = authHeader.split('Bearer ')[1]?.trim()
    if (!token) {
      return NextResponse.json({ error: 'Empty token' }, { status: 401 })
    }

    // Verify token signature using Firebase Admin SDK with Google's public keys
    const decoded = await adminAuth.verifyIdToken(token)

    // Strict Hard-coded checks for Project ID, Audience, Issuer, and Expiry
    const HARDCODED_PROJECT_ID = 'a96ventures-979e6'
    if (decoded.aud !== HARDCODED_PROJECT_ID) {
      return NextResponse.json({ error: 'Forbidden: Invalid token audience' }, { status: 403 })
    }
    if (decoded.iss !== `https://securetoken.google.com/${HARDCODED_PROJECT_ID}`) {
      return NextResponse.json({ error: 'Forbidden: Invalid token issuer' }, { status: 403 })
    }
    if (decoded.exp && Date.now() / 1000 > decoded.exp) {
      return NextResponse.json({ error: 'Unauthorized: Token expired' }, { status: 401 })
    }

    const uid = decoded.uid

    // Look up user in admins collection in Firestore
    // TREAT MISSING PROFILE AS AN ERROR: Never fail open without admin profile document
    const adminDoc = await adminDb.collection('admins').doc(uid).get()
    if (!adminDoc.exists) {
      return NextResponse.json({ error: 'Forbidden: Admin profile not found' }, { status: 403 })
    }

    const data = adminDoc.data()
    if (!data) {
      return NextResponse.json({ error: 'Forbidden: Admin profile is empty' }, { status: 403 })
    }

    const status = data.status || 'active'
    if (status === 'suspended') {
      return NextResponse.json({ error: 'Forbidden: Admin account is suspended' }, { status: 403 })
    }

    // Resolve role: existing admin profile without explicit role or with 'admin' maps to 'super_admin'
    const role: UserRole =
      (data.role === 'admin' || data.role === 'super_admin' || !data.role)
        ? 'super_admin'
        : (data.role as UserRole)
    
    // DEFAULT TO NO ACCESS: If permissions field is missing, strictly default to EMPTY_PERMISSIONS
    // (Only an explicit super_admin receives SUPER_ADMIN_PERMISSIONS)
    const permissions =
      role === 'super_admin'
        ? (data.permissions || SUPER_ADMIN_PERMISSIONS)
        : (data.permissions || EMPTY_PERMISSIONS)

    // Set custom user claims so Firestore rules and client token reflect role & permissions
    await adminAuth.setCustomUserClaims(uid, {
      role,
      status,
      permissions
    })

    return NextResponse.json({
      success: true,
      synced: true,
      role,
      status,
      permissions
    })
  } catch (error: unknown) {
    console.error('Error syncing custom claims:', error)
    const message = error instanceof Error ? error.message : 'Internal error syncing claims'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
