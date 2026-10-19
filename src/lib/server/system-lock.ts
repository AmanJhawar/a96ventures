import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

const SYSTEM_CONTROL_COLLECTION = 'system_control'
const RUN_LOCK_DOC = 'zero_balance_run_lock'
const FISCAL_LOCK_DOC = 'fiscal_lock'

export interface CallerInfo {
  callerUid: string
  callerName: string
  callerEmail: string
}

export class SystemLockedError extends Error {
  statusCode: number
  constructor(message: string) {
    super(message)
    this.name = 'SystemLockedError'
    this.statusCode = 423
  }
}

export function getZeroBalanceLockRef(): FirebaseFirestore.DocumentReference {
  return adminDb.collection(SYSTEM_CONTROL_COLLECTION).doc(RUN_LOCK_DOC)
}

/**
 * Asserts inside a Firestore transaction that Master Zero-Balance is not currently locked.
 * Throws SystemLockedError if locked.
 */
export function assertNotZeroBalanceLocked(snap: FirebaseFirestore.DocumentSnapshot): void {
  if (!snap.exists) return
  const data = snap.data()
  if (!data?.isLocked) return

  const now = Date.now()
  const expiresAt = Number(data.expiresAt || 0)
  if (expiresAt > 0 && now >= expiresAt) {
    return // lease has expired
  }

  const lockedByName = data.lockedByName || data.lockedByEmail || 'Another administrator'
  throw new SystemLockedError(
    `Master Zero-Balance / Archive run is currently in progress by ${lockedByName}. Operations are temporarily paused.`
  )
}

/**
 * Checks whether the Master Zero-Balance / Archive run lock is currently active.
 */
export async function isZeroBalanceLocked(): Promise<{ isLocked: boolean; message?: string }> {
  try {
    const snap = await adminDb.collection(SYSTEM_CONTROL_COLLECTION).doc(RUN_LOCK_DOC).get()
    if (!snap.exists) return { isLocked: false }

    const data = snap.data()
    if (!data?.isLocked) return { isLocked: false }

    const now = Date.now()
    const expiresAt = Number(data.expiresAt || 0)
    if (expiresAt > 0 && now >= expiresAt) {
      // Lease has expired
      return { isLocked: false }
    }

    const lockedByName = data.lockedByName || data.lockedByEmail || 'Another administrator'
    return {
      isLocked: true,
      message: `Master Zero-Balance / Archive run is currently in progress by ${lockedByName}. New entries are temporarily paused.`
    }
  } catch (err) {
    console.warn('Notice: Error checking zero-balance lock:', err)
    return { isLocked: false }
  }
}

/**
 * Acquires a distributed server lock for Master Zero-Balance to prevent overlapping runs.
 * Throws an error if another run is currently executing.
 */
export async function acquireZeroBalanceLock(caller: CallerInfo, ttlSeconds = 300): Promise<void> {
  const lockRef = adminDb.collection(SYSTEM_CONTROL_COLLECTION).doc(RUN_LOCK_DOC)

  await adminDb.runTransaction(async (t) => {
    const snap = await t.get(lockRef)
    const now = Date.now()

    if (snap.exists) {
      const data = snap.data()
      if (data?.isLocked) {
        const expiresAt = Number(data.expiresAt || 0)
        if (expiresAt > now) {
          const lockedByName = data.lockedByName || data.lockedByEmail || 'Another administrator'
          throw new Error(
            `Master Zero-Balance is currently in progress by ${lockedByName}. Concurrent runs are blocked to prevent conflicting state.`
          )
        }
      }
    }

    t.set(lockRef, {
      isLocked: true,
      lockedAt: FieldValue.serverTimestamp(),
      lockedBy: caller.callerUid,
      lockedByName: caller.callerName,
      lockedByEmail: caller.callerEmail,
      expiresAt: now + ttlSeconds * 1000
    })
  })
}

/**
 * Releases the Master Zero-Balance distributed server lock.
 */
export async function releaseZeroBalanceLock(): Promise<void> {
  try {
    const lockRef = adminDb.collection(SYSTEM_CONTROL_COLLECTION).doc(RUN_LOCK_DOC)
    await lockRef.set({
      isLocked: false,
      releasedAt: FieldValue.serverTimestamp()
    })
  } catch (err) {
    console.error('Failed to release zero balance lock:', err)
  }
}

/**
 * Retrieves the currently closed financial cutoff date (e.g. "2026-03-31").
 */
export async function getClosedFiscalCutoff(): Promise<string | null> {
  try {
    const snap = await adminDb.collection(SYSTEM_CONTROL_COLLECTION).doc(FISCAL_LOCK_DOC).get()
    if (!snap.exists) return null

    const data = snap.data()
    return data?.closedCutoffDate ? String(data.closedCutoffDate) : null
  } catch (err) {
    console.warn('Notice: Error checking fiscal cutoff lock:', err)
    return null
  }
}

/**
 * Sets the closed financial cutoff date to permanently block any new entries dated on or before it.
 */
export async function setClosedFiscalCutoff(
  cutoffDate: string,
  openingDate: string,
  caller: CallerInfo
): Promise<void> {
  const fiscalRef = adminDb.collection(SYSTEM_CONTROL_COLLECTION).doc(FISCAL_LOCK_DOC)
  await fiscalRef.set({
    closedCutoffDate: cutoffDate,
    openingDate,
    closedAt: FieldValue.serverTimestamp(),
    closedBy: caller.callerUid,
    closedByName: caller.callerName,
    closedByEmail: caller.callerEmail
  })
}
