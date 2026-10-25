import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { createHmac } from 'crypto'
import { getNextDayIST, validateFiscalCutoffDate } from '@/lib/utils/date'
import { computeArchiveChecksum } from '@/lib/utils/archive-checksum'
import {
  acquireZeroBalanceLock,
  releaseZeroBalanceLock,
  getClosedFiscalCutoff,
  setClosedFiscalCutoff
} from '@/lib/server/system-lock'
import { calculateNetTransactionsEffect, calculateOpeningBalances } from '@/lib/server/ledger'
import { ValidationError } from '@/lib/errors'

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
  checksumScope?: string
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

  if (cutoffDate) {
    txQuery = txQuery.where('date', '<=', cutoffDate)
    ordersQuery = ordersQuery.where('date', '<=', cutoffDate)
  }

  const [txSnap, auditSnap, prodsSnap, ordersSnap] = await Promise.all([
    txQuery.get(),
    adminDb.collection('audit_logs').get(),
    adminDb.collection('products').get(),
    ordersQuery.get()
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

  // Compute canonical SHA-256 checksum over the payload content including ordersSnapshot
  const checksum = await computeArchiveChecksum({
    cutoffDate,
    openingDate,
    totalTransactions,
    totalAuditLogs,
    transactions,
    auditLogs,
    productsSnapshot,
    ordersSnapshot,
    checksumScope: 'v2-orders'
  })

  const signature = signArchiveChecksum(checksum)

  const archive: MasterArchivePayload = {
    system: 'A96 Ventures Unified Inventory System',
    type: 'Master Audit Archive (All History & Activity Trail)',
    version: '1.5',
    exportedAt: new Date().toISOString(),
    cutoffDate,
    openingDate,
    totalTransactions,
    totalAuditLogs,
    checksum,
    checksumAlgorithm: 'SHA-256',
    checksumScope: 'v2-orders',
    signature,
    signatureAlgorithm: 'HMAC-SHA256',
    breakdown,
    productsSnapshot,
    transactions,
    auditLogs,
    ordersSnapshot
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

/**
 * Safely purges archived orders on or before the cutoff date by their exact IDs.
 * Safe to run twice on a resumed archive (idempotent deletes).
 * Never touches customers, visits, PANs, mobiles, or sequential counters.
 */
export async function purgeArchivedOrdersServer(orderIds: string[]): Promise<number> {
  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) return 0
  const validIds = orderIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
  if (validIds.length === 0) return 0

  const chunkSize = 400
  for (let i = 0; i < validIds.length; i += chunkSize) {
    const chunk = validIds.slice(i, i + chunkSize)
    const batch = adminDb.batch()
    chunk.forEach((id) => batch.delete(adminDb.collection('orders').doc(id)))
    await batch.commit()
  }
  return validIds.length
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
    productsSnapshot: Array.isArray(parsed.productsSnapshot) ? parsed.productsSnapshot : [],
    ordersSnapshot: Array.isArray(parsed.ordersSnapshot) ? parsed.ordersSnapshot : [],
    checksumScope: parsed.checksumScope || null
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

export interface ExecuteZeroBalanceCutoffParams {
  caller: {
    callerUid: string
    callerName: string
    callerEmail: string
    decodedToken: { auth_time?: number; [key: string]: unknown }
  }
  cutoffDate?: string
  expectedTransactionCount?: number
  expectedAuditCount?: number
  confirmationPhrase?: string
}

export interface ZeroBalanceExecutionResult {
  success: boolean
  resumed: boolean
  archiveId: string
  checksum: string
  count: number
  auditCount: number
  cutoffDate: string
  openingDate: string
}

/**
 * Executes or resumes a Master Zero-Balance fiscal cutoff.
 * Handles lock acquisition, archive verification, database purging, opening entries creation,
 * and immutable audit trail scrubbing within a secure transactional envelope.
 */
export async function executeZeroBalanceCutoffServer(
  params: ExecuteZeroBalanceCutoffParams
): Promise<ZeroBalanceExecutionResult> {
  const { caller, confirmationPhrase, cutoffDate: rawRequestedCutoff, expectedTransactionCount, expectedAuditCount } = params

  const callerInfo = {
    callerUid: caller.callerUid,
    callerName: caller.callerName,
    callerEmail: caller.callerEmail
  }

  // 1. Security & Fresh Re-Authentication Check
  const authTime = Number(caller.decodedToken.auth_time)
  const nowSeconds = Math.floor(Date.now() / 1000)
  const RECENT_LOGIN_MAX_AGE_SECONDS = 300 // 5 minutes
  if (!authTime || nowSeconds - authTime > RECENT_LOGIN_MAX_AGE_SECONDS) {
    const err = new Error(
      'Fresh authentication required: This irreversible action requires sign-in or re-authentication within the last 5 minutes. Please re-enter your password to proceed.'
    ) as Error & { code?: string }
    err.code = 'auth/requires-recent-login'
    throw err
  }

  // 2. Exact Confirmation Phrase Verification
  if ((confirmationPhrase || '').trim() !== 'CONFIRM ZERO BALANCE') {
    throw new ValidationError(
      'Confirmation phrase mismatch. You must type "CONFIRM ZERO BALANCE" exactly to execute this irreversible operation.'
    )
  }

  // 3. Cutoff Date Validation & Incomplete Archive Check
  const lastClosedCutoff = await getClosedFiscalCutoff()
  const trimmedRequestedCutoff = rawRequestedCutoff?.trim()
  const incompleteArchive = trimmedRequestedCutoff ? await findIncompleteArchiveForCutoff(trimmedRequestedCutoff) : null

  let cutoffDate: string
  let openingDate: string

  if (incompleteArchive) {
    cutoffDate = incompleteArchive.cutoffDate!
    openingDate = incompleteArchive.openingDate || getNextDayIST(cutoffDate)
  } else {
    const cutoffValidation = validateFiscalCutoffDate(trimmedRequestedCutoff, lastClosedCutoff)
    if (!cutoffValidation.isValid) {
      throw new ValidationError(cutoffValidation.error || 'Invalid fiscal cutoff date')
    }
    cutoffDate = cutoffValidation.cutoffDate!
    openingDate = getNextDayIST(cutoffDate)
  }

  // 4. Acquire Server-Side Lock
  let lockAcquired = false
  try {
    await acquireZeroBalanceLock(callerInfo)
    lockAcquired = true

    let archivePayload: Record<string, unknown>
    let archiveId: string
    let checksum: string
    let verifiedTxCount: number
    let verifiedAuditCount: number
    let currentStage = 'archive_saved'
    let progress: { purgedTransactions?: number; openingsPosted?: boolean; openingTransactionCount?: number; scrubbedAuditLogs?: number } = {}

    if (incompleteArchive) {
      const saved = await getSavedArchiveServer(incompleteArchive.archiveId)
      archivePayload = saved as unknown as Record<string, unknown>
      archiveId = incompleteArchive.archiveId
      checksum = incompleteArchive.checksum
      verifiedTxCount = incompleteArchive.count
      verifiedAuditCount = incompleteArchive.auditCount
      currentStage = incompleteArchive.stage || 'archive_saved'
      progress = incompleteArchive.progress || {}
    } else {
      const archiveResult = await buildMasterArchiveServer({ cutoffDate })
      verifiedTxCount = archiveResult.count
      verifiedAuditCount = archiveResult.auditCount

      if (typeof expectedTransactionCount === 'number' && verifiedTxCount !== expectedTransactionCount) {
        const err = new Error(
          `Transaction count mismatch: archive was built with ${expectedTransactionCount} transaction(s) up to ${cutoffDate}, but database currently contains ${verifiedTxCount}. Zero-balance aborted to prevent unarchived data loss.`
        ) as Error & { code?: string }
        err.code = 'COUNT_MISMATCH'
        throw err
      }

      if (typeof expectedAuditCount === 'number' && verifiedAuditCount !== expectedAuditCount) {
        const err = new Error(
          `Audit log count mismatch: archive was built with ${expectedAuditCount} audit log(s) up to ${cutoffDate}, but database currently contains ${verifiedAuditCount}. Zero-balance aborted to prevent unarchived data loss.`
        ) as Error & { code?: string }
        err.code = 'COUNT_MISMATCH'
        throw err
      }

      const savedArchive = await saveArchiveServerSide(archiveResult, callerInfo)
      archivePayload = archiveResult.archive as unknown as Record<string, unknown>
      archiveId = savedArchive.archiveId
      checksum = savedArchive.checksum
      currentStage = 'archive_saved'
      progress = savedArchive.progress || {}
    }

    // 5. Seal Closed-Period Lock
    await setClosedFiscalCutoff(cutoffDate, openingDate, callerInfo)

    // 6. Extract Identifiers to Purge
    const archivedTxIds = (Array.isArray(archivePayload.transactions) ? archivePayload.transactions : [])
      .map((t: Record<string, unknown>) => String(t.id || ''))
      .filter(Boolean)
    const count = archivedTxIds.length

    const archivedAuditIds = (Array.isArray(archivePayload.auditLogs) ? archivePayload.auditLogs : [])
      .map((l: Record<string, unknown>) => String(l.id || ''))
      .filter(Boolean)
    const auditCount = archivedAuditIds.length

    const archivedOrderIds = (Array.isArray(archivePayload.ordersSnapshot) ? archivePayload.ordersSnapshot : [])
      .map((o: Record<string, unknown>) => String(o.id || ''))
      .filter(Boolean)

    // Stage 1: Purge Historical Transactions in Batches of 400
    if (currentStage === 'archive_saved' || currentStage === 'purging_transactions') {
      await updateArchiveProgress(archiveId, { stage: 'purging_transactions' })
      if (count > 0) {
        const chunkSize = 400
        for (let i = 0; i < archivedTxIds.length; i += chunkSize) {
          const chunk = archivedTxIds.slice(i, i + chunkSize)
          const batch = adminDb.batch()
          chunk.forEach((id) => batch.delete(adminDb.collection('transactions').doc(id)))
          await batch.commit()
        }
      }
      currentStage = 'transactions_purged'
      await updateArchiveProgress(archiveId, {
        stage: 'transactions_purged',
        progress: { purgedTransactions: count }
      })
    }

    // Stage 2: Post Consolidated Opening Balances
    if (!progress.openingsPosted && currentStage !== 'openings_posted' && currentStage !== 'audit_scrubbed' && currentStage !== 'completed') {
      const postCutoffSnap = await adminDb.collection('transactions').where('date', '>', cutoffDate).get()
      const postCutoffTransactions = postCutoffSnap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>
        return {
          ...data,
          id: d.id,
          productId: typeof data.productId === 'string' ? data.productId : undefined,
          locationId: typeof data.locationId === 'string' ? data.locationId : undefined,
          toLocationId: typeof data.toLocationId === 'string' ? data.toLocationId : undefined,
          quantity: Number(data.quantity || 0),
          type: typeof data.type === 'string' ? data.type : undefined,
          isReversed: Boolean(data.isReversed),
          isReversal: Boolean(data.isReversal),
          reversalOf: typeof data.reversalOf === 'string' ? data.reversalOf : undefined
        }
      })
      const netEffects = calculateNetTransactionsEffect(postCutoffTransactions)

      const [prodsSnap, locsSnap] = await Promise.all([
        adminDb.collection('products').get(),
        adminDb.collection('locations').get()
      ])

      const locMap: Record<string, string> = {}
      locsSnap.docs.forEach((doc) => {
        const data = doc.data()
        locMap[doc.id] = String(data.name || '')
      })

      const products = prodsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }))

      const openingBalances = calculateOpeningBalances(products, netEffects)

      if (openingBalances.length > 0) {
        const openingDocs: { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }[] = []
        for (const item of openingBalances) {
          const newTxRef = adminDb.collection('transactions').doc()
          const locationName =
            locMap[item.locationId] ||
            (item.locationId === 'loc_main' ? 'Main Vault' :
             item.locationId === 'loc_vault' ? 'Main Vault' :
             item.locationId === 'loc_showroom' ? 'Showroom' :
             item.locationId.replace(/^loc_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Main Vault')

          const openingDoc: Record<string, unknown> = {
            type: 'opening',
            productId: item.productId,
            productName: item.productName,
            category: item.category,
            metal: item.metal || 'Gold',
            quantity: item.quantity,
            locationId: item.locationId,
            locationName,
            date: openingDate,
            notes: `Opening balance as of ${openingDate} following cutoff ${cutoffDate}`,
            isOpeningBalance: true,
            isOpeningEntry: true,
            createdAt: FieldValue.serverTimestamp(),
            timestamp: FieldValue.serverTimestamp(),
            operatorId: caller.callerUid,
            operatorName: caller.callerName,
            operatorEmail: caller.callerEmail
          }

          if (item.weight !== undefined) openingDoc.weight = item.weight
          if (item.weightMg !== undefined) openingDoc.weightMg = item.weightMg
          if (item.pieceWeight !== undefined) openingDoc.pieceWeight = item.pieceWeight
          if (item.pieceWeightMg !== undefined) openingDoc.pieceWeightMg = item.pieceWeightMg
          if (item.pieceWeights && item.pieceWeights.length > 0) {
            openingDoc.pieceWeights = item.pieceWeights
          }
          if (item.pieceWeightsMg && item.pieceWeightsMg.length > 0) {
            openingDoc.pieceWeightsMg = item.pieceWeightsMg
          }

          openingDocs.push({
            ref: newTxRef,
            data: openingDoc
          })
        }

        const chunkSize = 400
        for (let i = 0; i < openingDocs.length; i += chunkSize) {
          const chunk = openingDocs.slice(i, i + chunkSize)
          const batch = adminDb.batch()
          chunk.forEach((item) => batch.set(item.ref, item.data))
          await batch.commit()
        }
      }

      currentStage = 'openings_posted'
      await updateArchiveProgress(archiveId, {
        stage: 'openings_posted',
        progress: { openingsPosted: true, openingTransactionCount: openingBalances.length }
      })
    }

    // Stage 3: Purge Archived Orders by Exact IDs
    const purgedOrdersCount = await purgeArchivedOrdersServer(archivedOrderIds)

    // Stage 4: Scrub Audit Trail
    if (currentStage !== 'audit_scrubbed' && currentStage !== 'completed') {
      if (auditCount > 0) {
        const chunkSize = 400
        for (let i = 0; i < archivedAuditIds.length; i += chunkSize) {
          const chunk = archivedAuditIds.slice(i, i + chunkSize)
          const batch = adminDb.batch()
          chunk.forEach((id) => batch.delete(adminDb.collection('audit_logs').doc(id)))
          await batch.commit()
        }
      }
      currentStage = 'audit_scrubbed'
      await updateArchiveProgress(archiveId, {
        stage: 'audit_scrubbed',
        progress: { scrubbedAuditLogs: auditCount }
      })
    }

    // Stage 5: Record Baseline Audit Entry & Complete Archive
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: 'zero_balance',
      entityType: 'archive',
      entityId: archiveId,
      entityName: 'System Reset',
      description: `Master Zero-Balance executed up to cutoff ${cutoffDate}: verified and purged ${count} transaction(s) and scrubbed ${auditCount} audit log(s). Opening balances established on ${openingDate} with real locations and weights. All future entries on or before ${cutoffDate} blocked.${incompleteArchive ? ' (Resumed and completed from interrupted archive run)' : ''}`,
      metadata: {
        archiveId,
        cutoffDate,
        openingDate,
        purgedTransactions: count,
        scrubbedAuditLogs: auditCount,
        purgedOrders: purgedOrdersCount,
        resumed: Boolean(incompleteArchive)
      },
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    })

    await updateArchiveProgress(archiveId, {
      stage: 'completed',
      status: 'completed'
    })

    return {
      success: true,
      resumed: Boolean(incompleteArchive),
      archiveId,
      checksum,
      count: verifiedTxCount,
      auditCount: verifiedAuditCount,
      cutoffDate,
      openingDate
    }
  } finally {
    if (lockAcquired) {
      await releaseZeroBalanceLock()
    }
  }
}
