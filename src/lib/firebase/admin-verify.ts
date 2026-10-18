/**
 * admin-verify.ts
 * 
 * Cryptographically verifies Firebase ID tokens using Firebase Admin SDK (verifyIdToken),
 * strictly asserting the signature against Google's public x509 certs, along with
 * hard-coded checks for project ID, audience, issuer, and expiration.
 */

import { adminAuth, adminDb, FIREBASE_PROJECT_ID } from '@/lib/firebase/admin'
import { DecodedIdToken } from 'firebase-admin/auth'

// HARD-CODED PROJECT ID: Enforces absolute immunity against cross-project token leakage
export const HARDCODED_PROJECT_ID = 'a96ventures-979e6'
export const EXPECTED_ISSUER = `https://securetoken.google.com/${HARDCODED_PROJECT_ID}`

export type VerifyResult =
  | { ok: true; uid: string; projectId: string; token: DecodedIdToken }
  | { ok: false; status: 401 | 403; message: string }

/**
 * Verifies a Firebase ID token:
 * 1. Checks Authorization header formatting.
 * 2. Cryptographically verifies token signature via Firebase Admin SDK with Google's public certs.
 * 3. Asserts Audience matches HARDCODED_PROJECT_ID ('a96ventures-979e6').
 * 4. Asserts Issuer matches EXPECTED_ISSUER ('https://securetoken.google.com/a96ventures-979e6').
 * 5. Asserts token expiration timestamp.
 * 6. Checks /admins/{uid} collection to confirm active admin status.
 */
export async function verifyAdminToken(authHeader: string | null): Promise<VerifyResult> {
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, message: 'Unauthorized: Missing token' }
  }

  const token = authHeader.split('Bearer ')[1]?.trim()
  if (!token) {
    return { ok: false, status: 401, message: 'Unauthorized: Empty token' }
  }

  try {
    // 1. Cryptographically verify signature using Google's public certs
    const decoded = await adminAuth.verifyIdToken(token)

    // 2. Strict Hard-coded Audience Validation
    if (decoded.aud !== HARDCODED_PROJECT_ID) {
      return {
        ok: false,
        status: 403,
        message: `Forbidden: Token audience mismatch (expected ${HARDCODED_PROJECT_ID}, got ${decoded.aud})`
      }
    }

    // 3. Strict Hard-coded Issuer Validation
    if (decoded.iss !== EXPECTED_ISSUER) {
      return {
        ok: false,
        status: 403,
        message: `Forbidden: Token issuer mismatch (expected ${EXPECTED_ISSUER}, got ${decoded.iss})`
      }
    }

    // 4. Strict Expiry Validation
    if (decoded.exp && Date.now() / 1000 > decoded.exp) {
      return { ok: false, status: 401, message: 'Unauthorized: Token expired' }
    }

    // 5. Verify User Profile & Active Status in Firestore
    // TREAT MISSING PROFILE AS AN ERROR: Never fail open without admin profile document
    const adminDoc = await adminDb.collection('admins').doc(decoded.uid).get()
    if (!adminDoc.exists) {
      return { ok: false, status: 403, message: 'Forbidden: Admin profile not found' }
    }

    const adminData = adminDoc.data()
    if (!adminData) {
      return { ok: false, status: 403, message: 'Forbidden: Admin profile is empty' }
    }

    const status = adminData.status || 'active'
    if (status === 'suspended') {
      return { ok: false, status: 403, message: 'Forbidden: Admin account is suspended' }
    }

    return {
      ok: true,
      uid: decoded.uid,
      projectId: HARDCODED_PROJECT_ID,
      token: decoded
    }
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string }
    console.error('verifyAdminToken failed signature/claims validation:', error)

    if (error.code === 'auth/id-token-expired') {
      return { ok: false, status: 401, message: 'Unauthorized: Token expired' }
    }
    if (error.code === 'auth/id-token-revoked') {
      return { ok: false, status: 401, message: 'Unauthorized: Token has been revoked' }
    }
    if (error.code === 'auth/user-disabled') {
      return { ok: false, status: 403, message: 'Forbidden: User account is disabled' }
    }
    if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
      return { ok: false, status: 401, message: 'Unauthorized: Invalid token signature or format' }
    }

    return {
      ok: false,
      status: 401,
      message: error.message ? `Unauthorized: ${error.message}` : 'Unauthorized: Invalid token'
    }
  }
}
