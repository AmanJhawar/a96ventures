import 'server-only'

import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { sumPaise, paiseToRupees } from '@/lib/utils/money'
import { mgToGrams } from '@/lib/utils/weight'
import { getZeroBalanceLockRef, assertNotZeroBalanceLocked, getClosedFiscalCutoff } from '@/lib/server/system-lock'
import { executeOrderLinesStockUpdate, applyReverseTransaction } from '@/lib/server/ledger'
import { getTodayIST } from '@/lib/utils/date'
import { ValidationError } from '@/lib/errors'
export { ValidationError } from '@/lib/errors'
import {
  Order,
  OrderLine,
  OrderPayment,
  PaymentMode,
  CustomerStats,
  Customer,
  Visit,
  Product,
  Transaction
} from '@/lib/types'

/**
 * Returns the Indian Fiscal Year starting year string for a given date in YYYY-MM-DD.
 * In India, the fiscal year begins on 1 April and ends on 31 March:
 * - 2026-04-01 to 2027-03-31 belongs to FY starting 2026 ("2026").
 * - 2027-01-15 belongs to FY starting 2026 ("2026").
 */
export function getIndianFiscalYear(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new Error('Date string is required to determine Indian Fiscal Year')
  }
  const parts = dateStr.trim().split('-')
  if (parts.length < 2) {
    throw new Error(`Invalid date format for fiscal year: "${dateStr}". Expected YYYY-MM-DD.`)
  }
  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    throw new Error(`Invalid date format for fiscal year: "${dateStr}". Expected YYYY-MM-DD.`)
  }
  return month <= 3 ? String(year - 1) : String(year)
}

export interface CreateOrderLineInput {
  productId: string
  qty: number
  pieceWeightMg?: number
  unitPricePaise: number
}

export interface CreateOrderParams {
  type: 'sale' | 'return'
  customerId?: string
  locationId: string
  date: string // "YYYY-MM-DD"
  lines: CreateOrderLineInput[]
  payments: OrderPayment[]
  notes?: string
  caller: {
    callerUid: string
    callerName: string
    callerEmail: string
  }
}

/**
 * Validates payments array business rules:
 * - Sum of payments must equal line total exactly.
 * - Old metal payments require metal ('Gold' | 'Silver'), weightMg (positive integer), and purity.
 */
export function validateOrderPayments(payments: OrderPayment[], totalLinePaise: number): void {
  if (!Array.isArray(payments) || payments.length === 0) {
    throw new ValidationError('At least one payment entry is required')
  }

  const validModes: PaymentMode[] = ['cash', 'upi', 'card', 'bank', 'old_metal']
  for (const p of payments) {
    if (!validModes.includes(p.mode)) {
      throw new ValidationError(`Invalid payment mode: "${p.mode}"`)
    }
    if (typeof p.amountPaise !== 'number' || !Number.isInteger(p.amountPaise) || p.amountPaise <= 0) {
      throw new ValidationError(`Payment amount must be a positive integer in paise. Received: ${p.amountPaise}`)
    }
    if (p.mode === 'old_metal') {
      if (!p.metal || !['Gold', 'Silver'].includes(p.metal)) {
        throw new ValidationError('Old metal payment requires metal to be "Gold" or "Silver"')
      }
      if (typeof p.weightMg !== 'number' || !Number.isInteger(p.weightMg) || p.weightMg <= 0) {
        throw new ValidationError('Old metal payment requires weightMg as a positive integer in milligrams')
      }
      if (!p.purity || typeof p.purity !== 'string' || !p.purity.trim()) {
        throw new ValidationError('Old metal payment requires a non-empty purity string')
      }
    }
  }

  const paymentsTotalPaise = sumPaise(payments.map((p) => p.amountPaise))
  if (paymentsTotalPaise !== totalLinePaise) {
    throw new ValidationError(
      `Payment mismatch: payments sum to ${paymentsTotalPaise} paise, but total bill is ${totalLinePaise} paise. Difference: ${paymentsTotalPaise - totalLinePaise} paise.`
    )
  }
}

/**
 * Creates a complete multi-line order with payments inside ONE atomic Firestore transaction:
 * - Validates zero-balance lock and caller location access.
 * - Validates stock availability for every line. If ANY line fails (e.g. line 3 of 4), commits nothing.
 * - Enforces exact payment matching.
 * - Takes next sequential bill number from counters/{fiscalYear}.
 * - Writes one transactions row per line (with legacy rupee price, orderId, and customerId).
 * - Writes the orders document.
 * - If customerId provided: writes a visits row ('purchase' or 'return') and updates customer stats.
 */
export async function createOrder(params: CreateOrderParams): Promise<Order> {
  const { type, customerId, locationId, date, lines, payments, notes, caller } = params

  if (type !== 'sale' && type !== 'return') {
    throw new ValidationError(`Invalid order type: "${type}". Expected "sale" or "return".`)
  }
  if (!locationId) {
    throw new ValidationError('Location ID is required')
  }
  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ValidationError(`Invalid date: "${date}". Expected format YYYY-MM-DD.`)
  }

  const today = getTodayIST()
  if (date > today) {
    throw new ValidationError(`Order date cannot be in the future (${date}). Current date in IST is ${today}.`)
  }

  const closedCutoff = await getClosedFiscalCutoff()
  if (closedCutoff && date <= closedCutoff) {
    throw new ValidationError(
      `Entries dated on or before ${closedCutoff} are blocked. The financial period up to ${closedCutoff} has been closed and archived.`
    )
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ValidationError('Order must contain at least one line item')
  }

  const fiscalYear = getIndianFiscalYear(date)
  const counterRef = adminDb.collection('counters').doc(fiscalYear)
  const lockRef = getZeroBalanceLockRef()
  const locRef = adminDb.collection('locations').doc(locationId)
  const customerRef = customerId ? adminDb.collection('customers').doc(customerId) : null

  const uniqueProductIds = Array.from(new Set(lines.map((l) => l.productId)))
  const productRefs = uniqueProductIds.map((id) => adminDb.collection('products').doc(id))

  const newOrder = await adminDb.runTransaction(async (t) => {
    // ----------------------------------------------------
    // STAGE 1: ALL READS FIRST (Strict Firestore rule)
    // ----------------------------------------------------
    const lockSnap = await t.get(lockRef)
    assertNotZeroBalanceLocked(lockSnap)

    const locSnap = await t.get(locRef)
    if (!locSnap.exists) {
      throw new ValidationError(`Location not found: "${locationId}"`)
    }
    const locationName = String(locSnap.data()?.name || 'Main Vault')

    let customerData: Customer | null = null
    if (customerRef) {
      const custSnap = await t.get(customerRef)
      if (!custSnap.exists) {
        throw new ValidationError(`Customer not found: "${customerId}"`)
      }
      const data = custSnap.data() as Customer
      if (data.isArchived) {
        throw new ValidationError('Cannot create order for an archived customer')
      }
      customerData = { ...data, id: custSnap.id }
    }

    const counterSnap = await t.get(counterRef)

    const productSnaps = await Promise.all(productRefs.map((ref) => t.get(ref)))
    const productsMap = new Map<string, Product>()
    for (let i = 0; i < productSnaps.length; i++) {
      const pSnap = productSnaps[i]
      if (!pSnap.exists) {
        throw new ValidationError(`Product not found: "${uniqueProductIds[i]}"`)
      }
      const pData = pSnap.data() as Product
      if (pData.isArchived) {
        throw new ValidationError(`Product is archived and cannot be ordered: "${pData.name}"`)
      }
      productsMap.set(pSnap.id, { ...pData, id: pSnap.id })
    }

    // ----------------------------------------------------
    // STAGE 2: IN-MEMORY VALIDATION & CALCULATION
    // ----------------------------------------------------
    const execution = executeOrderLinesStockUpdate({
      lines,
      productsMap,
      locationId,
      locationName,
      type
    })

    // Check payments sum against total paise
    validateOrderPayments(payments, execution.totals.amountPaise)

    // Allocate order sequence number from counters
    let nextSeq = 1
    if (counterSnap.exists) {
      const cData = counterSnap.data()
      if (typeof cData?.nextOrderNo === 'number' && cData.nextOrderNo > 0) {
        nextSeq = cData.nextOrderNo
      }
    }
    const orderNo = `A96-${fiscalYear}-${String(nextSeq).padStart(6, '0')}`

    const orderRef = adminDb.collection('orders').doc()

    // ----------------------------------------------------
    // STAGE 3: ALL WRITES
    // ----------------------------------------------------
    const orderLines: OrderLine[] = []

    for (const lineRes of execution.lineResults) {
      const txRef = adminDb.collection('transactions').doc()
      const txPayload: Record<string, unknown> = {
        id: txRef.id,
        type,
        orderId: orderRef.id,
        orderNo,
        invoiceNo: orderNo,
        productId: lineRes.productId,
        productName: lineRes.productName,
        category: lineRes.category,
        brand: productsMap.get(lineRes.productId)?.brand || 'Local',
        metal: lineRes.metal,
        quantity: lineRes.qty,
        price: paiseToRupees(lineRes.unitPricePaise),
        totalAmount: paiseToRupees(lineRes.lineTotalPaise),
        locationId,
        locationName,
        date,
        notes: notes ? notes.trim() : '',
        createdAt: FieldValue.serverTimestamp(),
        timestamp: FieldValue.serverTimestamp(),
        operatorId: caller.callerUid,
        operatorName: caller.callerName,
        operatorEmail: caller.callerEmail,
        isReversed: false,
        ...lineRes.txPiecePayload
      }

      if (customerId) {
        txPayload.customerId = customerId
        if (customerData?.displayName) {
          txPayload.customerName = customerData.displayName
        }
      }

      if (lineRes.weightMg !== undefined && lineRes.weightMg > 0) {
        txPayload.weight = mgToGrams(lineRes.weightMg)
        txPayload.weightMg = lineRes.weightMg
      }

      t.set(txRef, txPayload)

      orderLines.push({
        transactionId: txRef.id,
        productId: lineRes.productId,
        productName: lineRes.productName,
        metal: lineRes.metal,
        category: lineRes.category,
        qty: lineRes.qty,
        pieceWeightMg: lineRes.pieceWeightMg,
        unitPricePaise: lineRes.unitPricePaise,
        lineTotalPaise: lineRes.lineTotalPaise
      })
    }

    // Apply stock updates to each product
    for (const [pId, updates] of execution.productUpdates.entries()) {
      t.update(adminDb.collection('products').doc(pId), {
        ...updates,
        updatedAt: FieldValue.serverTimestamp()
      })
    }

    // Advance counter
    t.set(counterRef, { nextOrderNo: nextSeq + 1 }, { merge: true })

    const orderDocData: Record<string, unknown> = {
      id: orderRef.id,
      orderNo,
      type,
      locationId,
      locationName,
      date,
      createdAt: new Date().toISOString(),
      createdBy: caller.callerUid,
      lines: orderLines,
      totals: execution.totals,
      payments,
      isReversed: false
    }

    if (customerId) orderDocData.customerId = customerId
    if (customerData) {
      orderDocData.customerSnapshot = {
        displayName: customerData.displayName,
        mobileE164: customerData.mobile?.e164 || ''
      }
    }
    if (notes && notes.trim()) {
      orderDocData.notes = notes.trim()
    }

    t.set(orderRef, orderDocData)

    const orderRecord: Order = {
      id: orderRef.id,
      orderNo,
      type,
      customerId: customerId || undefined,
      customerSnapshot: customerData
        ? {
            displayName: customerData.displayName,
            mobileE164: customerData.mobile?.e164 || ''
          }
        : undefined,
      locationId,
      locationName,
      date,
      createdAt: orderDocData.createdAt as string,
      createdBy: caller.callerUid,
      lines: orderLines,
      totals: execution.totals,
      payments,
      notes: notes ? notes.trim() : undefined,
      isReversed: false
    }

    // Update customer stats and log visit if customer is linked
    if (customerData && customerRef) {
      const visitRef = adminDb.collection('visits').doc()
      const visitRecord: Visit = {
        id: visitRef.id,
        customerId: customerData.id,
        locationId,
        at: date,
        staffId: caller.callerUid,
        staffName: caller.callerName,
        kind: type === 'sale' ? 'purchase' : 'return',
        orderId: orderRef.id,
        followUpDone: false
      }
      t.set(visitRef, visitRecord)

      const prevStats: CustomerStats = customerData.stats || {
        visitCount: 0,
        orderCount: 0,
        lifetimeValuePaise: 0,
        lifetimeWeightMg: { Gold: 0, Silver: 0 },
        openFollowUps: 0
      }

      const billDate = date.slice(0, 10)
      const existingFirst = prevStats.firstVisitAt ? prevStats.firstVisitAt.slice(0, 10) : undefined
      const existingLast = prevStats.lastVisitAt ? prevStats.lastVisitAt.slice(0, 10) : undefined

      const firstVisitAt = !existingFirst || billDate < existingFirst ? billDate : existingFirst
      const lastVisitAt = !existingLast || billDate > existingLast ? billDate : existingLast

      const isSale = type === 'sale'
      const updatedStats: CustomerStats = {
        ...prevStats,
        firstVisitAt,
        lastVisitAt,
        visitCount: (prevStats.visitCount || 0) + 1,
        orderCount: (prevStats.orderCount || 0) + 1,
        lastOrderId: orderRef.id,
        lifetimeValuePaise: isSale
          ? (prevStats.lifetimeValuePaise || 0) + execution.totals.amountPaise
          : (prevStats.lifetimeValuePaise || 0) - execution.totals.amountPaise,
        lifetimeWeightMg: {
          Gold: isSale
            ? (prevStats.lifetimeWeightMg?.Gold || 0) + execution.totals.weightMg.Gold
            : (prevStats.lifetimeWeightMg?.Gold || 0) - execution.totals.weightMg.Gold,
          Silver: isSale
            ? (prevStats.lifetimeWeightMg?.Silver || 0) + execution.totals.weightMg.Silver
            : (prevStats.lifetimeWeightMg?.Silver || 0) - execution.totals.weightMg.Silver
        }
      }

      t.update(customerRef, {
        stats: updatedStats,
        updatedAt: new Date().toISOString(),
        updatedBy: caller.callerUid
      })
    }

    return orderRecord
  })

  // Append audit trail entry
  try {
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: 'create',
      entityType: 'order',
      entityId: newOrder.id,
      entityName: `Bill ${newOrder.orderNo}`,
      description: `Created ${newOrder.type} bill ${newOrder.orderNo} with ${newOrder.lines.length} item(s) totalling ₹${paiseToRupees(newOrder.totals.amountPaise).toFixed(2)}${customerId ? ` for customer ${customerId}` : ''}`,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      metadata: {
        orderId: newOrder.id,
        orderNo: newOrder.orderNo,
        type: newOrder.type,
        customerId: newOrder.customerId || null,
        totals: newOrder.totals
      }
    })
  } catch (auditErr) {
    console.error('Failed to log audit entry for order creation:', auditErr)
  }

  return newOrder
}

export interface ReverseOrderParams {
  orderId: string
  caller: {
    callerUid: string
    callerName: string
    callerEmail: string
  }
}

/**
 * Reverses an order in ONE atomic Firestore transaction:
 * - Checks zero-balance lock.
 * - Reverses each line transaction back to product inventory via applyReverseTransaction.
 * - Posts reversal transaction records.
 * - Marks original line transactions as isReversed: true.
 * - Reverts customer stats (subtracting purchase amounts/weights or restoring return amounts/weights).
 * - Marks order as isReversed: true, reversedAt, reversedBy.
 */
export async function reverseOrder(params: ReverseOrderParams): Promise<Order> {
  const { orderId, caller } = params
  if (!orderId) {
    throw new ValidationError('Order ID is required')
  }

  const lockRef = getZeroBalanceLockRef()
  const orderRef = adminDb.collection('orders').doc(orderId)

  const reversedOrder = await adminDb.runTransaction(async (t) => {
    // ----------------------------------------------------
    // STAGE 1: ALL READS
    // ----------------------------------------------------
    const lockSnap = await t.get(lockRef)
    assertNotZeroBalanceLocked(lockSnap)

    const orderSnap = await t.get(orderRef)
    if (!orderSnap.exists) {
      throw new ValidationError(`Order not found: "${orderId}"`)
    }
    const orderData = orderSnap.data() as Order
    if (orderData.isReversed) {
      throw new ValidationError(`Order "${orderData.orderNo}" is already reversed.`)
    }

    const closedCutoff = await getClosedFiscalCutoff()
    if (closedCutoff && orderData.date <= closedCutoff) {
      throw new ValidationError(
        `Cannot reverse order: It is dated on or before ${closedCutoff}. The financial period up to ${closedCutoff} has been closed and archived.`
      )
    }

    const today = getTodayIST()
    if (orderData.date > today) {
      throw new ValidationError(
        `Cannot reverse order: It is dated in the future (${orderData.date}). Today is ${today}.`
      )
    }

    const customerRef = orderData.customerId
      ? adminDb.collection('customers').doc(orderData.customerId)
      : null
    const customerSnap = customerRef ? await t.get(customerRef) : null
    const customerData = customerSnap && customerSnap.exists ? (customerSnap.data() as Customer) : null

    // Read all line transactions
    const txRefs = orderData.lines.map((l) => adminDb.collection('transactions').doc(l.transactionId))
    const txSnaps = await Promise.all(txRefs.map((ref) => t.get(ref)))

    const transactionsMap = new Map<string, Transaction>()
    for (let i = 0; i < txSnaps.length; i++) {
      const snap = txSnaps[i]
      if (!snap.exists) {
        throw new ValidationError(`Transaction record "${orderData.lines[i].transactionId}" not found for line ${i + 1}`)
      }
      const txData = { ...snap.data(), id: snap.id } as Transaction
      if (txData.isReversed) {
        throw new ValidationError(
          `Cannot reverse order "${orderData.orderNo}": line item transaction "${snap.id}" has already been reversed.`
        )
      }
      if (txData.reversalOf || txData.isReversal) {
        throw new ValidationError(
          `Cannot reverse order "${orderData.orderNo}": line item transaction "${snap.id}" is already a reversal entry.`
        )
      }
      transactionsMap.set(snap.id, txData)
    }

    // Read all unique products
    const uniqueProductIds = Array.from(new Set(orderData.lines.map((l) => l.productId)))
    const prodRefs = uniqueProductIds.map((id) => adminDb.collection('products').doc(id))
    const prodSnaps = await Promise.all(prodRefs.map((ref) => t.get(ref)))

    const workingProducts = new Map<string, Product>()
    for (let i = 0; i < prodSnaps.length; i++) {
      const snap = prodSnaps[i]
      if (!snap.exists) {
        throw new ValidationError(`Product not found: "${uniqueProductIds[i]}"`)
      }
      workingProducts.set(snap.id, { ...snap.data(), id: snap.id } as Product)
    }

    // ----------------------------------------------------
    // STAGE 2: IN-MEMORY VALIDATION & REVERSAL
    // ----------------------------------------------------
    const productFinalUpdates = new Map<string, Record<string, unknown>>()
    const reversalTxs: Array<{ ref: FirebaseFirestore.DocumentReference; payload: Record<string, unknown> }> = []

    for (const line of orderData.lines) {
      const origTx = transactionsMap.get(line.transactionId)!
      const workingProd = workingProducts.get(line.productId)!

      const reverseRes = applyReverseTransaction({
        productData: workingProd,
        originalTx: origTx
      })

      Object.assign(workingProd, reverseRes.productUpdates)
      productFinalUpdates.set(line.productId, reverseRes.productUpdates)

      const revTxRef = adminDb.collection('transactions').doc()
      const revTxPayload: Record<string, unknown> = {
        id: revTxRef.id,
        orderId: orderData.id,
        customerId: orderData.customerId || null,
        productId: line.productId,
        productName: line.productName,
        category: line.category,
        brand: workingProd.brand || 'Local',
        metal: line.metal,
        locationId: orderData.locationId,
        locationName: orderData.locationName,
        date: orderData.date,
        createdAt: FieldValue.serverTimestamp(),
        timestamp: FieldValue.serverTimestamp(),
        operatorId: caller.callerUid,
        operatorName: caller.callerName,
        operatorEmail: caller.callerEmail,
        isReversed: false,
        isReversal: true,
        reversalOf: origTx.id,
        ...reverseRes.reversalTxData
      }
      reversalTxs.push({ ref: revTxRef, payload: revTxPayload })
    }

    // ----------------------------------------------------
    // STAGE 3: ALL WRITES
    // ----------------------------------------------------
    // Write reversal transaction docs and mark original transactions as reversed
    for (let i = 0; i < reversalTxs.length; i++) {
      const rev = reversalTxs[i]
      t.set(rev.ref, rev.payload)
      const origRef = adminDb.collection('transactions').doc(orderData.lines[i].transactionId)
      t.update(origRef, {
        isReversed: true,
        reversedAt: FieldValue.serverTimestamp(),
        reversedBy: caller.callerUid
      })
    }

    // Apply product inventory updates
    for (const [pId, updates] of productFinalUpdates.entries()) {
      t.update(adminDb.collection('products').doc(pId), {
        ...updates,
        updatedAt: FieldValue.serverTimestamp()
      })
    }

    // Update customer stats
    if (customerData && customerRef) {
      const currentStats = customerData.stats || {
        visitCount: 0,
        orderCount: 0,
        lifetimeValuePaise: 0,
        lifetimeWeightMg: { Gold: 0, Silver: 0 },
        openFollowUps: 0
      }

      const isSale = orderData.type === 'sale'
      const revertedStats: CustomerStats = {
        ...currentStats,
        orderCount: Math.max(0, (currentStats.orderCount || 1) - 1),
        lifetimeValuePaise: isSale
          ? (currentStats.lifetimeValuePaise || 0) - orderData.totals.amountPaise
          : (currentStats.lifetimeValuePaise || 0) + orderData.totals.amountPaise,
        lifetimeWeightMg: {
          Gold: isSale
            ? (currentStats.lifetimeWeightMg?.Gold || 0) - orderData.totals.weightMg.Gold
            : (currentStats.lifetimeWeightMg?.Gold || 0) + orderData.totals.weightMg.Gold,
          Silver: isSale
            ? (currentStats.lifetimeWeightMg?.Silver || 0) - orderData.totals.weightMg.Silver
            : (currentStats.lifetimeWeightMg?.Silver || 0) + orderData.totals.weightMg.Silver
        }
      }

      t.update(customerRef, {
        stats: revertedStats,
        updatedAt: new Date().toISOString(),
        updatedBy: caller.callerUid
      })
    }

    const nowIso = new Date().toISOString()
    t.update(orderRef, {
      isReversed: true,
      reversedAt: nowIso,
      reversedBy: caller.callerUid
    })

    return {
      ...orderData,
      isReversed: true,
      reversedAt: nowIso,
      reversedBy: caller.callerUid
    }
  })

  // Append audit trail entry
  try {
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: 'reverse',
      entityType: 'order',
      entityId: reversedOrder.id,
      entityName: `Bill ${reversedOrder.orderNo}`,
      description: `Reversed bill ${reversedOrder.orderNo} (${reversedOrder.lines.length} lines restored)`,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      metadata: {
        orderId: reversedOrder.id,
        orderNo: reversedOrder.orderNo,
        type: reversedOrder.type
      }
    })
  } catch (auditErr) {
    console.error('Failed to log audit entry for order reversal:', auditErr)
  }

  return reversedOrder
}

export interface ListOrdersOptions {
  customerId?: string
  locationId?: string
  startDate?: string
  endDate?: string
  limit?: number
  cursor?: string
}

/**
 * Lists orders with optional customerId, locationId, startDate, endDate filter and cursor pagination.
 */
export async function listOrders(options?: ListOrdersOptions): Promise<{ orders: Order[]; nextCursor: string | null }> {
  const limitCount = options?.limit && options.limit > 0 ? Math.min(options.limit, 100) : 25
  let query: FirebaseFirestore.Query = adminDb.collection('orders')

  if (options?.customerId) {
    query = query.where('customerId', '==', options.customerId)
  }
  if (options?.locationId) {
    query = query.where('locationId', '==', options.locationId)
  }
  if (options?.startDate && options?.endDate) {
    query = query.where('date', '>=', options.startDate).where('date', '<=', options.endDate)
  } else if (options?.startDate) {
    query = query.where('date', '>=', options.startDate)
  } else if (options?.endDate) {
    query = query.where('date', '<=', options.endDate)
  }

  query = query.orderBy('date', 'desc').orderBy('createdAt', 'desc')

  if (options?.cursor) {
    const cursorDoc = await adminDb.collection('orders').doc(options.cursor).get()
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc)
    }
  }

  const snap = await query.limit(limitCount + 1).get()
  const docs = snap.docs
  const hasMore = docs.length > limitCount
  const resultDocs = hasMore ? docs.slice(0, limitCount) : docs
  const nextCursor = hasMore ? resultDocs[resultDocs.length - 1].id : null

  const orders = resultDocs.map((doc) => ({
    ...doc.data(),
    id: doc.id
  })) as Order[]

  return { orders, nextCursor }
}
