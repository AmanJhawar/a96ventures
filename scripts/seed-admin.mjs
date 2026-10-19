/**
 * Server script to seed or reset the Super Admin account in Firebase Auth and Firestore.
 * Credentials are read strictly from server environment variables (never exposed to browser bundles).
 * 
 * Usage:
 *   npm run seed:admin
 *   OR
 *   node --env-file=.env.local scripts/seed-admin.mjs
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const projectId = process.env.FIREBASE_PROJECT_ID || 'a96ventures-979e6'
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

if (!clientEmail || !privateKey) {
  console.error('Error: FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set in your server environment (.env.local).')
  process.exit(1)
}

const email = process.env.SEED_ADMIN_EMAIL || process.env.SEED_EMAIL || 'admin@a96ventures.com'
const password = process.env.SEED_ADMIN_PASSWORD || process.env.SEED_PASSWORD

if (!password || password.length < 6) {
  console.error('Error: SEED_ADMIN_PASSWORD must be at least 6 characters long.')
  process.exit(1)
}

const app = getApps().length === 0
  ? initializeApp({
      projectId,
      credential: cert({
        projectId,
        clientEmail,
        privateKey
      })
    })
  : getApps()[0]

const auth = getAuth(app)
const db = getFirestore(app)

const SUPER_ADMIN_PERMISSIONS = {
  products: { view: true, add: true, edit: true, delete: true },
  purchases: { view: true, add: true, delete: true },
  movements: {
    view: true,
    transfer: true,
    adjustment: true,
    repair: true,
    melt: true,
    delete: true
  },
  sales: { view: true, add: true, delete: true },
  returns: { view: true, add: true, delete: true },
  inquiries: { view: true, edit: true, delete: true },
  locations: { view: true, add: true, edit: true, delete: true },
  brands: { view: true, add: true, edit: true, delete: true },
  team: { view: true, add: true, edit: true, delete: true },
  portfolio: { view: true, add: true, edit: true, delete: true },
  reports: { view: true, export: true },
  archive: { zeroBalance: true, uploadArchive: true },
  users: { view: true, add: true, edit: true, delete: true }
}

async function seedAdmin() {
  console.log(`\n--- Seeding Super Admin Account ---`)
  console.log(`Target Email: ${email}`)

  let userRecord
  try {
    userRecord = await auth.getUserByEmail(email)
    console.log(`Existing user found (UID: ${userRecord.uid}). Updating credentials...`)
    await auth.updateUser(userRecord.uid, {
      password,
      disabled: false
    })
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      console.log(`Creating new Firebase Auth user...`)
      userRecord = await auth.createUser({
        email,
        password,
        displayName: 'Super Admin',
        disabled: false
      })
    } else {
      throw err
    }
  }

  // Set Custom User Claims
  console.log(`Setting custom claims (role: super_admin, status: active)...`)
  await auth.setCustomUserClaims(userRecord.uid, {
    role: 'super_admin',
    status: 'active'
  })

  // Set/merge Admin profile document in Firestore /admins/{uid}
  console.log(`Writing /admins/${userRecord.uid} document in Firestore...`)
  const now = new Date().toISOString()
  await db.collection('admins').doc(userRecord.uid).set({
    email,
    displayName: 'Super Admin',
    role: 'super_admin',
    status: 'active',
    permissions: SUPER_ADMIN_PERMISSIONS,
    updatedAt: now,
    createdAt: userRecord.metadata.creationTime || now
  }, { merge: true })

  console.log(`\n[SUCCESS] Super Admin account seeded successfully!`)
  console.log(`Email: ${email}`)
  console.log(`UID: ${userRecord.uid}`)
  console.log(`Role: super_admin\n`)
}

seedAdmin().catch((err) => {
  console.error('\n[FAILED] Seed script error:', err)
  process.exit(1)
})
