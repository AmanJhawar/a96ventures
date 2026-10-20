/**
 * Customer CRM Backfill Audit Script
 * 
 * Lists current-year sale transactions that have a customerName recorded but no customerId linked.
 * Groups by normalised customer name and exports a review CSV.
 * 
 * Specification:
 * - Dry-run by default.
 * - MUST NOT create or link customers automatically (strictly an audit & grouping tool for manual review).
 * 
 * Usage:
 *   node --env-file=.env.local scripts/backfill-customers.mjs
 *   node --env-file=.env.local scripts/backfill-customers.mjs --year=2026 --out=backfill-review.csv
 */

import fs from 'node:fs'
import path from 'node:path'
import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Parse CLI flags
const args = process.argv.slice(2)
const getArg = (prefix) => {
  const match = args.find((a) => a.startsWith(prefix))
  return match ? match.split('=')[1] : null
}

const currentYear = new Date().getFullYear()
const targetYear = parseInt(getArg('--year') || String(currentYear), 10)
const outputPath = getArg('--out') || `backfill-customers-${targetYear}.csv`
const isCommit = args.includes('--commit')

console.log('='.repeat(65))
console.log(` A96 CRM Customer Backfill Audit (Year: ${targetYear})`)
console.log('='.repeat(65))
console.log(`Mode: ${isCommit ? 'Commit (Export CSV)' : 'Dry-Run (Default)'}`)
console.log('Safety: This tool strictly produces audit data and will NEVER')
console.log('        automatically create, modify, or link customer profiles.\n')

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
  // Fallback to application default or emulator
  app = initializeApp({ projectId, credential: applicationDefault() })
}

const db = getFirestore(app)

function normaliseCustomerName(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // remove punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

function extractPossiblePhones(text) {
  if (!text || typeof text !== 'string') return []
  const matches = text.match(/(?:\+91[\s-]?)?[6-9]\d{9}/g)
  return matches ? [...new Set(matches.map((m) => m.replace(/[\s-]/g, '')))] : []
}

function escapeCSV(val) {
  if (val === null || val === undefined) return '""'
  const str = String(val)
  return `"${str.replace(/"/g, '""')}"`
}

async function runAudit() {
  const startDate = `${targetYear}-01-01`
  const endDate = `${targetYear}-12-31`

  console.log(`Querying transactions between ${startDate} and ${endDate}...`)

  let snapshot
  try {
    snapshot = await db
      .collection('transactions')
      .where('type', '==', 'sale')
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .get()
  } catch (err) {
    console.warn(`Query with date range filter failed (${err.message}). Falling back to type=sale scan...`)
    snapshot = await db.collection('transactions').where('type', '==', 'sale').get()
  }

  console.log(`Found ${snapshot.docs.length} sale transactions in total.`)

  let unlinkedCount = 0
  let linkedCount = 0
  let anonymousCount = 0

  // Group by normalised customer name
  const groups = new Map()

  for (const doc of snapshot.docs) {
    const data = doc.data()
    const txDate = data.date || ''

    // Skip transactions outside the target year if fallback was used
    if (txDate && !txDate.startsWith(String(targetYear))) {
      continue
    }

    // Skip reversed transactions
    if (data.isReversed) {
      continue
    }

    const customerName = (data.customerName || '').trim()
    const customerId = (data.customerId || '').trim()

    if (!customerName) {
      anonymousCount++
      continue
    }

    if (customerId) {
      linkedCount++
      continue
    }

    unlinkedCount++
    const normName = normaliseCustomerName(customerName)
    if (!normName) continue

    const amount = Number(data.totalAmount || 0)
    const notes = data.notes || ''
    const phones = extractPossiblePhones(`${customerName} ${notes}`)

    if (!groups.has(normName)) {
      groups.set(normName, {
        normalisedName: normName,
        sampleNames: new Set([customerName]),
        transactionCount: 0,
        totalAmountINR: 0,
        detectedPhones: new Set(phones),
        sampleNotes: new Set(notes ? [notes.slice(0, 100)] : []),
        earliestDate: txDate,
        latestDate: txDate,
        transactionIds: []
      })
    }

    const group = groups.get(normName)
    group.sampleNames.add(customerName)
    group.transactionCount += 1
    group.totalAmountINR += amount
    phones.forEach((p) => group.detectedPhones.add(p))
    if (notes) group.sampleNotes.add(notes.slice(0, 100))
    group.transactionIds.push(doc.id)

    if (!group.earliestDate || txDate < group.earliestDate) group.earliestDate = txDate
    if (!group.latestDate || txDate > group.latestDate) group.latestDate = txDate
  }

  console.log('\nAudit Results:')
  console.log(`- Transactions with existing customerId (Already linked): ${linkedCount}`)
  console.log(`- Anonymous transactions (No name specified):           ${anonymousCount}`)
  console.log(`- Unlinked transactions with customerName:             ${unlinkedCount}`)
  console.log(`- Unique customer name groups identified:               ${groups.size}`)

  // Sort groups by transaction count descending, then total amount descending
  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    if (b.transactionCount !== a.transactionCount) {
      return b.transactionCount - a.transactionCount
    }
    return b.totalAmountINR - a.totalAmountINR
  })

  // Display top 10 preview
  console.log('\nTop 10 Unlinked Customer Groups:')
  console.log('-'.repeat(80))
  console.log(
    '#'.padEnd(4) +
    'Customer Name (Sample)'.padEnd(30) +
    'Sales'.padEnd(8) +
    'Total (INR)'.padEnd(16) +
    'Date Range'
  )
  console.log('-'.repeat(80))

  sortedGroups.slice(0, 10).forEach((g, idx) => {
    const sample = Array.from(g.sampleNames)[0]
    const count = String(g.transactionCount).padEnd(8)
    const amount = `₹${Math.round(g.totalAmountINR).toLocaleString('en-IN')}`.padEnd(16)
    const dates = `${g.earliestDate} to ${g.latestDate}`
    console.log(`${String(idx + 1).padEnd(4)}${sample.slice(0, 28).padEnd(30)}${count}${amount}${dates}`)
  })
  console.log('-'.repeat(80))

  // Generate CSV
  const csvHeaders = [
    'Normalised Name',
    'Sample Display Names',
    'Transaction Count',
    'Total Sales (INR)',
    'Detected Phones',
    'Earliest Sale Date',
    'Latest Sale Date',
    'Sample Notes',
    'Sample Transaction IDs'
  ]

  const csvRows = sortedGroups.map((g) => [
    escapeCSV(g.normalisedName),
    escapeCSV(Array.from(g.sampleNames).join(' | ')),
    g.transactionCount,
    g.totalAmountINR.toFixed(2),
    escapeCSV(Array.from(g.detectedPhones).join(', ')),
    escapeCSV(g.earliestDate),
    escapeCSV(g.latestDate),
    escapeCSV(Array.from(g.sampleNotes).join(' ; ')),
    escapeCSV(g.transactionIds.slice(0, 5).join(', '))
  ])

  const csvContent = [
    csvHeaders.join(','),
    ...csvRows.map((r) => r.join(','))
  ].join('\n')

  const resolvedOut = path.resolve(outputPath)
  fs.writeFileSync(resolvedOut, csvContent, 'utf-8')

  console.log(`\nReview CSV successfully exported to:`)
  console.log(`  ${resolvedOut}`)
  console.log(`\nNext Steps for Store Staff:`)
  console.log(`  1. Review ${path.basename(resolvedOut)} in Excel / Google Sheets.`)
  console.log(`  2. For high-volume clients, verify identity & phone.`)
  console.log(`  3. Manually create customer profiles through /admin/customers/new.`)
  console.log(`  4. Future orders will automatically associate with the verified customer.\n`)
}

runAudit()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill audit failed:', err)
    process.exit(1)
  })
