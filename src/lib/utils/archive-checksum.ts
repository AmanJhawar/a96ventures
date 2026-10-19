/**
 * Canonical JSON serialization and SHA-256 checksum computation for Master Archives.
 * Guarantees tamper detection and cryptographic integrity verification across Node.js and browser runtimes.
 */

export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj)
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']'
  }
  const record = obj as Record<string, unknown>
  const sortedKeys = Object.keys(record).sort()
  return '{' + sortedKeys.map((k) => JSON.stringify(k) + ':' + canonicalJsonStringify(record[k])).join(',') + '}'
}

export interface ArchiveChecksumData {
  cutoffDate?: string | null
  openingDate?: string | null
  totalTransactions: number
  totalAuditLogs: number
  transactions: unknown[]
  auditLogs: unknown[]
  productsSnapshot?: unknown[]
}

/**
 * Computes a deterministic SHA-256 checksum across the canonical content of an archive.
 * Works uniformly in Node.js server runtimes and modern browser environments.
 */
export async function computeArchiveChecksum(data: ArchiveChecksumData): Promise<string> {
  const canonicalPayload = {
    cutoffDate: data.cutoffDate || null,
    openingDate: data.openingDate || null,
    totalTransactions: Number(data.totalTransactions || 0),
    totalAuditLogs: Number(data.totalAuditLogs || 0),
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    auditLogs: Array.isArray(data.auditLogs) ? data.auditLogs : [],
    productsSnapshot: Array.isArray(data.productsSnapshot) ? data.productsSnapshot : []
  }

  const canonicalString = canonicalJsonStringify(canonicalPayload)

  if (typeof window === 'undefined') {
    // Node.js runtime
    const { createHash } = await import('crypto')
    return createHash('sha256').update(canonicalString, 'utf8').digest('hex')
  } else {
    // Browser runtime
    const encoder = new TextEncoder()
    const encodedData = encoder.encode(canonicalString)
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', encodedData)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }
}

export interface ArchiveVerificationResult {
  status: 'verified' | 'tampered' | 'unverified'
  computedChecksum: string
  fileChecksum?: string
  message: string
}

/**
 * Verifies the integrity of an uploaded archive JSON against its embedded SHA-256 checksum.
 */
export async function verifyArchiveIntegrity(parsedArchive: Record<string, unknown>): Promise<ArchiveVerificationResult> {
  const transactions = (Array.isArray(parsedArchive.transactions)
    ? parsedArchive.transactions
    : Array.isArray(parsedArchive)
      ? (parsedArchive as unknown[])
      : []) as unknown[]

  const auditLogs = (Array.isArray(parsedArchive.auditLogs) ? parsedArchive.auditLogs : []) as unknown[]
  const productsSnapshot = (Array.isArray(parsedArchive.productsSnapshot) ? parsedArchive.productsSnapshot : []) as unknown[]

  const totalTransactions =
    typeof parsedArchive.totalTransactions === 'number'
      ? parsedArchive.totalTransactions
      : transactions.length

  const totalAuditLogs =
    typeof parsedArchive.totalAuditLogs === 'number'
      ? parsedArchive.totalAuditLogs
      : auditLogs.length

  const cutoffDate = (parsedArchive.cutoffDate as string | undefined) || null
  const openingDate = (parsedArchive.openingDate as string | undefined) || null

  const computedChecksum = await computeArchiveChecksum({
    cutoffDate,
    openingDate,
    totalTransactions,
    totalAuditLogs,
    transactions,
    auditLogs,
    productsSnapshot
  })

  const fileChecksum = typeof parsedArchive.checksum === 'string' ? parsedArchive.checksum.trim().toLowerCase() : undefined

  if (!fileChecksum) {
    return {
      status: 'unverified',
      computedChecksum,
      message: 'Legacy archive: No cryptographic checksum found. Integrity cannot be verified.'
    }
  }

  if (fileChecksum === computedChecksum.toLowerCase()) {
    return {
      status: 'verified',
      computedChecksum,
      fileChecksum,
      message: 'Cryptographically verified: SHA-256 checksum matches canonical content.'
    }
  }

  return {
    status: 'tampered',
    computedChecksum,
    fileChecksum,
    message: 'TAMPER WARNING: SHA-256 checksum mismatch! This archive file has been altered or edited after export.'
  }
}
