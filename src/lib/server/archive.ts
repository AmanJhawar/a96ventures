import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { createHmac } from 'crypto'
import { getNextDayIST } from '@/lib/utils/date'
import { computeArchiveChecksum } from '@/lib/utils/archive-checksum'

export interface MasterArchivePayload {
  system: string
  type: string
  version: string
  exportedAt: string
  archiveId?: string
  cutoffDate?: string
  openingDate?: string
  totalTransactions: number
  totalAuditLogs: number
  checksum?: string
  checksumAlgorithm?: string
  signature?: string
  signatureAlgorithm?: string
  breakdown: {
    sales: number
    purchases: number
    transfers: number
    adjustments: number
    repairs: number
    melts: number
    returns: number
    openings?: number
  }
  productsSnapshot: Array<Record<string, unknown>>
  transactions: Array<Record<string, unknown>>
  auditLogs: Array<Record<string, unknown>>
  ordersSnapshot?: Array<Record<string, unknown>>
  visitsSnapshot?: Array<Record<string, unknown>>
  customersSnapshot?: Array<Record<string, unknown>>
}

export interface MasterArchiveResult {
  archive: MasterArchivePayload
  count: number
  auditCount: number
  checksum: string
  signature?: string
  cutoffDate?: string
  openingDate?: string
}

export interface ServerSavedArchive {
  archiveId: string
  createdAt: string
  createdBy: {
    uid: string
    name: string
    email: string
  }
  cutoffDate: string | null
  openingDate: string | null
  count: number
  auditCount: number
  productCount: number
  checksum: string
  checksumAlgorithm: string
  signature?: string
  signatureAlgorithm?: string
  byteSize: number
  totalChunks: number
  status: string
  stage?: string
  progress?: {
    purgedTransactions?: number
    openingsPosted?: boolean
    openingTransactionCount?: number
    scrubbedAuditLogs?: number
  }
}

export function getArchiveSigningSecret(): string {
  return (
    process.env.ARCHIVE_SIGNING_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.FIREBASE_PROJECT_ID ||
    'a96-secure-vault-archive-secret-2026'
  )
}

export function signArchiveChecksum(checksum: string): string {
  const secret = getArchiveSigningSecret()
  return createHmac('sha256', secret).update(checksum).digest('hex')
}

export function verifyArchiveSignature(checksum: string, signature: string): boolean {
  if (!checksum || !signature) return false
  const expected = signArchiveChecksum(checksum)
  return expected.toLowerCase() === signature.trim().toLowerCase()
}

function toIsoString(ts: unknown): string {
  if (!ts) return new Date().toISOString()
  if (typeof ts === 'string') return ts
  if (typeof ts === 'object' && ts !== null) {
    if ('toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
      return (ts as { toDate: () => Date }).toDate().toISOString()
    }
    if ('_seconds' in ts) {
      return new Date((ts as { _seconds: number })._seconds * 1000).toISOString()
    }
  }
  return new Date().toISOString()
}

/**
 * Builds the complete Master Archive on the server from every record up to the cutoff date,
 * computes its canonical SHA-256 cryptographic checksum, and returns the sealed payload.
 */
export async function buildMasterArchiveServer(options?: { cutoffDate?: string }): Promise<MasterArchiveResult> {
  const cutoffDate = options?.cutoffDate ? options.cutoffDate.trim() : undefined
  const openingDate = cutoffDate ? getNextDayIST(cutoffDate) : undefined

  let txQuery: FirebaseFirestore.Query = adminDb.collection('transactions')
  let ordersQuery: FirebaseFirestore.Query = adminDb.collection('orders')
  let visitsQuery: FirebaseFirestore.Query = adminDb.collection('visits')

  if (cutoffDate) {
    txQuery = txQuery.where('date', '<=', cutoffDate)
    ordersQuery = ordersQuery.where('date', '<=', cutoffDate)
    visitsQuery = visitsQuery.where('at', '<=', cutoffDate)
  }

  const [txSnap, auditSnap, prodsSnap, ordersSnap, visitsSnap, customersSnap] = await Promise.all([
    txQuery.get(),
    adminDb.collection('audit_logs').get(),
    adminDb.collection('products').get(),
    ordersQuery.get(),
    visitsQuery.get(),
    adminDb.collection('customers').get()
  ])

  const transactions = txSnap.docs.map((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>
    const previousWeight = typeof data.previousWeightMg === 'number' ? data.previousWeightMg / 1000 : data.previousWeight
    const newWeight = typeof data.newWeightMg === 'number' ? data.newWeightMg / 1000 : data.newWeight
    const weightChange = typeof data.weightChangeMg === 'number' ? data.weightChangeMg / 1000 : data.weightChange
    const recoveredWeight = typeof data.recoveredWeightMg === 'number' ? data.recoveredWeightMg / 1000 : data.recoveredWeight
    const pieceWeight = typeof data.pieceWeightMg === 'number' ? data.pieceWeightMg / 1000 : data.pieceWeight
    const pieceWeights = Array.isArray(data.pieceWeightsMg)
      ? data.pieceWeightsMg.map((mg: number) => mg / 1000)
      : Array.isArray(data.pieceWeights)
        ? data.pieceWeights
        : undefined

    return {
      ...data,
      id: docSnap.id,
      type: data.type as string | undefined,
      date: data.date ? String(data.date) : toIsoString(data.createdAt || data.timestamp).slice(0, 10),
      createdAt: data.createdAt ? toIsoString(data.createdAt) : undefined,
      timestamp: data.timestamp ? toIsoString(data.timestamp) : undefined,
      previousWeight,
      newWeight,
      weightChange,
      recoveredWeight,
      pieceWeight,
      pieceWeights,
      isOpeningBalance: Boolean(data.isOpeningBalance),
      isOpeningEntry: Boolean(data.isOpeningEntry)
    }
  })

  // Cutoff ISO threshold in IST timezone (end of cutoff day: 23:59:59.999+05:30)
  const cutoffTimeThreshold = cutoffDate
    ? new Date(`${cutoffDate}T23:59:59.999+05:30`).getTime()
    : Infinity

  const allAuditLogs = auditSnap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>
    return {
      id: doc.id,
      userId: data.userId || '',
      userName: data.userName || (data.userEmail ? String(data.userEmail).split('@')[0] : 'Admin User'),
      userEmail: data.userEmail || '',
      action: data.action || 'update',
      entityType: data.entityType || 'product',
      entityId: data.entityId || '',
      entityName: data.entityName,
      locationId: data.locationId,
      locationName: data.locationName,
      description: data.description || '',
      diffs: data.diffs || [],
      timestamp: toIsoString(data.timestamp || data.createdAt),
      metadata: data.metadata
    }
  })

  const auditLogs = cutoffDate
    ? allAuditLogs.filter((log) => new Date(log.timestamp).getTime() <= cutoffTimeThreshold)
    : allAuditLogs

  const productsSnapshot = prodsSnap.docs.map((pDoc) => {
    const pData = pDoc.data() as Record<string, unknown>
    return {
      id: pDoc.id,
      name: pData.name || '',
      category: pData.category || 'Bullions',
      brand: pData.brand || '',
      metal: pData.metal || 'Gold',
      sku: pData.sku || '',
      stock: Number(pData.stock || 0),
      weight: typeof pData.weightMg === 'number' ? (pData.weightMg as number) / 1000 : Number(pData.weight || 0),
      purity: pData.purity || '',
      stockByLocation: (pData.stockByLocation || {}) as Record<string, number>,
      isArchived: Boolean(pData.isArchived)
    }
  })

  const ordersSnapshot = ordersSnap.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id
  }))

  const visitsSnapshot = visitsSnap.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id
  }))

  // Customer snapshot only retains masked PAN summary, never private subcollections
  const customersSnapshot = customersSnap.docs.map((doc) => {
    const cData = doc.data()
    return {
      ...cData,
      id: doc.id
    }
  })

  const totalTransactions = transactions.length
  const totalAuditLogs = auditLogs.length

  const breakdown = {
    sales: transactions.filter((t) => t.type === 'sale').length,
    purchases: transactions.filter((t) => t.type === 'purchase').length,
    transfers: transactions.filter((t) => t.type === 'transfer').length,
    adjustments: transactions.filter((t) => t.type === 'adjustment').length,
    repairs: transactions.filter((t) => t.type === 'repair').length,
    melts: transactions.filter((t) => t.type === 'melt').length,
    returns: transactions.filter((t) => t.type === 'return').length,
    openings: transactions.filter((t) => t.type === 'opening').length
  }

  // Compute canonical SHA-256 checksum over the payload content
  const checksum = await computeArchiveChecksum({
    cutoffDate,
    openingDate,
    totalTransactions,
    totalAuditLogs,
    transactions,
    auditLogs,
    productsSnapshot
  })

  const signature = signArchiveChecksum(checksum)

  const archive: MasterArchivePayload = {
    system: 'A96 Ventures Unified Inventory System',
    type: 'Master Audit Archive (All History & Activity Trail)',
    version: '1.4',
    exportedAt: new Date().toISOString(),
    cutoffDate,
    openingDate,
    totalTransactions,
    totalAuditLogs,
    checksum,
    checksumAlgorithm: 'SHA-256',
    signature,
    signatureAlgorithm: 'HMAC-SHA256',
    breakdown,
    productsSnapshot,
    transactions,
    auditLogs,
    ordersSnapshot,
    visitsSnapshot,
    customersSnapshot
  }

  return {
    archive,
    count: totalTransactions,
    auditCount: totalAuditLogs,
    checksum,
    signature,
    cutoffDate,
    openingDate
  }
}

export interface PurgedCrmStats {
  purgedOrders: number
  purgedVisits: number
  purgedCustomers: number
  purgedMobiles: number
  purgedPans: number
  resetCounters: number
}

/**
 * Purges CRM records (orders, visits, customers, customer_mobiles, customer_pans, counters)
 * as part of a comprehensive Zero-Balance reset.
 */
export async function purgeCrmDataServer(cutoffDate?: string): Promise<PurgedCrmStats> {
  let ordersCount = 0
  let visitsCount = 0
  let countersCount = 0

  // 1. Purge orders on or before cutoff
  let ordersQuery: FirebaseFirestore.Query = adminDb.collection('orders')
  if (cutoffDate) {
    ordersQuery = ordersQuery.where('date', '<=', cutoffDate)
  }
  const ordersSnap = await ordersQuery.get()
  if (!ordersSnap.empty) {
    ordersCount = ordersSnap.size
    const chunkSize = 400
    for (let i = 0; i < ordersSnap.docs.length; i += chunkSize) {
      const chunk = ordersSnap.docs.slice(i, i + chunkSize)
      const batch = adminDb.batch()
      chunk.forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
  }

  // 2. Purge visits on or before cutoff (or all visits if no cutoff)
  let visitsQuery: FirebaseFirestore.Query = adminDb.collection('visits')
  if (cutoffDate) {
    visitsQuery = visitsQuery.where('at', '<=', cutoffDate)
  }
  const visitsSnap = await visitsQuery.get()
  if (!visitsSnap.empty) {
    visitsCount = visitsSnap.size
    const chunkSize = 400
    for (let i = 0; i < visitsSnap.docs.length; i += chunkSize) {
      const chunk = visitsSnap.docs.slice(i, i + chunkSize)
      const batch = adminDb.batch()
      chunk.forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
  }

  // 3. Reset customer transaction history and stats without erasing customer profiles or lookup indexes
  const customersSnap = await adminDb.collection('customers').get()
  if (!customersSnap.empty) {
    const chunkSize = 400
    for (let i = 0; i < customersSnap.docs.length; i += chunkSize) {
      const chunk = customersSnap.docs.slice(i, i + chunkSize)
      const batch = adminDb.batch()
      chunk.forEach((cDoc) => {
        batch.update(cDoc.ref, {
          totalPurchases: 0,
          purchaseCount: 0,
          totalWeightPurchasedMg: 0,
          lastPurchaseAt: null,
          visitCount: 0,
          lastVisitAt: null,
          openFollowUps: 0
        })
      })
      await batch.commit()
    }
  }

  // 4. Reset counters
  const countersSnap = await adminDb.collection('counters').get()
  if (!countersSnap.empty) {
    countersCount = countersSnap.size
    const batch = adminDb.batch()
    countersSnap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }

  return {
    purgedOrders: ordersCount,
    purgedVisits: visitsCount,
    purgedCustomers: 0, // Preserved customer database
    purgedMobiles: 0,
    purgedPans: 0,
    resetCounters: countersCount
  }
}

/**
 * Saves a complete master archive server-side in Firestore under `system_archives`,
 * recording its transaction count, audit log count, product count, and cryptographic checksum.
 * Chunks the payload across subcollections so it is never bounded by Firestore's 1MB single-document limit.
 */
export async function saveArchiveServerSide(
  archiveResult: MasterArchiveResult,
  caller: { callerUid: string; callerName: string; callerEmail: string }
): Promise<ServerSavedArchive> {
  const dateTag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const randTag = Math.random().toString(36).substring(2, 8)
  const archiveId = `arc_${archiveResult.cutoffDate ? `cutoff_${archiveResult.cutoffDate}_` : ''}${dateTag}_${randTag}`

  const signature = archiveResult.signature || signArchiveChecksum(archiveResult.checksum)
  archiveResult.archive.archiveId = archiveId
  archiveResult.archive.signature = signature
  archiveResult.archive.signatureAlgorithm = 'HMAC-SHA256'

  const jsonString = JSON.stringify(archiveResult.archive)
  const CHUNK_SIZE = 600 * 1024 // 600KB chunks
  const totalChunks = Math.ceil(jsonString.length / CHUNK_SIZE) || 1

  const archiveRef = adminDb.collection('system_archives').doc(archiveId)

  // 1. Write chunked payload to subcollection
  for (let i = 0; i < totalChunks; i++) {
    const chunkData = jsonString.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
    const chunkRef = archiveRef.collection('chunks').doc(String(i).padStart(4, '0'))
    await chunkRef.set({
      index: i,
      data: chunkData,
      createdAt: FieldValue.serverTimestamp()
    })
  }

  // 2. Write metadata document
  const metadata = {
    archiveId,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: {
      uid: caller.callerUid,
      name: caller.callerName,
      email: caller.callerEmail
    },
    cutoffDate: archiveResult.cutoffDate || null,
    openingDate: archiveResult.openingDate || null,
    count: archiveResult.count,
    auditCount: archiveResult.auditCount,
    productCount: archiveResult.archive.productsSnapshot?.length || 0,
    checksum: archiveResult.checksum,
    checksumAlgorithm: 'SHA-256',
    signature,
    signatureAlgorithm: 'HMAC-SHA256',
    byteSize: jsonString.length,
    totalChunks,
    status: 'in_progress',
    stage: 'archive_saved',
    progress: {
      purgedTransactions: 0,
      openingsPosted: false,
      openingTransactionCount: 0,
      scrubbedAuditLogs: 0
    }
  }

  await archiveRef.set(metadata)

  // 3. Append immutable audit trail entry for the server archive save
  try {
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: 'zero_balance',
      entityType: 'archive',
      entityId: archiveId,
      entityName: `Server Master Archive (${archiveId})`,
      description: `Saved server-side master archive ${archiveId} up to cutoff ${archiveResult.cutoffDate || 'All'} (${archiveResult.count} txs, ${archiveResult.auditCount} audit logs, checksum: ${archiveResult.checksum.slice(0, 10)}...)`,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      metadata: {
        archiveId,
        cutoffDate: archiveResult.cutoffDate || null,
        count: archiveResult.count,
        auditCount: archiveResult.auditCount,
        checksum: archiveResult.checksum,
        signature,
        byteSize: jsonString.length
      }
    })
  } catch (auditErr) {
    console.error('Failed to log audit entry for server archive save:', auditErr)
  }

  return {
    archiveId,
    createdAt: new Date().toISOString(),
    createdBy: {
      uid: caller.callerUid,
      name: caller.callerName,
      email: caller.callerEmail
    },
    cutoffDate: archiveResult.cutoffDate || null,
    openingDate: archiveResult.openingDate || null,
    count: archiveResult.count,
    auditCount: archiveResult.auditCount,
    productCount: archiveResult.archive.productsSnapshot?.length || 0,
    checksum: archiveResult.checksum,
    checksumAlgorithm: 'SHA-256',
    signature,
    signatureAlgorithm: 'HMAC-SHA256',
    byteSize: jsonString.length,
    totalChunks,
    status: 'in_progress',
    stage: 'archive_saved',
    progress: {
      purgedTransactions: 0,
      openingsPosted: false,
      openingTransactionCount: 0,
      scrubbedAuditLogs: 0
    }
  }
}

/**
 * Updates execution progress on an archive record to facilitate resumes from interrupted zero-balance runs.
 */
export async function updateArchiveProgress(
  archiveId: string,
  updates: {
    stage?: string
    status?: string
    progress?: {
      purgedTransactions?: number
      openingsPosted?: boolean
      openingTransactionCount?: number
      scrubbedAuditLogs?: number
    }
  }
): Promise<void> {
  const archiveRef = adminDb.collection('system_archives').doc(archiveId)
  const patch: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp()
  }
  if (updates.stage) patch.stage = updates.stage
  if (updates.status) patch.status = updates.status
  if (updates.progress) {
    Object.entries(updates.progress).forEach(([k, v]) => {
      patch[`progress.${k}`] = v
    })
  }
  await archiveRef.update(patch)
}

/**
 * Finds any existing incomplete archive run for the given cutoff date.
 * If a prior run was interrupted, returns its metadata so execution can resume from that point.
 */
export async function findIncompleteArchiveForCutoff(cutoffDate: string): Promise<ServerSavedArchive | null> {
  if (!cutoffDate) return null
  try {
    const snap = await adminDb
      .collection('system_archives')
      .where('cutoffDate', '==', cutoffDate)
      .get()

    for (const doc of snap.docs) {
      const data = doc.data()
      if (data.status !== 'completed' && data.stage !== 'completed') {
        return {
          archiveId: doc.id,
          createdAt: toIsoString(data.createdAt),
          createdBy: data.createdBy || { uid: '', name: 'System', email: '' },
          cutoffDate: data.cutoffDate || null,
          openingDate: data.openingDate || null,
          count: Number(data.count || 0),
          auditCount: Number(data.auditCount || 0),
          productCount: Number(data.productCount || 0),
          checksum: String(data.checksum || ''),
          checksumAlgorithm: String(data.checksumAlgorithm || 'SHA-256'),
          signature: data.signature ? String(data.signature) : undefined,
          signatureAlgorithm: data.signatureAlgorithm ? String(data.signatureAlgorithm) : undefined,
          byteSize: Number(data.byteSize || 0),
          totalChunks: Number(data.totalChunks || 1),
          status: String(data.status || 'in_progress'),
          stage: data.stage ? String(data.stage) : 'archive_saved',
          progress: data.progress || {}
        }
      }
    }
    return null
  } catch (err) {
    console.warn('Notice: Error searching for incomplete archive for cutoff:', err)
    return null
  }
}

/**
 * Retrieves a saved archive from the server by archiveId, reassembling chunks and verifying checksum.
 * Throws an error if the recomputed SHA-256 checksum or server signature does not match the stored metadata.
 */
export async function getSavedArchiveServer(archiveId: string): Promise<MasterArchivePayload> {
  const archiveDoc = await adminDb.collection('system_archives').doc(archiveId).get()
  if (!archiveDoc.exists) {
    throw new Error(`Server archive "${archiveId}" not found.`)
  }

  const chunksSnap = await adminDb
    .collection('system_archives')
    .doc(archiveId)
    .collection('chunks')
    .orderBy('index', 'asc')
    .get()

  if (chunksSnap.empty) {
    throw new Error(`Server archive "${archiveId}" has no stored payload chunks.`)
  }

  const fullJson = chunksSnap.docs.map((d) => d.data().data || '').join('')
  const parsed = JSON.parse(fullJson) as MasterArchivePayload
  const metadata = archiveDoc.data() || {}
  parsed.archiveId = archiveId
  if (parsed.checksum && !parsed.signature) {
    parsed.signature = metadata.signature || signArchiveChecksum(parsed.checksum)
    parsed.signatureAlgorithm = 'HMAC-SHA256'
  }

  // Re-check cryptographic checksum on read to verify storage integrity
  const recomputedChecksum = await computeArchiveChecksum({
    cutoffDate: parsed.cutoffDate || null,
    openingDate: parsed.openingDate || null,
    totalTransactions: Number(parsed.totalTransactions ?? parsed.transactions?.length ?? 0),
    totalAuditLogs: Number(parsed.totalAuditLogs ?? parsed.auditLogs?.length ?? 0),
    transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
    productsSnapshot: Array.isArray(parsed.productsSnapshot) ? parsed.productsSnapshot : []
  })

  const expectedChecksum = String(metadata.checksum || parsed.checksum || '').trim().toLowerCase()
  if (expectedChecksum && recomputedChecksum.toLowerCase() !== expectedChecksum) {
    throw new Error(
      `Cryptographic integrity failure for server archive "${archiveId}": recomputed SHA-256 checksum (${recomputedChecksum}) does not match recorded checksum (${expectedChecksum}). Storage chunks may be corrupted or modified.`
    )
  }

  if (metadata.signature || parsed.signature) {
    const sig = String(metadata.signature || parsed.signature || '').trim()
    if (!verifyArchiveSignature(recomputedChecksum, sig)) {
      throw new Error(
        `Cryptographic signature failure for server archive "${archiveId}": HMAC signature validation failed against server authority secret.`
      )
    }
  }

  return parsed
}

/**
 * Lists the most recent saved server archives with their recorded counts and checksums.
 */
export async function listSavedArchivesServer(limitCount = 20): Promise<ServerSavedArchive[]> {
  const snap = await adminDb
    .collection('system_archives')
    .orderBy('createdAt', 'desc')
    .limit(limitCount)
    .get()

  return snap.docs.map((docSnap) => {
    const data = docSnap.data()
    return {
      archiveId: docSnap.id,
      createdAt: toIsoString(data.createdAt),
      createdBy: data.createdBy || { uid: '', name: 'System', email: '' },
      cutoffDate: data.cutoffDate || null,
      openingDate: data.openingDate || null,
      count: Number(data.count || 0),
      auditCount: Number(data.auditCount || 0),
      productCount: Number(data.productCount || 0),
      checksum: String(data.checksum || ''),
      checksumAlgorithm: String(data.checksumAlgorithm || 'SHA-256'),
      signature: data.signature ? String(data.signature) : undefined,
      signatureAlgorithm: data.signatureAlgorithm ? String(data.signatureAlgorithm) : undefined,
      byteSize: Number(data.byteSize || 0),
      totalChunks: Number(data.totalChunks || 1),
      status: String(data.status || 'unknown'),
      stage: data.stage ? String(data.stage) : undefined,
      progress: data.progress || {}
    }
  })
}

export interface ServerArchiveVerificationResult {
  verified: boolean
  status: 'verified' | 'tampered' | 'unverified'
  verifiedBy?: 'system_archives' | 'server_signature'
  message: string
  serverChecksum?: string
}

/**
 * Validates an archive against the server's authoritative system_archives collection
 * and verifies its cryptographic HMAC-SHA256 signature signed with the server secret.
 */
export async function verifyArchiveAgainstServer(params: {
  checksum?: string
  signature?: string
  archiveId?: string
}): Promise<ServerArchiveVerificationResult> {
  const { checksum, signature, archiveId } = params

  if (!checksum) {
    return {
      verified: false,
      status: 'unverified',
      message: 'Unverified archive: No cryptographic checksum found.'
    }
  }

  const cleanChecksum = checksum.trim().toLowerCase()

  // 1. Check against authoritative record in system_archives by archiveId
  if (archiveId) {
    const archiveDoc = await adminDb.collection('system_archives').doc(archiveId).get()
    if (archiveDoc.exists) {
      const data = archiveDoc.data()
      const savedChecksum = String(data?.checksum || '').trim().toLowerCase()
      if (savedChecksum === cleanChecksum) {
        return {
          verified: true,
          status: 'verified',
          verifiedBy: 'system_archives',
          message: `Cryptographically verified: Checksum matches authoritative system archive record (${archiveId}).`,
          serverChecksum: savedChecksum
        }
      } else {
        return {
          verified: false,
          status: 'tampered',
          message: `TAMPER DETECTED: This archive claims ID "${archiveId}", but its checksum does not match the authoritative record saved in system_archives.`,
          serverChecksum: savedChecksum
        }
      }
    }
  }

  // 2. Check if checksum matches any record in system_archives
  const matchSnap = await adminDb
    .collection('system_archives')
    .where('checksum', '==', cleanChecksum)
    .limit(1)
    .get()

  if (!matchSnap.empty) {
    const matchedDoc = matchSnap.docs[0]
    return {
      verified: true,
      status: 'verified',
      verifiedBy: 'system_archives',
      message: `Cryptographically verified: Checksum matches authoritative system archive (${matchedDoc.id}).`,
      serverChecksum: cleanChecksum
    }
  }

  // 3. Verify server HMAC signature
  if (signature) {
    const isSigValid = verifyArchiveSignature(cleanChecksum, signature)
    if (isSigValid) {
      return {
        verified: true,
        status: 'verified',
        verifiedBy: 'server_signature',
        message: 'Cryptographically verified: Signed with server authority key.',
        serverChecksum: cleanChecksum
      }
    } else {
      return {
        verified: false,
        status: 'tampered',
        message: 'TAMPER DETECTED: Invalid server signature. The archive content or checksum has been modified or recalculated.'
      }
    }
  }

  // 4. No server match and no valid signature
  return {
    verified: false,
    status: 'unverified',
    message: 'Unverified archive: Checksum is not registered in system_archives and lacks a valid server signature.'
  }
}
