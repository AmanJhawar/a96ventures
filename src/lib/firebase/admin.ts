import { initializeApp, getApps, getApp, cert, App } from 'firebase-admin/app'
import { getAuth, Auth } from 'firebase-admin/auth'
import { getFirestore, Firestore } from 'firebase-admin/firestore'

// HARDCODED PROJECT ID: Strict single-project binding to prevent cross-project token reuse
export const FIREBASE_PROJECT_ID = 'a96ventures-979e6'
const projectId = FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL

function cleanPrivateKey(key: string | undefined): string | undefined {
  if (!key) return undefined
  let cleaned = key.trim()
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1)
  }
  return cleaned.replace(/\\n/g, '\n')
}

const privateKey = cleanPrivateKey(process.env.FIREBASE_PRIVATE_KEY)

function initializeFirebaseAdmin(): App {
  if (getApps().length > 0) {
    return getApp()
  }

  if (clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    })
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[FirebaseAdmin] Warning: FIREBASE_CLIENT_EMAIL and/or FIREBASE_PRIVATE_KEY environment variables are missing. Server-side Firebase operations requiring service account authentication will fail.'
    )
  }

  // Fallback for environments with application default credentials or test environments
  return initializeApp({ projectId })
}

const adminApp = initializeFirebaseAdmin()

export const adminAuth: Auth = getAuth(adminApp)
export const adminDb: Firestore = getFirestore(adminApp)
try {
  adminDb.settings({ ignoreUndefinedProperties: true })
} catch {
  // Settings can only be set once before any database operation
}

export { adminApp }
