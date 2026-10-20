import 'server-only'

import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { getTodayIST } from '@/lib/utils/date'
import { Customer, Visit, VisitKind } from '@/lib/types'

export const MANUAL_VISIT_KINDS = ['walk_in', 'inquiry', 'follow_up', 'repair'] as const
export type ManualVisitKind = (typeof MANUAL_VISIT_KINDS)[number]

export interface CreateVisitParams {
  customerId: string
  locationId: string
  kind: ManualVisitKind
  at?: string
  note?: string
  inquiryId?: string
  followUpOn?: string
  followUpOf?: string
  caller: {
    callerUid: string
    callerName: string
    callerEmail: string
  }
}

/**
 * Creates a manual visit (walk_in, inquiry, follow_up, repair) inside ONE atomic Firestore transaction.
 * System-generated visits (purchase, return) must only be created by orders.
 * Updates customer stats: visitCount, lastVisitAt, and openFollowUps.
 * If followUpOf is provided, marks the prior follow-up visit as done.
 */
export async function createVisit(params: CreateVisitParams): Promise<Visit> {
  const { customerId, locationId, kind, note, inquiryId, followUpOn, followUpOf, caller } = params

  if (!MANUAL_VISIT_KINDS.includes(kind)) {
    throw new Error(
      `Invalid visit kind: "${kind}". Only manual visits (${MANUAL_VISIT_KINDS.join(', ')}) can be logged directly. Purchases and returns are created automatically by bills.`
    )
  }

  if (!customerId) throw new Error('Customer ID is required')
  if (!locationId) throw new Error('Location ID is required')

  const visitDate = params.at ? params.at.trim() : getTodayIST()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
    throw new Error(`Invalid date format for visit: "${visitDate}". Expected YYYY-MM-DD.`)
  }

  if (followUpOn && !/^\d{4}-\d{2}-\d{2}$/.test(followUpOn.trim())) {
    throw new Error(`Invalid followUpOn format: "${followUpOn}". Expected YYYY-MM-DD.`)
  }

  const customerRef = adminDb.collection('customers').doc(customerId)
  const locRef = adminDb.collection('locations').doc(locationId)
  const followUpOfRef = followUpOf ? adminDb.collection('visits').doc(followUpOf) : null
  const newVisitRef = adminDb.collection('visits').doc()

  const newVisit = await adminDb.runTransaction(async (t) => {
    // ----------------------------------------------------
    // STAGE 1: ALL READS
    // ----------------------------------------------------
    const [custSnap, locSnap, followUpOfSnap] = await Promise.all([
      t.get(customerRef),
      t.get(locRef),
      followUpOfRef ? t.get(followUpOfRef) : Promise.resolve(null)
    ])

    if (!custSnap.exists) {
      throw new Error(`Customer not found: "${customerId}"`)
    }
    const customerData = custSnap.data() as Customer
    if (customerData.isArchived) {
      throw new Error('Cannot log a visit for an archived customer')
    }

    if (!locSnap.exists) {
      throw new Error(`Location not found: "${locationId}"`)
    }

    let priorWasOpen = false
    if (followUpOfRef && followUpOfSnap) {
      if (!followUpOfSnap.exists) {
        throw new Error(`Prior follow-up visit not found: "${followUpOf}"`)
      }
      const priorData = followUpOfSnap.data() as Visit
      if (priorData.customerId !== customerId) {
        throw new Error('Prior follow-up visit does not belong to this customer')
      }
      priorWasOpen = Boolean(priorData.followUpOn && !priorData.followUpDone)
    }

    // ----------------------------------------------------
    // STAGE 2: IN-MEMORY CALCULATIONS
    // ----------------------------------------------------
    const stats = customerData.stats || {
      visitCount: 0,
      orderCount: 0,
      lifetimeValuePaise: 0,
      lifetimeWeightMg: { Gold: 0, Silver: 0 },
      openFollowUps: 0
    }

    let followUpDelta = 0
    // If this new visit creates a new open follow up
    if (followUpOn) {
      followUpDelta += 1
    }
    // If this visit closes a previously open follow up
    if (priorWasOpen) {
      followUpDelta -= 1
    }

    const updatedStats = {
      ...stats,
      visitCount: (stats.visitCount || 0) + 1,
      firstVisitAt: stats.firstVisitAt || visitDate,
      lastVisitAt: !stats.lastVisitAt || visitDate >= stats.lastVisitAt ? visitDate : stats.lastVisitAt,
      openFollowUps: Math.max(0, (stats.openFollowUps || 0) + followUpDelta)
    }

    const visitDoc: Visit = {
      id: newVisitRef.id,
      customerId,
      locationId,
      at: visitDate,
      staffId: caller.callerUid,
      staffName: caller.callerName,
      kind,
      note: note ? note.trim() : undefined,
      inquiryId: inquiryId ? inquiryId.trim() : undefined,
      followUpOn: followUpOn ? followUpOn.trim() : undefined,
      followUpDone: false,
      followUpOf: followUpOf ? followUpOf.trim() : undefined
    }

    // ----------------------------------------------------
    // STAGE 3: ALL WRITES
    // ----------------------------------------------------
    t.set(newVisitRef, visitDoc)

    if (followUpOfRef) {
      t.update(followUpOfRef, {
        followUpDone: true
      })
    }

    t.update(customerRef, {
      stats: updatedStats,
      updatedAt: new Date().toISOString(),
      updatedBy: caller.callerUid
    })

    return visitDoc
  })

  // Append audit trail entry
  try {
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: 'create',
      entityType: 'visit',
      entityId: newVisit.id,
      entityName: `Visit (${newVisit.kind})`,
      description: `Logged ${newVisit.kind} visit for customer ${customerId}${newVisit.followUpOn ? ` with follow-up on ${newVisit.followUpOn}` : ''}`,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      metadata: {
        visitId: newVisit.id,
        customerId: newVisit.customerId,
        kind: newVisit.kind,
        followUpOn: newVisit.followUpOn || null,
        followUpOf: newVisit.followUpOf || null
      }
    })
  } catch (auditErr) {
    console.error('Failed to log audit entry for visit creation:', auditErr)
  }

  return newVisit
}

export interface UpdateVisitParams {
  visitId: string
  note?: string
  followUpOn?: string | null
  followUpDone?: boolean
  caller: {
    callerUid: string
    callerName: string
    callerEmail: string
  }
}

/**
 * Updates a visit's note, followUpOn, or followUpDone status transactionally.
 * Keeps customer.stats.openFollowUps accurate across updates.
 */
export async function updateVisit(params: UpdateVisitParams): Promise<Visit> {
  const { visitId, note, followUpOn, followUpDone, caller } = params
  if (!visitId) throw new Error('Visit ID is required')

  const visitRef = adminDb.collection('visits').doc(visitId)

  const updatedVisit = await adminDb.runTransaction(async (t) => {
    const visitSnap = await t.get(visitRef)
    if (!visitSnap.exists) {
      throw new Error(`Visit not found: "${visitId}"`)
    }
    const currentVisit = visitSnap.data() as Visit

    const customerRef = adminDb.collection('customers').doc(currentVisit.customerId)
    const custSnap = await t.get(customerRef)
    if (!custSnap.exists) {
      throw new Error(`Associated customer not found: "${currentVisit.customerId}"`)
    }
    const customerData = custSnap.data() as Customer

    const wasOpen = Boolean(currentVisit.followUpOn && !currentVisit.followUpDone)

    let effectiveFollowUpOn = currentVisit.followUpOn
    if (followUpOn !== undefined) {
      effectiveFollowUpOn = followUpOn ? followUpOn.trim() : undefined
    }

    let effectiveFollowUpDone = currentVisit.followUpDone
    if (followUpDone !== undefined) {
      effectiveFollowUpDone = followUpDone
    }

    const willBeOpen = Boolean(effectiveFollowUpOn && !effectiveFollowUpDone)

    let delta = 0
    if (wasOpen && !willBeOpen) {
      delta = -1
    } else if (!wasOpen && willBeOpen) {
      delta = 1
    }

    const patch: Partial<Visit> = {}
    if (note !== undefined) patch.note = note ? note.trim() : undefined
    if (followUpOn !== undefined) patch.followUpOn = effectiveFollowUpOn
    if (followUpDone !== undefined) patch.followUpDone = effectiveFollowUpDone

    t.update(visitRef, patch as Record<string, unknown>)

    if (delta !== 0) {
      const stats = customerData.stats || {
        visitCount: 0,
        orderCount: 0,
        lifetimeValuePaise: 0,
        lifetimeWeightMg: { Gold: 0, Silver: 0 },
        openFollowUps: 0
      }
      const updatedOpen = Math.max(0, (stats.openFollowUps || 0) + delta)
      t.update(customerRef, {
        'stats.openFollowUps': updatedOpen,
        updatedAt: new Date().toISOString(),
        updatedBy: caller.callerUid
      })
    }

    return {
      ...currentVisit,
      ...patch
    }
  })

  // Append audit trail entry
  try {
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: 'update',
      entityType: 'visit',
      entityId: updatedVisit.id,
      entityName: `Visit (${updatedVisit.kind})`,
      description: `Updated visit ${updatedVisit.id} (followUpDone: ${updatedVisit.followUpDone})`,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      metadata: {
        visitId: updatedVisit.id,
        customerId: updatedVisit.customerId,
        followUpDone: updatedVisit.followUpDone,
        followUpOn: updatedVisit.followUpOn || null
      }
    })
  } catch (auditErr) {
    console.error('Failed to log audit entry for visit update:', auditErr)
  }

  return updatedVisit
}

export interface DeleteVisitParams {
  visitId: string
  caller: {
    callerUid: string
    callerName: string
    callerEmail: string
  }
}

/**
 * Deletes a manually logged visit.
 * Strict Rule: Purchase and return visits are system-generated by bills and cannot be deleted here.
 * Reverses the customer.stats (visitCount and openFollowUps if it was an open follow-up).
 */
export async function deleteVisit(params: DeleteVisitParams): Promise<{ success: true; deletedId: string }> {
  const { visitId, caller } = params
  if (!visitId) throw new Error('Visit ID is required')

  const visitRef = adminDb.collection('visits').doc(visitId)

  await adminDb.runTransaction(async (t) => {
    const visitSnap = await t.get(visitRef)
    if (!visitSnap.exists) {
      throw new Error(`Visit not found: "${visitId}"`)
    }
    const currentVisit = visitSnap.data() as Visit

    if (currentVisit.kind === 'purchase' || currentVisit.kind === 'return') {
      throw new Error('Cannot delete purchase or return visits directly. These are system-managed by bills.')
    }

    const customerRef = adminDb.collection('customers').doc(currentVisit.customerId)
    const custSnap = await t.get(customerRef)

    if (custSnap.exists) {
      const customerData = custSnap.data() as Customer
      const stats = customerData.stats || {
        visitCount: 0,
        orderCount: 0,
        lifetimeValuePaise: 0,
        lifetimeWeightMg: { Gold: 0, Silver: 0 },
        openFollowUps: 0
      }

      const wasOpen = Boolean(currentVisit.followUpOn && !currentVisit.followUpDone)
      const newStats = {
        ...stats,
        visitCount: Math.max(0, (stats.visitCount || 1) - 1),
        openFollowUps: wasOpen ? Math.max(0, (stats.openFollowUps || 1) - 1) : stats.openFollowUps || 0
      }

      t.update(customerRef, {
        stats: newStats,
        updatedAt: new Date().toISOString(),
        updatedBy: caller.callerUid
      })
    }

    t.delete(visitRef)
  })

  // Append audit trail entry
  try {
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: 'delete',
      entityType: 'visit',
      entityId: visitId,
      entityName: 'Visit',
      description: `Deleted manually logged visit ${visitId}`,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      metadata: { visitId }
    })
  } catch (auditErr) {
    console.error('Failed to log audit entry for visit deletion:', auditErr)
  }

  return { success: true, deletedId: visitId }
}

export interface DueFollowUpItem {
  id: string
  customerId: string
  customerName: string
  customerMobile: string
  customerCity?: string
  locationId: string
  at: string
  kind: VisitKind
  note?: string
  followUpOn: string
  followUpDone: boolean
}

/**
 * Lists open follow-ups due on or before the given date, ordered oldest first,
 * enriched with customer name and mobile number.
 */
export async function listDueFollowUps(until: string): Promise<DueFollowUpItem[]> {
  if (!until || !/^\d{4}-\d{2}-\d{2}$/.test(until.trim())) {
    throw new Error(`Invalid until date: "${until}". Expected format YYYY-MM-DD.`)
  }

  const snap = await adminDb
    .collection('visits')
    .where('followUpDone', '==', false)
    .where('followUpOn', '<=', until.trim())
    .orderBy('followUpOn', 'asc')
    .get()

  if (snap.empty) {
    return []
  }

  const visits = snap.docs.map((d) => ({ ...d.data(), id: d.id })) as Visit[]

  // Fetch unique customer profiles for enrichment
  const customerIds = Array.from(new Set(visits.map((v) => v.customerId)))
  const customerDocs = await Promise.all(
    customerIds.map((cId) => adminDb.collection('customers').doc(cId).get())
  )

  const customerMap = new Map<string, Customer>()
  for (const doc of customerDocs) {
    if (doc.exists) {
      customerMap.set(doc.id, { ...doc.data(), id: doc.id } as Customer)
    }
  }

  return visits.map((v) => {
    const cust = customerMap.get(v.customerId)
    return {
      id: v.id,
      customerId: v.customerId,
      customerName: cust?.displayName || 'Customer',
      customerMobile: cust?.mobile?.e164 || '',
      customerCity: cust?.address?.city,
      locationId: v.locationId,
      at: v.at,
      kind: v.kind,
      note: v.note,
      followUpOn: v.followUpOn!,
      followUpDone: v.followUpDone
    }
  })
}

export interface ListVisitsOptions {
  customerId?: string
  locationId?: string
  limit?: number
  cursor?: string
}

/**
 * Lists visits chronologically with optional filters and cursor pagination.
 */
export async function listVisits(options?: ListVisitsOptions): Promise<{ visits: Visit[]; nextCursor: string | null }> {
  const limitCount = options?.limit && options.limit > 0 ? Math.min(options.limit, 100) : 25
  let query: FirebaseFirestore.Query = adminDb.collection('visits')

  if (options?.customerId) {
    query = query.where('customerId', '==', options.customerId)
  }
  if (options?.locationId) {
    query = query.where('locationId', '==', options.locationId)
  }

  query = query.orderBy('at', 'desc')

  if (options?.cursor) {
    const cursorDoc = await adminDb.collection('visits').doc(options.cursor).get()
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc)
    }
  }

  const snap = await query.limit(limitCount + 1).get()
  const docs = snap.docs
  const hasMore = docs.length > limitCount
  const resultDocs = hasMore ? docs.slice(0, limitCount) : docs
  const nextCursor = hasMore ? resultDocs[resultDocs.length - 1].id : null

  const visits = resultDocs.map((doc) => ({
    ...doc.data(),
    id: doc.id
  })) as Visit[]

  return { visits, nextCursor }
}
