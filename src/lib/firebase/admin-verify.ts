/**
 * admin-verify.ts
 * 
 * Edge-compatible Firebase admin token verification using the Firestore REST API.
 * This avoids bundling firebase-admin (which requires native Node.js modules)
 * into the Edge/Cloudflare runtime.
 */

export type VerifyResult =
  | { ok: true; uid: string; projectId: string }
  | { ok: false; status: 401 | 403; message: string }

/**
 * Verifies a Firebase ID token and checks the user is in the /admins collection.
 * Uses the Firestore REST API directly — no firebase-admin required.
 */
export async function verifyAdminToken(authHeader: string | null): Promise<VerifyResult> {
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, message: 'Unauthorized: Missing token' }
  }

  const token = authHeader.split('Bearer ')[1]

  try {
    // Decode JWT payload (base64url encoded)
    const payloadBase64 = token.split('.')[1]
    let base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/')
    const pad = base64.length % 4
    if (pad) base64 += '='.repeat(4 - pad)

    const payload = JSON.parse(atob(base64))
    const uid: string = payload.user_id
    const projectId: string = payload.aud

    if (!uid || !projectId) {
      return { ok: false, status: 401, message: 'Unauthorized: Invalid token payload' }
    }

    // Verify token validity AND admin status in one request.
    // Firestore security rules allow users to read only their own /admins/{uid} document.
    // A forged/expired token → 401/403 from Firebase. A non-admin user → 404.
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/admins/${uid}`
    const res = await fetch(firestoreUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.status === 404) {
      return { ok: false, status: 403, message: 'Forbidden: Admin access required' }
    }
    if (!res.ok) {
      return { ok: false, status: 401, message: `Unauthorized: Token verification failed (${res.status})` }
    }

    return { ok: true, uid, projectId }
  } catch {
    return { ok: false, status: 401, message: 'Unauthorized: Invalid token' }
  }
}
