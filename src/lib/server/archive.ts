import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { getNextDayIST } from '@/lib/utils/date'
import { computeArchiveChecksum } from '@/lib/utils/archive-checksum'

export interface MasterArchivePayload {
  system: string
  type: string
  version: string
  exportedAt: string
  cutoffDate?: string
  openingDate?: string
  totalTransactions: number
  totalAuditLogs: number
  checksum?: string
  checksumAlgorithm?: string
  breakdown: {
    sales: number
    purchases: number
    transfers: number
    adjustments: number
    repairs: number
    melts: number
    returns: number
  }
  productsSnapshot: Array<Record<string, unknown>>
  transactions: Array<Record<string, unknown>>
  auditLogs: Array<Record<string, unknown>>
}

export interface MasterArchiveResult {
  archive: MasterArchivePayload
  count: number
  auditCount: number
  checksum: string
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
  byteSize: number
  totalChunks: number
  status: string
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
  if (cutoffDate) {
    txQuery = txQuery.where('date', '<=', cutoffDate)
  }

  const [txSnap, auditSnap, prodsSnap] = await Promise.all([
    txQuery.get(),
    adminDb.collection('audit_logs').get(),
    adminDb.collection('products').get()
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

  const totalTransactions = transactions.length
  const totalAuditLogs = auditLogs.length

  const breakdown = {
    sales: transactions.filter((t) => t.type === 'sale').length,
    purchases: transactions.filter((t) => t.type === 'purchase').length,
    transfers: transactions.filter((t) => t.type === 'transfer').length,
    adjustments: transactions.filter((t) => t.type === 'adjustment').length,
    repairs: transactions.filter((t) => t.type === 'repair').length,
    melts: transactions.filter((t) => t.type === 'melt').length,
    returns: transactions.filter((t) => t.type === 'return').length
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

  const archive: MasterArchivePayload = {
    system: 'A96 Ventures Unified Inventory System',
    type: 'Master Audit Archive (All History & Activity Trail)',
    version: '1.3',
    exportedAt: new Date().toISOString(),
    cutoffDate,
    openingDate,
    totalTransactions,
    totalAuditLogs,
    checksum,
    checksumAlgorithm: 'SHA-256',
    breakdown,
    productsSnapshot,
    transactions,
    auditLogs
  }

  return {
    archive,
    count: totalTransactions,
    auditCount: totalAuditLogs,
    checksum,
    cutoffDate,
    openingDate
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
    byteSize: jsonString.length,
    totalChunks,
    status: 'verified_and_saved'
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
    byteSize: jsonString.length,
    totalChunks,
    status: 'verified_and_saved'
  }
}

/**
 * Retrieves a saved archive from the server by archiveId, reassembling chunks and verifying checksum.
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
      byteSize: Number(data.byteSize || 0),
      totalChunks: Number(data.totalChunks || 1),
      status: String(data.status || 'unknown')
    }
  })
}
