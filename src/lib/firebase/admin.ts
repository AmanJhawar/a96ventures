import { initializeApp, getApps, getApp, cert, App } from 'firebase-admin/app'
import { getAuth, Auth } from 'firebase-admin/auth'
import { getFirestore, Firestore } from 'firebase-admin/firestore'

// HARDCODED PROJECT ID: Strict single-project binding to prevent cross-project token reuse
export const FIREBASE_PROJECT_ID = 'a96ventures-979e6'
const projectId = FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = process.env.FIREBASE_PRIVATE_KEY
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  : undefined

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

  // Fallback for environments with application default credentials or test environments
  return initializeApp({ projectId })
}

const adminApp = initializeFirebaseAdmin()

export const adminAuth: Auth = getAuth(adminApp)
export const adminDb: Firestore = getFirestore(adminApp)

export { adminApp }
