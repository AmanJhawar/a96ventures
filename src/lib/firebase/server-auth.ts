import { NextRequest } from 'next/server'
import { adminAuth, adminDb, FIREBASE_PROJECT_ID } from '@/lib/firebase/admin'
import {
  SUPER_ADMIN_PERMISSIONS,
  EMPTY_PERMISSIONS
} from '@/lib/constants/permissions'
import { UserPermissions } from '@/lib/types'

export const HARDCODED_PROJECT_ID = FIREBASE_PROJECT_ID
export const EXPECTED_ISSUER = `https://securetoken.google.com/${HARDCODED_PROJECT_ID}`

export interface AuthenticatedCaller {
  callerUid: string
  callerData: {
    email: string
    displayName: string
    role: string
    status: string
    assignedLocationId?: string
    assignedLocationName?: string
    [key: string]: unknown
  }
  isSuperAdmin: boolean
  callerPermissions: UserPermissions
  decodedToken: Record<string, unknown>
}

export type AuthResult =
  | { ok: true; caller: AuthenticatedCaller }
  | { ok: false; status: 401 | 403; error: string }

/**
 * Validates the caller's Firebase ID token cryptographically with Google's public certs,
 * validates audience, issuer, expiration, and loads their admin permissions and active status.
 */
export async function getAuthenticatedCaller(req: NextRequest): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Unauthorized: Missing token' }
  }

  const token = authHeader.split('Bearer ')[1]?.trim()
  if (!token) {
    return { ok: false, status: 401, error: 'Unauthorized: Empty token' }
  }

  try {
    // 1. Verify token signature against Google's public x509 certs
    const decoded = await adminAuth.verifyIdToken(token)

    // 2. Strict Hard-coded checks for Project ID, Audience, Issuer, and Expiry
    if (decoded.aud !== HARDCODED_PROJECT_ID) {
      return { ok: false, status: 403, error: `Forbidden: Invalid token audience (${decoded.aud})` }
    }
    if (decoded.iss !== EXPECTED_ISSUER) {
      return { ok: false, status: 403, error: `Forbidden: Invalid token issuer (${decoded.iss})` }
    }
    if (decoded.exp && Date.now() / 1000 > decoded.exp) {
      return { ok: false, status: 401, error: 'Unauthorized: Token expired' }
    }

    const callerUid = decoded.uid

    // 3. Look up caller in /admins/{uid} collection
    // TREAT MISSING PROFILE AS AN ERROR: Never fail open or grant access without profile document
    const callerDoc = await adminDb.collection('admins').doc(callerUid).get()
    if (!callerDoc.exists) {
      return { ok: false, status: 403, error: 'Forbidden: Admin profile not found' }
    }

    const callerData = callerDoc.data()
    if (!callerData) {
      return { ok: false, status: 403, error: 'Forbidden: Admin profile is empty' }
    }

    const status = callerData.status || 'active'
    if (status === 'suspended') {
      return { ok: false, status: 403, error: 'Forbidden: Admin account is suspended' }
    }

    // Resolve role: existing admin profile without explicit role or with 'admin' maps to 'super_admin'
    const role =
      (callerData.role === 'admin' || callerData.role === 'super_admin' || !callerData.role)
        ? 'super_admin'
        : callerData.role

    const isSuperAdmin = role === 'super_admin'

    // DEFAULT TO NO ACCESS: If permissions field is missing, default strictly to EMPTY_PERMISSIONS
    // (Only an explicit active super_admin receives SUPER_ADMIN_PERMISSIONS)
    const callerPermissions: UserPermissions = isSuperAdmin
      ? SUPER_ADMIN_PERMISSIONS
      : (callerData.permissions || EMPTY_PERMISSIONS)

    return {
      ok: true,
      caller: {
        callerUid,
        callerData: {
          ...callerData,
          email: callerData.email || (decoded.email as string) || '',
          displayName: callerData.displayName || callerData.name || (decoded.name as string) || 'Operator',
          role: callerData.role,
          status: callerData.status || 'active'
        },
        isSuperAdmin,
        callerPermissions,
        decodedToken: decoded
      }
    }
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string }
    if (error.code === 'auth/id-token-expired') {
      return { ok: false, status: 401, error: 'Unauthorized: Token expired' }
    }
    if (error.code === 'auth/id-token-revoked') {
      return { ok: false, status: 401, error: 'Unauthorized: Token has been revoked' }
    }
    if (error.code === 'auth/user-disabled') {
      return { ok: false, status: 403, error: 'Forbidden: User account is disabled' }
    }
    return {
      ok: false,
      status: 401,
      error: `Unauthorized: ${error.message || 'Invalid token signature'}`
    }
  }
}

/**
 * Checks if the caller has permission for a specific module and action.
 */
export function hasModulePermission(
  caller: AuthenticatedCaller,
  module: keyof UserPermissions,
  action: string
): boolean {
  if (caller.isSuperAdmin) return true
  const modulePerms = caller.callerPermissions[module] as Record<string, boolean> | undefined
  return Boolean(modulePerms?.[action])
}
