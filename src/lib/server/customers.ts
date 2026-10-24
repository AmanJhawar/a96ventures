import 'server-only'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { AuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { Customer, CustomerStats, CustomerAddress } from '@/lib/types'
import { normaliseMobile } from '@/lib/utils/phone'
import {
  normalisePan,
  isValidPan,
  panHolderType,
  maskPan,
  encryptPan,
  decryptPan,
  hashPan
} from '@/lib/server/pan'
import { buildSearchTerms, queryToken } from '@/lib/utils/customer-search'
import { buildCSVContent } from '@/lib/utils/csv'
import { getDaysAgoIST } from '@/lib/utils/date'
import { z } from 'zod'

export class ConflictError extends Error {
  field: 'mobile' | 'pan'
  existingCustomerId: string
  existingCustomerName?: string
  isArchived?: boolean

  constructor(
    field: 'mobile' | 'pan',
    existingCustomerId: string,
    existingCustomerName?: string,
    isArchived?: boolean
  ) {
    super(`A customer already exists with this ${field}`)
    this.name = 'ConflictError'
    this.field = field
    this.existingCustomerId = existingCustomerId
    this.existingCustomerName = existingCustomerName
    this.isArchived = isArchived
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RateLimitError'
  }
}

// ==========================================
// Zod Validation Schemas
// ==========================================

export const CreateCustomerSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'First name is required')
    .max(60),
  middleName: z.string().trim().max(60).optional(),
  lastName: z
    .string()
    .trim()
    .min(1, 'Last name is required')
    .max(60),
  countryCode: z.string().trim().default('+91'),
  mobile: z
    .string()
    .trim()
    .min(1, 'Mobile number is required'),
  email: z.string().trim().email('Invalid email address').toLowerCase().optional().or(z.literal('')),
  address: z
    .object({
      line1: z.string().trim().optional(),
      line2: z.string().trim().optional(),
      city: z.string().trim().optional(),
      state: z.string().trim().optional(),
      pincode: z.string().trim().regex(/^\d{6}$/, 'PIN code must be 6 digits').optional().or(z.literal('')),
      country: z.literal('India').default('India')
    })
    .optional(),
  pan: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional(),
  source: z.enum(['walk_in', 'inquiry', 'referral', 'import']).default('walk_in'),
  inquiryId: z.string().trim().optional()
})

export const UpdateCustomerSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  middleName: z.union([z.string().trim().max(60), z.literal(''), z.null()]).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  countryCode: z.string().trim().optional(),
  mobile: z.string().trim().optional(),
  email: z.union([z.string().trim().email('Invalid email address').toLowerCase(), z.literal(''), z.null()]).optional(),
  address: z
    .union([
      z.object({
        line1: z.string().trim().optional(),
        line2: z.string().trim().optional(),
        city: z.string().trim().optional(),
        state: z.string().trim().optional(),
        pincode: z.string().trim().regex(/^\d{6}$/, 'PIN code must be 6 digits').optional().or(z.literal('')),
        country: z.literal('India').default('India')
      }),
      z.literal(''),
      z.null()
    ])
    .optional(),
  notes: z.union([z.string().trim().max(1000), z.literal(''), z.null()]).optional(),
  source: z.enum(['walk_in', 'inquiry', 'referral', 'import']).optional()
})

export const UpdatePanSchema = z.object({
  pan: z.string().trim().min(1, 'PAN is required')
})

function formatDisplayName(first: string, middle?: string | null, last?: string): string {
  return [first, middle, last].filter(Boolean).join(' ').trim()
}

// ==========================================
// Customer Service Functions
// ==========================================

export async function createCustomerServer(
  caller: AuthenticatedCaller,
  rawInput: unknown
): Promise<Customer> {
  if (!hasModulePermission(caller, 'customers', 'add')) {
    throw new Error('Forbidden: Insufficient permissions to add customers')
  }

  const input = CreateCustomerSchema.parse(rawInput)

  // 1. Normalise and validate mobile number
  const mobileResult = normaliseMobile(input.countryCode, input.mobile)
  if (!mobileResult.success) {
    throw new Error(mobileResult.error)
  }
  const normalisedMobile = mobileResult.data

  // 2. Validate and prepare PAN if provided
  let panSummary = undefined
  let encryptedPanPayload = undefined
  let panHmac = undefined

  if (input.pan && input.pan.trim()) {
    if (!hasModulePermission(caller, 'customers', 'editPan')) {
      throw new Error('Forbidden: Insufficient permissions to enter or edit customer PAN')
    }
    const cleanPan = normalisePan(input.pan)
    if (!isValidPan(cleanPan)) {
      throw new Error('Invalid PAN format. Must be 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)')
    }
    panHmac = hashPan(cleanPan)
    encryptedPanPayload = encryptPan(cleanPan)
    panSummary = {
      masked: maskPan(cleanPan),
      last4: cleanPan.slice(-4),
      holderType: panHolderType(cleanPan)
    }
  }

  const customerId = adminDb.collection('customers').doc().id
  const now = new Date().toISOString()
  const displayName = formatDisplayName(input.firstName, input.middleName, input.lastName)

  const searchTerms = buildSearchTerms({
    firstName: input.firstName,
    middleName: input.middleName,
    lastName: input.lastName,
    mobile: normalisedMobile
  })

  const initialStats: CustomerStats = {
    visitCount: 0,
    orderCount: 0,
    lifetimeValuePaise: 0,
    lifetimeWeightMg: { Gold: 0, Silver: 0 },
    openFollowUps: 0
  }

  const customerDocData = {
    id: customerId,
    firstName: input.firstName,
    middleName: input.middleName || null,
    lastName: input.lastName,
    displayName,
    mobile: normalisedMobile,
    email: input.email || null,
    address: input.address || null,
    pan: panSummary || null,
    hasPan: Boolean(panSummary),
    notes: input.notes || null,
    source: input.source,
    inquiryIds: input.inquiryId ? [input.inquiryId] : [],
    stats: initialStats,
    searchTerms,
    isArchived: false,
    createdAt: now,
    createdBy: caller.callerUid,
    updatedAt: now,
    updatedBy: caller.callerUid
  }

  // 3. Atomically reserve mobile uniqueness and PAN uniqueness indexes
  await adminDb.runTransaction(async (t) => {
    // Check mobile uniqueness
    const mobileIndexRef = adminDb.collection('customer_mobiles').doc(normalisedMobile.e164)
    const mobileIndexSnap = await t.get(mobileIndexRef)
    if (mobileIndexSnap.exists) {
      const existingCustomerId = mobileIndexSnap.data()?.customerId || ''
      const existingCustomerSnap = await t.get(adminDb.collection('customers').doc(existingCustomerId))
      const existingCustomer = existingCustomerSnap.data() as Customer | undefined
      throw new ConflictError(
        'mobile',
        existingCustomerId,
        existingCustomer?.displayName,
        Boolean(existingCustomer?.isArchived)
      )
    }

    // Check PAN uniqueness if provided
    let panIndexRef = null
    if (panHmac) {
      panIndexRef = adminDb.collection('customer_pans').doc(panHmac)
      const panIndexSnap = await t.get(panIndexRef)
      if (panIndexSnap.exists) {
        const existingCustomerId = panIndexSnap.data()?.customerId || ''
        const existingCustomerSnap = await t.get(adminDb.collection('customers').doc(existingCustomerId))
        const existingCustomer = existingCustomerSnap.data() as Customer | undefined
        throw new ConflictError(
          'pan',
          existingCustomerId,
          existingCustomer?.displayName,
          Boolean(existingCustomer?.isArchived)
        )
      }
    }

    // STAGE WRITES
    t.set(mobileIndexRef, {
      customerId,
      e164: normalisedMobile.e164,
      createdAt: now,
      createdBy: caller.callerUid
    })

    if (panIndexRef && panHmac) {
      t.set(panIndexRef, {
        customerId,
        createdAt: now,
        createdBy: caller.callerUid
      })
    }

    const customerRef = adminDb.collection('customers').doc(customerId)
    t.set(customerRef, customerDocData)

    if (encryptedPanPayload) {
      const privatePanRef = customerRef.collection('private').doc('pan')
      t.set(privatePanRef, {
        ...encryptedPanPayload,
        hmac: panHmac,
        updatedAt: now,
        updatedBy: caller.callerUid
      })
    }
  })

  // 4. Record audit log
  await adminDb.collection('audit_logs').add({
    userId: caller.callerUid,
    userName: caller.callerName,
    userEmail: caller.callerEmail,
    action: 'create',
    entityType: 'customer',
    entityId: customerId,
    entityName: displayName,
    description: `Created customer profile for ${displayName} (${normalisedMobile.e164})`,
    timestamp: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  })

  return customerDocData as unknown as Customer
}

export interface GetCustomersServerOptions {
  q?: string
  cursor?: string
  limit?: number
  lastVisit?: '30' | '90' | '365' | 'never' | 'all' | string
  hasFollowUp?: boolean
}

function matchesCustomerFilters(
  c: Customer,
  options?: { lastVisit?: string; hasFollowUp?: boolean }
): boolean {
  if (!options) return true

  if (options.hasFollowUp && !(c.stats?.openFollowUps && c.stats.openFollowUps > 0)) {
    return false
  }

  if (options.lastVisit && options.lastVisit !== 'all') {
    const rawLast = c.stats?.lastVisitAt
    const lastVisitAt = rawLast ? rawLast.slice(0, 10) : undefined

    if (options.lastVisit === 'never') {
      if (lastVisitAt || (c.stats?.visitCount && c.stats.visitCount > 0)) {
        return false
      }
    } else {
      if (!lastVisitAt) return false
      const days = Number(options.lastVisit)
      if (!isNaN(days) && days > 0) {
        const cutoff = getDaysAgoIST(days)
        if (lastVisitAt < cutoff) {
          return false
        }
      }
    }
  }

  return true
}

export async function getCustomersServer(
  caller: AuthenticatedCaller,
  options?: GetCustomersServerOptions
): Promise<{ customers: Customer[]; nextCursor: string | null; hasMore: boolean }> {
  if (!hasModulePermission(caller, 'customers', 'view')) {
    throw new Error('Forbidden: Insufficient permissions to view customers')
  }

  const limitCount = Math.min(Math.max(1, options?.limit || 25), 100)
  const q = options?.q ? queryToken(options.q) : ''
  const cursor = options?.cursor
  const lastVisit = options?.lastVisit
  const hasFollowUp = options?.hasFollowUp

  let query: FirebaseFirestore.Query = adminDb.collection('customers')

  if (q) {
    query = query
      .where('searchTerms', 'array-contains', q)
      .where('isArchived', '==', false)
  } else {
    query = query.where('isArchived', '==', false)
  }

  if (hasFollowUp && (!lastVisit || lastVisit === 'all')) {
    query = query.where('stats.openFollowUps', '>', 0)
  } else if (lastVisit === 'never' && !hasFollowUp) {
    query = query.where('stats.visitCount', '==', 0)
  } else if (lastVisit && lastVisit !== 'all' && lastVisit !== 'never' && !hasFollowUp) {
    const days = Number(lastVisit)
    if (!isNaN(days) && days > 0) {
      const cutoff = getDaysAgoIST(days)
      query = query.where('stats.lastVisitAt', '>=', cutoff).orderBy('stats.lastVisitAt', 'desc')
    }
  } else {
    query = query.orderBy('stats.lastVisitAt', 'desc')
  }

  if (cursor) {
    const cursorSnap = await adminDb.collection('customers').doc(cursor).get()
    if (cursorSnap.exists) {
      query = query.startAfter(cursorSnap)
    }
  }

  query = query.limit(limitCount + 1)
  let snap: FirebaseFirestore.QuerySnapshot
  try {
    snap = await query.get()
    const allMatches = snap.docs
      .map((d) => d.data() as Customer)
      .filter((c) => matchesCustomerFilters(c, { lastVisit, hasFollowUp }))

    const hasMore = snap.docs.length > limitCount || allMatches.length > limitCount
    const docs = allMatches.slice(0, limitCount)
    const nextCursor = hasMore && snap.docs.length > 0 ? snap.docs[Math.min(limitCount - 1, snap.docs.length - 1)].id : null

    return { customers: docs, nextCursor, hasMore }
  } catch (_err: unknown) {
    // Graceful fallback while index is building or for multi-inequality queries
    let fallbackQuery: FirebaseFirestore.Query = adminDb.collection('customers')
    if (q) {
      fallbackQuery = fallbackQuery.where('searchTerms', 'array-contains', q).where('isArchived', '==', false)
    } else {
      fallbackQuery = fallbackQuery.where('isArchived', '==', false)
    }

    if (cursor) {
      const cursorSnap = await adminDb.collection('customers').doc(cursor).get()
      if (cursorSnap.exists) {
        fallbackQuery = fallbackQuery.startAfter(cursorSnap)
      }
    }

    const rawSnap = await fallbackQuery.limit(Math.max(limitCount * 4, 100)).get()
    const filteredDocs = rawSnap.docs
      .filter((d) => !d.data().isArchived && matchesCustomerFilters(d.data() as Customer, { lastVisit, hasFollowUp }))
      .sort((a, b) => {
        const aTime = a.data().stats?.lastVisitAt || a.data().createdAt || ''
        const bTime = b.data().stats?.lastVisitAt || b.data().createdAt || ''
        return bTime.localeCompare(aTime)
      })

    const hasMore = filteredDocs.length > limitCount || rawSnap.docs.length >= Math.max(limitCount * 4, 100)
    const docs = filteredDocs.slice(0, limitCount)
    const customers = docs.map((d) => d.data() as Customer)
    const nextCursor = hasMore && rawSnap.docs.length > 0 ? rawSnap.docs[Math.min(limitCount - 1, rawSnap.docs.length - 1)].id : null

    return { customers, nextCursor, hasMore }
  }
}

export async function getCustomerByIdServer(
  caller: AuthenticatedCaller,
  customerId: string,
  options?: { allowArchived?: boolean }
): Promise<{ customer: Customer; orders: Record<string, unknown>[]; visits: Record<string, unknown>[] }> {
  if (!hasModulePermission(caller, 'customers', 'view')) {
    throw new Error('Forbidden: Insufficient permissions to view customer details')
  }

  const customerSnap = await adminDb.collection('customers').doc(customerId).get()
  if (!customerSnap.exists) {
    throw new Error('Customer not found')
  }

  const customer = customerSnap.data() as Customer
  if (customer.isArchived && !options?.allowArchived) {
    throw new Error('Customer profile has been archived')
  }

  // Fetch recent orders & visits in parallel
  const [ordersSnap, visitsSnap] = await Promise.all([
    adminDb
      .collection('orders')
      .where('customerId', '==', customerId)
      .orderBy('date', 'desc')
      .limit(20)
      .get()
      .catch(() => ({ docs: [] })),
    adminDb
      .collection('visits')
      .where('customerId', '==', customerId)
      .orderBy('at', 'desc')
      .limit(20)
      .get()
      .catch(() => ({ docs: [] }))
  ])

  const orders = ordersSnap.docs.map((d) => ({ ...d.data(), id: d.id }))
  const visits = visitsSnap.docs.map((d) => ({ ...d.data(), id: d.id }))

  return { customer, orders, visits }
}

export async function updateCustomerServer(
  caller: AuthenticatedCaller,
  customerId: string,
  rawInput: unknown
): Promise<Customer> {
  if (!hasModulePermission(caller, 'customers', 'edit')) {
    throw new Error('Forbidden: Insufficient permissions to edit customers')
  }

  const input = UpdateCustomerSchema.parse(rawInput)
  const now = new Date().toISOString()

  const updatedCustomerData = await adminDb.runTransaction<Customer>(async (t) => {
    const customerRef = adminDb.collection('customers').doc(customerId)
    const customerSnap = await t.get(customerRef)
    if (!customerSnap.exists) {
      throw new Error('Customer not found')
    }
    const current = customerSnap.data() as Customer
    if (current.isArchived) {
      throw new Error('Cannot edit an archived customer')
    }

    let normalisedMobile = current.mobile
    let mobileSwapped = false

    if (input.mobile && input.mobile !== current.mobile.number) {
      const code = input.countryCode || current.mobile.countryCode || '+91'
      const normRes = normaliseMobile(code, input.mobile)
      if (!normRes.success) throw new Error(normRes.error)
      normalisedMobile = normRes.data

      if (normalisedMobile.e164 !== current.mobile.e164) {
        const newMobileRef = adminDb.collection('customer_mobiles').doc(normalisedMobile.e164)
        const newMobileSnap = await t.get(newMobileRef)
        if (newMobileSnap.exists && newMobileSnap.data()?.customerId !== customerId) {
          const conflictingId = newMobileSnap.data()?.customerId || ''
          const conflictingSnap = await t.get(adminDb.collection('customers').doc(conflictingId))
          const conflictingCust = conflictingSnap.data() as Customer | undefined
          throw new ConflictError(
            'mobile',
            conflictingId,
            conflictingCust?.displayName,
            Boolean(conflictingCust?.isArchived)
          )
        }
        mobileSwapped = true
      }
    }

    const middleNameCleared = input.middleName === null || (typeof input.middleName === 'string' && input.middleName.trim() === '')
    const middleName = middleNameCleared
      ? undefined
      : (input.middleName ? input.middleName.trim() : current.middleName)

    const firstName = input.firstName !== undefined ? input.firstName.trim() : current.firstName
    const lastName = input.lastName !== undefined ? input.lastName.trim() : current.lastName
    const displayName = formatDisplayName(firstName, middleName, lastName)

    const searchTerms = buildSearchTerms({
      firstName,
      middleName,
      lastName,
      mobile: normalisedMobile
    })

    const emailCleared = input.email === null || (typeof input.email === 'string' && input.email.trim() === '')
    const notesCleared = input.notes === null || (typeof input.notes === 'string' && input.notes.trim() === '')

    let addressCleared = input.address === null || input.address === ''
    if (!addressCleared && input.address && typeof input.address === 'object') {
      const a = input.address as Record<string, string | undefined>
      const hasContent = Boolean(
        a.line1?.trim() || a.line2?.trim() || a.city?.trim() || a.state?.trim() || a.pincode?.trim()
      )
      if (!hasContent) addressCleared = true
    }

    // Execute writes
    if (mobileSwapped) {
      t.delete(adminDb.collection('customer_mobiles').doc(current.mobile.e164))
      t.set(adminDb.collection('customer_mobiles').doc(normalisedMobile.e164), {
        customerId,
        e164: normalisedMobile.e164,
        updatedAt: now,
        updatedBy: caller.callerUid
      })
    }

    const updates: Record<string, unknown> = {
      firstName,
      lastName,
      displayName,
      mobile: normalisedMobile,
      searchTerms,
      updatedAt: now,
      updatedBy: caller.callerUid
    }

    if (middleNameCleared) {
      updates.middleName = FieldValue.delete()
    } else if (middleName !== undefined) {
      updates.middleName = middleName
    }

    if (emailCleared) {
      updates.email = FieldValue.delete()
    } else if (input.email !== undefined && input.email) {
      updates.email = input.email.trim()
    }

    if (notesCleared) {
      updates.notes = FieldValue.delete()
    } else if (input.notes !== undefined && input.notes) {
      updates.notes = input.notes.trim()
    }

    if (addressCleared) {
      updates.address = FieldValue.delete()
    } else if (input.address !== undefined && input.address) {
      updates.address = input.address as CustomerAddress
    }

    if (input.source !== undefined) updates.source = input.source

    t.update(customerRef, updates)

    const returnedCustomer: Customer = {
      ...current,
      firstName,
      lastName,
      displayName,
      mobile: normalisedMobile,
      searchTerms,
      updatedAt: now,
      updatedBy: caller.callerUid,
      middleName: middleNameCleared ? undefined : (middleName !== undefined ? middleName : current.middleName),
      email: emailCleared ? undefined : (input.email !== undefined && input.email ? input.email.trim() : current.email),
      notes: notesCleared ? undefined : (input.notes !== undefined && input.notes ? input.notes.trim() : current.notes),
      address: addressCleared ? undefined : (input.address !== undefined && input.address ? (input.address as CustomerAddress) : current.address),
      source: input.source !== undefined ? input.source : current.source
    }
    return returnedCustomer
  })

  // Audit update
  await adminDb.collection('audit_logs').add({
    userId: caller.callerUid,
    userName: caller.callerName,
    userEmail: caller.callerEmail,
    action: 'update',
    entityType: 'customer',
    entityId: customerId,
    entityName: updatedCustomerData.displayName,
    description: `Updated customer profile for ${updatedCustomerData.displayName}`,
    timestamp: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  })

  return updatedCustomerData
}

export async function archiveCustomerServer(
  caller: AuthenticatedCaller,
  customerId: string
): Promise<{ success: true }> {
  if (!hasModulePermission(caller, 'customers', 'delete')) {
    throw new Error('Forbidden: Insufficient permissions to archive customers')
  }

  const now = new Date().toISOString()
  let displayName = ''

  await adminDb.runTransaction(async (t) => {
    const customerRef = adminDb.collection('customers').doc(customerId)
    const snap = await t.get(customerRef)
    if (!snap.exists) {
      throw new Error('Customer not found')
    }
    const customer = snap.data() as Customer
    displayName = customer.displayName

    t.update(customerRef, {
      isArchived: true,
      updatedAt: now,
      updatedBy: caller.callerUid
    })

    // Release the customer_mobiles reservation when a customer is archived
    if (customer.mobile?.e164) {
      t.delete(adminDb.collection('customer_mobiles').doc(customer.mobile.e164))
    }
  })

  await adminDb.collection('audit_logs').add({
    userId: caller.callerUid,
    userName: caller.callerName,
    userEmail: caller.callerEmail,
    action: 'delete',
    entityType: 'customer',
    entityId: customerId,
    entityName: displayName,
    description: `Archived customer profile for ${displayName}`,
    timestamp: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  })

  return { success: true }
}

export async function restoreCustomerServer(
  caller: AuthenticatedCaller,
  customerId: string
): Promise<{ success: true; customer: Customer }> {
  if (!hasModulePermission(caller, 'customers', 'delete')) {
    throw new Error('Forbidden: Insufficient permissions to restore customers')
  }

  const now = new Date().toISOString()
  let restoredCustomer: Customer

  await adminDb.runTransaction(async (t) => {
    const customerRef = adminDb.collection('customers').doc(customerId)
    const snap = await t.get(customerRef)
    if (!snap.exists) {
      throw new Error('Customer not found')
    }
    const current = snap.data() as Customer
    if (!current.isArchived) {
      restoredCustomer = current
      return
    }

    const mobileE164 = current.mobile?.e164
    if (mobileE164) {
      const mobileRef = adminDb.collection('customer_mobiles').doc(mobileE164)
      const mobileSnap = await t.get(mobileRef)
      if (mobileSnap.exists && mobileSnap.data()?.customerId !== customerId) {
        const conflictingCustomerId = mobileSnap.data()?.customerId || ''
        const conflictingCustomerSnap = await t.get(adminDb.collection('customers').doc(conflictingCustomerId))
        const conflictingCustomer = conflictingCustomerSnap.data() as Customer | undefined
        throw new ConflictError(
          'mobile',
          conflictingCustomerId,
          conflictingCustomer?.displayName,
          Boolean(conflictingCustomer?.isArchived)
        )
      }

      // Re-reserve the mobile number
      t.set(mobileRef, {
        customerId,
        e164: mobileE164,
        updatedAt: now,
        updatedBy: caller.callerUid
      })
    }

    t.update(customerRef, {
      isArchived: false,
      updatedAt: now,
      updatedBy: caller.callerUid
    })

    restoredCustomer = {
      ...current,
      isArchived: false,
      updatedAt: now,
      updatedBy: caller.callerUid
    }
  })

  await adminDb.collection('audit_logs').add({
    userId: caller.callerUid,
    userName: caller.callerName,
    userEmail: caller.callerEmail,
    action: 'restore',
    entityType: 'customer',
    entityId: customerId,
    entityName: restoredCustomer!.displayName,
    description: `Restored customer profile for ${restoredCustomer!.displayName}`,
    timestamp: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  })

  return { success: true, customer: restoredCustomer! }
}

export async function updateCustomerPanServer(
  caller: AuthenticatedCaller,
  customerId: string,
  rawInput: unknown
): Promise<Customer> {
  if (!hasModulePermission(caller, 'customers', 'editPan')) {
    throw new Error('Forbidden: Insufficient permissions to add or change customer PAN')
  }

  const input = UpdatePanSchema.parse(rawInput)
  const cleanPan = normalisePan(input.pan)
  if (!isValidPan(cleanPan)) {
    throw new Error('Invalid PAN format')
  }

  const newPanHmac = hashPan(cleanPan)
  const encryptedPayload = encryptPan(cleanPan)
  const panSummary = {
    masked: maskPan(cleanPan),
    last4: cleanPan.slice(-4),
    holderType: panHolderType(cleanPan)
  }

  const now = new Date().toISOString()

  const updatedCustomer = await adminDb.runTransaction<Customer>(async (t) => {
    const customerRef = adminDb.collection('customers').doc(customerId)
    const customerSnap = await t.get(customerRef)
    if (!customerSnap.exists) throw new Error('Customer not found')
    const customer = customerSnap.data() as Customer

    const privatePanRef = customerRef.collection('private').doc('pan')
    const privateSnap = await t.get(privatePanRef)

    // Check PAN uniqueness index
    const newPanIndexRef = adminDb.collection('customer_pans').doc(newPanHmac)
    const newPanIndexSnap = await t.get(newPanIndexRef)
    if (newPanIndexSnap.exists && newPanIndexSnap.data()?.customerId !== customerId) {
      const conflictingId = newPanIndexSnap.data()?.customerId || ''
      const conflictingSnap = await t.get(adminDb.collection('customers').doc(conflictingId))
      const conflictingCust = conflictingSnap.data() as Customer | undefined
      throw new ConflictError(
        'pan',
        conflictingId,
        conflictingCust?.displayName,
        Boolean(conflictingCust?.isArchived)
      )
    }

    // Release old PAN index if swapping
    if (privateSnap.exists) {
      const oldHmac = privateSnap.data()?.hmac
      if (oldHmac && oldHmac !== newPanHmac) {
        t.delete(adminDb.collection('customer_pans').doc(oldHmac))
      }
    }

    // Set new index and private doc
    t.set(newPanIndexRef, {
      customerId,
      createdAt: now,
      createdBy: caller.callerUid
    })

    t.set(privatePanRef, {
      ...encryptedPayload,
      hmac: newPanHmac,
      updatedAt: now,
      updatedBy: caller.callerUid
    })

    t.update(customerRef, {
      hasPan: true,
      pan: panSummary,
      updatedAt: now,
      updatedBy: caller.callerUid
    })

    return { ...customer, hasPan: true, pan: panSummary }
  })

  // Audit PAN modification without storing value
  await adminDb.collection('audit_logs').add({
    userId: caller.callerUid,
    userName: caller.callerName,
    userEmail: caller.callerEmail,
    action: 'update',
    entityType: 'customer',
    entityId: customerId,
    entityName: updatedCustomer.displayName,
    description: `Updated PAN details on file for ${updatedCustomer.displayName}`,
    diffs: [
      {
        field: 'pan',
        label: 'PAN',
        oldValue: '[redacted]',
        newValue: '[redacted]'
      }
    ],
    timestamp: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  })

  return updatedCustomer
}

export async function removeCustomerPanServer(
  caller: AuthenticatedCaller,
  customerId: string
): Promise<{ success: true }> {
  if (!hasModulePermission(caller, 'customers', 'editPan')) {
    throw new Error('Forbidden: Insufficient permissions to remove customer PAN')
  }

  const now = new Date().toISOString()
  let displayName = ''

  await adminDb.runTransaction(async (t) => {
    const customerRef = adminDb.collection('customers').doc(customerId)
    const customerSnap = await t.get(customerRef)
    if (!customerSnap.exists) throw new Error('Customer not found')
    const customer = customerSnap.data() as Customer
    displayName = customer.displayName

    const privatePanRef = customerRef.collection('private').doc('pan')
    const privateSnap = await t.get(privatePanRef)

    if (privateSnap.exists) {
      const oldHmac = privateSnap.data()?.hmac
      if (oldHmac) {
        t.delete(adminDb.collection('customer_pans').doc(oldHmac))
      }
      t.delete(privatePanRef)
    }

    t.update(customerRef, {
      hasPan: false,
      pan: FieldValue.delete(),
      updatedAt: now,
      updatedBy: caller.callerUid
    })
  })

  await adminDb.collection('audit_logs').add({
    userId: caller.callerUid,
    userName: caller.callerName,
    userEmail: caller.callerEmail,
    action: 'delete',
    entityType: 'customer',
    entityId: customerId,
    entityName: displayName,
    description: `Removed PAN details from customer profile for ${displayName}`,
    timestamp: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  })

  return { success: true }
}

export async function revealCustomerPanServer(
  caller: AuthenticatedCaller,
  customerId: string
): Promise<{ fullPan: string }> {
  if (!hasModulePermission(caller, 'customers', 'viewPan')) {
    throw new Error('Forbidden: Insufficient permissions to reveal customer PAN')
  }

  // 1. Rate-limit check: maximum 10 reveals per user per hour
  const oneHourAgo = new Date(Date.now() - 3600 * 1000)
  const recentRevealsSnap = await adminDb
    .collection('audit_logs')
    .where('userId', '==', caller.callerUid)
    .where('action', '==', 'pan_reveal')
    .where('timestamp', '>=', oneHourAgo)
    .get()

  if (recentRevealsSnap.size >= 10) {
    throw new RateLimitError('Rate limit exceeded: You may reveal at most 10 customer PANs per hour.')
  }

  // 2. Read customer private pan doc
  const privatePanRef = adminDb.collection('customers').doc(customerId).collection('private').doc('pan')
  const privatePanSnap = await privatePanRef.get()
  if (!privatePanSnap.exists) {
    throw new Error('No encrypted PAN found on file for this customer')
  }

  const payload = privatePanSnap.data() as {
    ciphertext: string
    iv: string
    authTag: string
    keyVersion?: number
  }

  const fullPan = decryptPan(payload)

  // 3. Write immutable audit log entry (value is strictly omitted)
  const customerSnap = await adminDb.collection('customers').doc(customerId).get()
  const customerName = customerSnap.data()?.displayName || customerId

  await adminDb.collection('audit_logs').add({
    userId: caller.callerUid,
    userName: caller.callerName,
    userEmail: caller.callerEmail,
    action: 'pan_reveal',
    entityType: 'customer',
    entityId: customerId,
    entityName: customerName,
    description: `PAN revealed by ${caller.callerName}`,
    metadata: {
      customerId,
      rateLimitWindow: '1h',
      revealsInWindow: recentRevealsSnap.size + 1
    },
    timestamp: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  })

  return { fullPan }
}

export async function exportCustomersCSVServer(
  caller: AuthenticatedCaller
): Promise<{ csv: string; count: number }> {
  if (!caller.isSuperAdmin || !hasModulePermission(caller, 'customers', 'export')) {
    throw new Error('Forbidden: Only Super Admin can export customer data')
  }

  const snap = await adminDb
    .collection('customers')
    .where('isArchived', '==', false)
    .orderBy('createdAt', 'desc')
    .get()

  const headers = [
    'Customer ID',
    'Display Name',
    'First Name',
    'Middle Name',
    'Last Name',
    'Mobile',
    'Email',
    'City',
    'State',
    'PIN Code',
    'Country',
    'PAN On File',
    'Masked PAN',
    'PAN Holder Type',
    'Visit Count',
    'Order Count',
    'Lifetime Value (INR)',
    'First Visit',
    'Last Visit',
    'Source',
    'Notes',
    'Created At'
  ]

  const rows: unknown[][] = snap.docs.map((d) => {
    const data = d.data() as Customer
    const ltvRupees = (data.stats?.lifetimeValuePaise || 0) / 100

    return [
      data.id,
      data.displayName,
      data.firstName,
      data.middleName || '',
      data.lastName,
      data.mobile?.e164 || '',
      data.email || '',
      data.address?.city || '',
      data.address?.state || '',
      data.address?.pincode || '',
      data.address?.country || 'India',
      data.hasPan ? 'Yes' : 'No',
      data.pan?.masked || '',
      data.pan?.holderType || '',
      data.stats?.visitCount || 0,
      data.stats?.orderCount || 0,
      ltvRupees.toFixed(2),
      data.stats?.firstVisitAt || '',
      data.stats?.lastVisitAt || '',
      data.source || '',
      data.notes || '',
      data.createdAt || ''
    ]
  })

  const csv = buildCSVContent(headers, rows)

  // Audit export with row count
  await adminDb.collection('audit_logs').add({
    userId: caller.callerUid,
    userName: caller.callerName,
    userEmail: caller.callerEmail,
    action: 'export',
    entityType: 'customer',
    entityId: 'all',
    entityName: 'Customer Directory',
    description: `Exported ${rows.length} customer records to CSV`,
    metadata: { rowCount: rows.length },
    timestamp: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  })

  return { csv, count: rows.length }
}
