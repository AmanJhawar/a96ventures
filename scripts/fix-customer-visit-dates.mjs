/**
 * Customer Visit Dates & Stats Fix Script
 * 
 * Recomputes firstVisitAt, lastVisitAt, visitCount, and openFollowUps for every customer
 * from their historical visit documents in the `visits` collection.
 * 
 * Rules:
 * - firstVisitAt and lastVisitAt are formatted strictly as YYYY-MM-DD.
 * - If a customer has 0 visits, firstVisitAt and lastVisitAt are unset.
 * - visitCount = total number of visits linked to customerId.
 * - openFollowUps = count of visits where followUpOn is set and followUpDone is falsy.
 * - Dry-run by default. Use --commit flag to apply updates to Firestore.
 * 
 * Usage:
 *   node scripts/fix-customer-visit-dates.mjs
 *   node --env-file=.env.local scripts/fix-customer-visit-dates.mjs --commit
 */

import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const args = process.argv.slice(2)
const isCommit = args.includes('--commit')

console.log('='.repeat(70))
console.log(' A96 CRM Customer Visit Dates & Stats Recompute Utility')
console.log('='.repeat(70))
console.log(`Execution Mode: ${isCommit ? 'COMMIT (Writing to Firestore)' : 'DRY-RUN (Default - No writes)'}`)
if (!isCommit) {
  console.log('Pass "--commit" to apply changes to database.\n')
} else {
  console.log('Applying changes directly to Firestore database...\n')
}

// Initialize Firebase Admin
const projectId = process.env.FIREBASE_PROJECT_ID || 'a96ventures-979e6'
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

let app
if (getApps().length > 0) {
  app = getApps()[0]
} else if (clientEmail && privateKey) {
  app = initializeApp({
    projectId,
    credential: cert({ projectId, clientEmail, privateKey })
  })
} else {
  app = initializeApp({ projectId, credential: applicationDefault() })
}

const db = getFirestore(app)

export function extractDateString(input) {
  if (!input) return null
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10)
    }
  }
  if (input instanceof Date && !isNaN(input.getTime())) {
    return input.toISOString().slice(0, 10)
  }
  return null
}

export function computeCustomerVisitStats(visits) {
  const visitCount = visits.length
  if (visitCount === 0) {
    return {
      firstVisitAt: null,
      lastVisitAt: null,
      visitCount: 0,
      openFollowUps: 0
    }
  }

  const validDates = visits
    .map((v) => extractDateString(v.at) || extractDateString(v.createdAt))
    .filter(Boolean)

  validDates.sort()

  const firstVisitAt = validDates.length > 0 ? validDates[0] : null
  const lastVisitAt = validDates.length > 0 ? validDates[validDates.length - 1] : null

  const openFollowUps = visits.filter((v) => Boolean(v.followUpOn && !v.followUpDone)).length

  return {
    firstVisitAt,
    lastVisitAt,
    visitCount,
    openFollowUps
  }
}

async function main() {
  console.log('Fetching all customers and visits from Firestore...')

  const [customersSnap, visitsSnap] = await Promise.all([
    db.collection('customers').get(),
    db.collection('visits').get()
  ])

  console.log(`Loaded ${customersSnap.docs.length} customer(s) and ${visitsSnap.docs.length} visit record(s).`)

  // Group visits by customerId
  const visitsByCustomer = new Map()
  for (const vDoc of visitsSnap.docs) {
    const v = vDoc.data()
    const cId = v.customerId
    if (!cId) continue
    if (!visitsByCustomer.has(cId)) {
      visitsByCustomer.set(cId, [])
    }
    visitsByCustomer.get(cId).push({ id: vDoc.id, ...v })
  }

  const updates = []

  for (const cDoc of customersSnap.docs) {
    const cData = cDoc.data()
    const customerVisits = visitsByCustomer.get(cDoc.id) || []
    const computed = computeCustomerVisitStats(customerVisits)

    const currentStats = cData.stats || {}
    const currentFirst = currentStats.firstVisitAt ? extractDateString(currentStats.firstVisitAt) : null
    const currentLast = currentStats.lastVisitAt ? extractDateString(currentStats.lastVisitAt) : null
    const currentCount = currentStats.visitCount || 0
    const currentOpen = currentStats.openFollowUps || 0

    const needsFirstUpdate = computed.firstVisitAt !== currentFirst
    const needsLastUpdate = computed.lastVisitAt !== currentLast
    const needsCountUpdate = computed.visitCount !== currentCount
    const needsOpenUpdate = computed.openFollowUps !== currentOpen

    if (needsFirstUpdate || needsLastUpdate || needsCountUpdate || needsOpenUpdate) {
      const fieldUpdates = {
        'stats.visitCount': computed.visitCount,
        'stats.openFollowUps': computed.openFollowUps
      }

      if (computed.firstVisitAt) {
        fieldUpdates['stats.firstVisitAt'] = computed.firstVisitAt
      } else {
        fieldUpdates['stats.firstVisitAt'] = FieldValue.delete()
      }

      if (computed.lastVisitAt) {
        fieldUpdates['stats.lastVisitAt'] = computed.lastVisitAt
      } else {
        fieldUpdates['stats.lastVisitAt'] = FieldValue.delete()
      }

      updates.push({
        id: cDoc.id,
        name: cData.displayName || `${cData.firstName || ''} ${cData.lastName || ''}`.trim() || cDoc.id,
        before: {
          firstVisitAt: currentFirst,
          lastVisitAt: currentLast,
          visitCount: currentCount,
          openFollowUps: currentOpen
        },
        after: computed,
        fieldUpdates
      })
    }
  }

  console.log(`\nAnalysis Result: ${updates.length} of ${customersSnap.docs.length} customer(s) require stats updates.\n`)

  if (updates.length > 0) {
    console.log('Sample Updates (up to 10):')
    for (const u of updates.slice(0, 10)) {
      console.log(`- [${u.id}] ${u.name}:`)
      console.log(`    Before: first=${u.before.firstVisitAt}, last=${u.before.lastVisitAt}, visits=${u.before.visitCount}, openFollowUps=${u.before.openFollowUps}`)
      console.log(`    After:  first=${u.after.firstVisitAt}, last=${u.after.lastVisitAt}, visits=${u.after.visitCount}, openFollowUps=${u.after.openFollowUps}`)
    }
  }

  if (!isCommit) {
    console.log('\n[DRY RUN COMPLETE] No records were modified in Firestore.')
    console.log('To apply these updates, run with the --commit flag:')
    console.log('  node --env-file=.env.local scripts/fix-customer-visit-dates.mjs --commit')
    return
  }

  console.log('\nCommitting updates in batches...')
  const BATCH_SIZE = 400
  let batch = db.batch()
  let countInBatch = 0
  let totalCommitted = 0

  for (const u of updates) {
    const docRef = db.collection('customers').doc(u.id)
    batch.update(docRef, u.fieldUpdates)
    countInBatch++

    if (countInBatch >= BATCH_SIZE) {
      await batch.commit()
      totalCommitted += countInBatch
      console.log(`Committed batch of ${countInBatch} updates (Total so far: ${totalCommitted})`)
      batch = db.batch()
      countInBatch = 0
    }
  }

  if (countInBatch > 0) {
    await batch.commit()
    totalCommitted += countInBatch
    console.log(`Committed final batch of ${countInBatch} updates.`)
  }

  console.log(`\n[SUCCESS] Successfully updated visit stats for ${totalCommitted} customer(s).`)
}

// Execute if run directly from CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Fatal error during fix-customer-visit-dates execution:', err)
    process.exit(1)
  })
}
