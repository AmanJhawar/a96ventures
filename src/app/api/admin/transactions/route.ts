import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { Product, Transaction, TransactionType } from '@/lib/types'
import { gramsToMg, mgToGrams } from '@/lib/utils/weight'
import { getTodayIST, isValidDateStringIST } from '@/lib/utils/date'
import {
  isZeroBalanceLocked,
  getClosedFiscalCutoff,
  getZeroBalanceLockRef,
  assertNotZeroBalanceLocked,
  SystemLockedError
} from '@/lib/server/system-lock'
import {
  applyRecordTransaction,
  applyReverseTransaction,
  normalizeProductLedgerState
} from '@/lib/server/ledger'

export async function GET(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (
      !hasModulePermission(caller, 'sales', 'view') &&
      !hasModulePermission(caller, 'purchases', 'view') &&
      !hasModulePermission(caller, 'movements', 'view') &&
      !hasModulePermission(caller, 'reports', 'view')
    ) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to read transactions' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined
    const type = searchParams.get('type') || undefined
    const productId = searchParams.get('productId') || undefined
    const limitCount = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50', 10)), 200)
    const cursor = searchParams.get('cursor') || undefined
    const excludeReversed = searchParams.get('excludeReversed') === 'true'

    const mapDocToTx = (docSnap: FirebaseFirestore.DocumentSnapshot): Transaction => {
      const data = docSnap.data() as Record<string, unknown>
      const qty = Number(data.quantity || 0)
      const price = typeof data.price === 'number' ? data.price : undefined
      const totalAmount = typeof data.totalAmount === 'number'
        ? data.totalAmount
        : (price !== undefined ? price * (qty > 0 ? qty : 1) : 0)

      return {
        ...data,
        id: docSnap.id,
        type: data.type as Transaction['type'],
        totalAmount,
        isReversed: Boolean(data.isReversed),
        isReversal: Boolean(data.isReversal),
        reversalOf: typeof data.reversalOf === 'string' ? data.reversalOf : undefined,
        previousWeight: typeof data.previousWeightMg === 'number' ? data.previousWeightMg / 1000 : (data.previousWeight as number | undefined),
        newWeight: typeof data.newWeightMg === 'number' ? data.newWeightMg / 1000 : (data.newWeight as number | undefined),
        weightChange: typeof data.weightChangeMg === 'number' ? data.weightChangeMg / 1000 : (data.weightChange as number | undefined),
        recoveredWeight: typeof data.recoveredWeightMg === 'number' ? data.recoveredWeightMg / 1000 : (data.recoveredWeight as number | undefined),
        pieceWeight: typeof data.pieceWeightMg === 'number' ? data.pieceWeightMg / 1000 : (data.pieceWeight as number | undefined),
        pieceWeights: Array.isArray(data.pieceWeightsMg)
          ? data.pieceWeightsMg.map((mg: number) => mg / 1000)
          : Array.isArray(data.pieceWeights)
            ? (data.pieceWeights as number[])
            : undefined
      } as Transaction
    }

    try {
      let queryRef: FirebaseFirestore.Query = adminDb.collection('transactions')

      if (type && type !== 'All') {
        queryRef = queryRef.where('type', '==', type)
      }

      if (productId) {
        queryRef = queryRef.where('productId', '==', productId)
      }

      if (startDate && endDate) {
        queryRef = queryRef.where('date', '>=', startDate).where('date', '<=', endDate).orderBy('date', 'desc')
      } else if (startDate) {
        queryRef = queryRef.where('date', '>=', startDate).orderBy('date', 'desc')
      } else if (endDate) {
        queryRef = queryRef.where('date', '<=', endDate).orderBy('date', 'desc')
      } else {
        queryRef = queryRef.orderBy('date', 'desc')
      }

      if (cursor) {
        const cursorSnap = await adminDb.collection('transactions').doc(cursor).get()
        if (cursorSnap.exists) {
          queryRef = queryRef.startAfter(cursorSnap)
        }
      }

      const fetchLimit = excludeReversed ? Math.min(limitCount * 3, 200) : limitCount
      queryRef = queryRef.limit(fetchLimit)
      const snapshot = await queryRef.get()

      let rawItems = snapshot.docs.map(mapDocToTx)
      if (excludeReversed) {
        rawItems = rawItems.filter((t) => !t.isReversed && !t.isReversal && !t.reversalOf && t.type !== 'reversal')
      }

      const items = rawItems.slice(0, limitCount)
      const nextCursor = snapshot.docs.length >= fetchLimit && items.length === limitCount
        ? snapshot.docs[snapshot.docs.length - 1].id
        : null
      const hasMore = rawItems.length > limitCount || (snapshot.docs.length >= fetchLimit && items.length === limitCount)

      return NextResponse.json({ success: true, transactions: items, nextCursor, hasMore })
    } catch (queryErr: unknown) {
      // If code 9 (composite index building), fall back to querying date range and filtering type in memory
      if ((queryErr as { code?: number })?.code === 9) {
        let fallbackQuery: FirebaseFirestore.Query = adminDb.collection('transactions')
        if (startDate && endDate) {
          fallbackQuery = fallbackQuery.where('date', '>=', startDate).where('date', '<=', endDate).orderBy('date', 'desc')
        } else if (startDate) {
          fallbackQuery = fallbackQuery.where('date', '>=', startDate).orderBy('date', 'desc')
        } else if (endDate) {
          fallbackQuery = fallbackQuery.where('date', '<=', endDate).orderBy('date', 'desc')
        } else {
          fallbackQuery = fallbackQuery.orderBy('date', 'desc')
        }

        if (cursor) {
          const cursorSnap = await adminDb.collection('transactions').doc(cursor).get()
          if (cursorSnap.exists) {
            fallbackQuery = fallbackQuery.startAfter(cursorSnap)
          }
        }

        // Fetch larger batch to find limitCount matching items
        const rawSnap = await fallbackQuery.limit(Math.max(limitCount * 4, 100)).get()
        const filteredDocs = type && type !== 'All'
          ? rawSnap.docs.filter((d) => (d.data() as Record<string, unknown>).type === type)
          : rawSnap.docs

        let rawItems = filteredDocs.map(mapDocToTx)
        if (excludeReversed) {
          rawItems = rawItems.filter((t) => !t.isReversed && !t.isReversal && !t.reversalOf && t.type !== 'reversal')
        }

        const items = rawItems.slice(0, limitCount)
        const nextCursor = rawItems.length > limitCount ? rawSnap.docs[rawSnap.docs.length - 1].id : null
        const hasMore = rawItems.length > limitCount || (rawSnap.docs.length >= Math.max(limitCount * 4, 100) && items.length === limitCount)

        return NextResponse.json({ success: true, transactions: items, nextCursor, hasMore })
      }
      throw queryErr
    }
  } catch (err: unknown) {
    console.error('GET /api/admin/transactions error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to query transactions'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    // 0. Pause new entries if a Master Zero-Balance / Archive run is currently active
    const runLock = await isZeroBalanceLocked()
    if (runLock.isLocked) {
      return NextResponse.json({ error: runLock.message }, { status: 423 })
    }

    const body = await req.json()
    const {
      type,
      productId,
      productName,
      category,
      metal,
      quantity,
      price,
      locationId,
      locationName,
      toLocationId,
      toLocationName,
      customerName,
      notes,
      previousWeight,
      newWeight,
      recoveredWeight,
      date
    } = body

    if (!type || !productId || !locationId) {
      return NextResponse.json({ error: 'Missing mandatory transaction parameters' }, { status: 400 })
    }

    if (type === 'reversal') {
      return NextResponse.json({ error: 'Reversal transactions cannot be created manually. Use the transaction reversal flow instead.' }, { status: 400 })
    }

    if (type === 'sale') {
      if (price === undefined || price === null || price === '' || isNaN(Number(price)) || Number(price) <= 0) {
        return NextResponse.json({ error: 'Selling price is mandatory and must be greater than ₹0' }, { status: 400 })
      }
    }

    // 0b. Validate date format and block entries dated on or before a closed fiscal cutoff
    const effectiveDate = date ? String(date).trim() : getTodayIST()
    if (!isValidDateStringIST(effectiveDate)) {
      return NextResponse.json(
        { error: `Invalid transaction date: "${date}". Date must be in YYYY-MM-DD format.` },
        { status: 400 }
      )
    }
    const closedCutoff = await getClosedFiscalCutoff()
    if (closedCutoff && effectiveDate <= closedCutoff) {
      return NextResponse.json(
        {
          error: `Entries dated on or before ${closedCutoff} are blocked. The financial period up to ${closedCutoff} has been closed and archived.`
        },
        { status: 400 }
      )
    }

    const todayIST = getTodayIST()
    if (effectiveDate > todayIST) {
      return NextResponse.json(
        { error: `Transaction date cannot be in the future (${effectiveDate}). Today is ${todayIST}.` },
        { status: 400 }
      )
    }

    // 1. Permission Gate based on Transaction Type
    switch (type as TransactionType) {
      case 'purchase':
        if (!hasModulePermission(caller, 'purchases', 'add')) {
          return NextResponse.json({ error: 'Forbidden: Insufficient permissions to record purchases' }, { status: 403 })
        }
        break
      case 'sale':
        if (!hasModulePermission(caller, 'sales', 'add')) {
          return NextResponse.json({ error: 'Forbidden: Insufficient permissions to record sales' }, { status: 403 })
        }
        break
      case 'return':
        if (!hasModulePermission(caller, 'returns', 'add')) {
          return NextResponse.json({ error: 'Forbidden: Insufficient permissions to record returns' }, { status: 403 })
        }
        break
      case 'transfer':
        if (!hasModulePermission(caller, 'movements', 'transfer')) {
          return NextResponse.json({ error: 'Forbidden: Insufficient permissions to execute stock transfers' }, { status: 403 })
        }
        break
      case 'adjustment':
        if (!hasModulePermission(caller, 'movements', 'adjustment')) {
          return NextResponse.json({ error: 'Forbidden: Insufficient permissions to adjust stock' }, { status: 403 })
        }
        break
      case 'repair':
        if (!hasModulePermission(caller, 'movements', 'repair')) {
          return NextResponse.json({ error: 'Forbidden: Insufficient permissions to record repairs' }, { status: 403 })
        }
        break
      case 'melt':
        if (!hasModulePermission(caller, 'movements', 'melt')) {
          return NextResponse.json({ error: 'Forbidden: Insufficient permissions to melt inventory' }, { status: 403 })
        }
        break
      default:
        return NextResponse.json({ error: `Invalid transaction type: ${type}` }, { status: 400 })
    }

    // 2. Staff Assigned Location Enforcement
    // Default and lock location: staff with assignedLocationId cannot transact at unauthorized stores
    const isSuperAdmin = caller.isSuperAdmin
    const userAssignedLoc = caller.callerData.assignedLocationId
    if (!isSuperAdmin && userAssignedLoc) {
      if (locationId !== userAssignedLoc) {
        return NextResponse.json({
          error: `Access Denied: You are assigned to ${caller.callerData.assignedLocationName || 'another store'} and cannot record ${type} transactions at a different location.`
        }, { status: 403 })
      }
    }

    let qty = Number(quantity || 0)
    const productRef = adminDb.collection('products').doc(productId)

    // 2. Atomic ACID Stock & Financial Transaction Execution
    const transactionId = await adminDb.runTransaction(async (t) => {
      // Check zero-balance lock inside the write transaction
      const lockRef = getZeroBalanceLockRef()
      const lockSnap = await t.get(lockRef)
      assertNotZeroBalanceLocked(lockSnap)

      const productSnap = await t.get(productRef)
      if (!productSnap.exists) {
        throw new Error('Product not found')
      }

      const productData = productSnap.data() as Product
      if (type === 'purchase') {
        const isIdol = productData.category === 'Idols'
        const rawPieces: unknown[] = Array.isArray(body.pieceWeights) ? body.pieceWeights : []
        const validPieces: number[] = rawPieces.map(Number).filter((w) => !isNaN(w) && w > 0)
        if (isIdol && validPieces.length > 0) {
          qty = validPieces.length
        }
      }

      if (type === 'repair') {
        if (newWeight === undefined || newWeight === null || isNaN(Number(newWeight)) || Number(newWeight) <= 0) {
          throw new Error('Please enter a valid new weight for the repaired item')
        }
      }

      const ledgerResult = applyRecordTransaction({
        productData,
        type,
        quantity: qty,
        locationId,
        locationName,
        toLocationId,
        toLocationName,
        pieceWeight: body.pieceWeight !== undefined && !isNaN(Number(body.pieceWeight)) ? Number(body.pieceWeight) : undefined,
        pieceWeights: Array.isArray(body.pieceWeights) ? body.pieceWeights : undefined,
        newWeight: type === 'repair' ? Number(newWeight) : undefined
      })

      // Write Transaction document
      const txRef = adminDb.collection('transactions').doc()
      const txPayload: Record<string, unknown> = {
        type,
        productId,
        productName: productName || productData.name,
        category: category || (productData.category === 'MMTC PAMP' ? 'Bullions' : productData.category),
        brand: productData.brand || (productData.category === 'MMTC PAMP' ? 'MMTC PAMP' : 'Local'),
        metal: metal || productData.metal || 'Gold',
        quantity: qty,
        locationId,
        locationName,
        date: date || getTodayIST(),
        notes: notes ? String(notes).trim() : '',
        createdAt: FieldValue.serverTimestamp(),
        timestamp: FieldValue.serverTimestamp(),
        operatorId: caller.callerUid,
        operatorName: caller.callerName,
        operatorEmail: caller.callerEmail,
        isReversed: false
      }

      if (price !== undefined && !isNaN(Number(price))) {
        const pNum = Number(price)
        txPayload.price = pNum
        txPayload.totalAmount = pNum * (qty > 0 ? qty : 1)
      } else {
        txPayload.totalAmount = 0
      }
      if (toLocationId) {
        txPayload.toLocationId = toLocationId
        txPayload.toLocationName = toLocationName || ''
      }
      if (customerName) {
        txPayload.customerName = String(customerName).trim()
      }
      if (type === 'repair') {
        const oldW = Number(previousWeight !== undefined ? previousWeight : (productData.weightMg !== undefined ? productData.weightMg / 1000 : productData.weight || 0))
        const newW = Number(newWeight)
        const oldWMg = gramsToMg(oldW)
        const newWMg = gramsToMg(newW)
        const deltaMg = newWMg - oldWMg
        txPayload.previousWeight = mgToGrams(oldWMg)
        txPayload.previousWeightMg = oldWMg
        txPayload.newWeight = mgToGrams(newWMg)
        txPayload.newWeightMg = newWMg
        txPayload.weightChange = mgToGrams(deltaMg)
        txPayload.weightChangeMg = deltaMg
      }
      if (type === 'melt' && recoveredWeight !== undefined) {
        const recMg = gramsToMg(recoveredWeight)
        txPayload.recoveredWeight = mgToGrams(recMg)
        txPayload.recoveredWeightMg = recMg
      }

      Object.assign(txPayload, ledgerResult.txPiecePayload)
      t.set(txRef, txPayload)

      const productUpdates = {
        ...ledgerResult.productUpdates,
        updatedAt: FieldValue.serverTimestamp()
      }
      t.update(productRef, productUpdates)

      // Construct detailed audit narrative for this inventory action
      let auditDesc = `Recorded ${type} of ${qty} unit(s) of "${productName || productData.name}" at ${locationName}`
      if (type === 'sale') {
        auditDesc = `Recorded sale of ${qty} unit(s) of "${productName || productData.name}" at ${locationName}${customerName ? ` to ${customerName}` : ''}${price ? ` for ₹${price.toLocaleString('en-IN')}` : ''}`
      } else if (type === 'purchase') {
        auditDesc = `Recorded purchase of ${qty} unit(s) of "${productName || productData.name}" at ${locationName}${price ? ` for ₹${price.toLocaleString('en-IN')}` : ''}`
      } else if (type === 'transfer') {
        auditDesc = `Transferred ${qty} unit(s) of "${productName || productData.name}" from ${locationName} to ${toLocationName || toLocationId}`
      } else if (type === 'return') {
        auditDesc = `Recorded return of ${qty} unit(s) of "${productName || productData.name}" to ${locationName}`
      } else if (type === 'adjustment') {
        auditDesc = `Stock count adjustment for "${productName || productData.name}" at ${locationName}: ${qty > 0 ? `+${qty}` : qty} unit(s)`
      } else if (type === 'repair') {
        auditDesc = `Repaired "${productName || productData.name}" at ${locationName}: weight adjusted from ${previousWeight || productData.weight}g to ${newWeight}g`
      } else if (type === 'melt') {
        auditDesc = `Melted ${qty} unit(s) of "${productName || productData.name}" at ${locationName}${recoveredWeight ? `, recovered ${recoveredWeight}g` : ''}`
      }

      // Append immutable audit log with server timestamp
      const auditRef = adminDb.collection('audit_logs').doc()
      t.set(auditRef, {
        userId: caller.callerUid,
        userName: caller.callerName,
        userEmail: caller.callerEmail,
        action: type === 'transfer' ? 'transfer' : type === 'adjustment' ? 'adjustment' : type === 'repair' ? 'repair' : type === 'melt' ? 'melt' : 'create',
        entityType: type === 'purchase' ? 'purchase' : type === 'sale' ? 'sale' : 'movement',
        entityId: txRef.id,
        entityName: productName || productData.name,
        locationId,
        locationName,
        description: auditDesc,
        timestamp: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      })

      return { id: txRef.id, payload: txPayload }
    })

    return NextResponse.json({ success: true, id: transactionId.id, transaction: { id: transactionId.id, ...transactionId.payload } })
  } catch (err: unknown) {
    if (err instanceof SystemLockedError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode })
    }
    console.error('POST /api/admin/transactions error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to record transaction'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    const { searchParams } = new URL(req.url)
    const txId = searchParams.get('id')
    if (!txId) {
      return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 })
    }

    const txDocRef = adminDb.collection('transactions').doc(txId)
    const txSnap = await txDocRef.get()
    if (!txSnap.exists) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    const tx = txSnap.data()!
    const txType = tx.type as TransactionType

    // Bill lines cannot be deleted or reversed individually
    if (tx.orderId) {
      let orderNo = tx.orderNo || (tx as Record<string, unknown>).invoiceNo
      if (!orderNo) {
        const orderSnap = await adminDb.collection('orders').doc(tx.orderId).get()
        if (orderSnap.exists) {
          orderNo = orderSnap.data()?.orderNo
        }
      }
      return NextResponse.json(
        { error: `This line belongs to bill ${orderNo || tx.orderId}; reverse the whole bill` },
        { status: 400 }
      )
    }

    // Check if transaction has already been reversed or is a reversal
    if (tx.isReversed) {
      return NextResponse.json({ error: 'This transaction has already been reversed' }, { status: 400 })
    }
    if (tx.isReversal || tx.reversalOf) {
      return NextResponse.json({ error: 'A reversing entry cannot be reversed' }, { status: 400 })
    }
    if (tx.isOpeningBalance || tx.isOpeningEntry) {
      return NextResponse.json(
        { error: 'Opening balance entries cannot be reversed. They establish the ledger baseline.' },
        { status: 400 }
      )
    }

    const closedCutoff = await getClosedFiscalCutoff()
    if (closedCutoff && tx.date && String(tx.date) <= closedCutoff) {
      return NextResponse.json(
        {
          error: `Reversal blocked: This transaction is dated ${tx.date}, which falls on or before the closed fiscal cutoff date (${closedCutoff}). Archived financial periods cannot be modified.`
        },
        { status: 400 }
      )
    }

    const todayDate = getTodayIST()
    if (tx.date && String(tx.date) > todayDate) {
      return NextResponse.json(
        {
          error: `Reversal blocked: This transaction is dated in the future (${tx.date}). Today is ${todayDate}.`
        },
        { status: 400 }
      )
    }

    // Permission Gate for Reversing Transactions
    if (txType === 'sale' && !hasModulePermission(caller, 'sales', 'delete')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to reverse sales records' }, { status: 403 })
    }
    if (txType === 'purchase' && !hasModulePermission(caller, 'purchases', 'delete')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to reverse purchase records' }, { status: 403 })
    }
    if (txType === 'return' && !hasModulePermission(caller, 'returns', 'delete')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to reverse return records' }, { status: 403 })
    }
    if (['transfer', 'adjustment', 'repair', 'melt'].includes(txType) && !hasModulePermission(caller, 'movements', 'delete')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to reverse stock movement records' }, { status: 403 })
    }

    // Staff Assigned Location Enforcement for reversals
    const isSuperAdmin = caller.isSuperAdmin
    const userAssignedLoc = caller.callerData.assignedLocationId
    if (!isSuperAdmin && userAssignedLoc) {
      if (tx.locationId && tx.locationId !== userAssignedLoc) {
        return NextResponse.json({
          error: `Access Denied: You are assigned to ${caller.callerData.assignedLocationName || 'another store'} and cannot reverse transactions for a different location.`
        }, { status: 403 })
      }
    }

    // Atomic Reversal via Reversing Entry (Never Delete)
    const reversalResult = await adminDb.runTransaction(async (t) => {
      // Re-read transaction inside the atomic transaction to prevent concurrent duplicate reversals (double click)
      const latestTxSnap = await t.get(txDocRef)
      if (!latestTxSnap.exists) {
        throw new Error('Transaction not found')
      }
      const latestTx = latestTxSnap.data() as Transaction
      if (latestTx.isReversed) {
        throw new Error('This transaction has already been reversed')
      }
      if (latestTx.isReversal || latestTx.reversalOf) {
        throw new Error('A reversing entry cannot be reversed')
      }
      if (latestTx.orderId) {
        const orderNo = latestTx.orderNo || latestTx.invoiceNo
        throw new Error(`This line belongs to bill ${orderNo || latestTx.orderId}; reverse the whole bill`)
      }

      // Check zero-balance lock inside the write transaction
      const lockRef = getZeroBalanceLockRef()
      const lockSnap = await t.get(lockRef)
      assertNotZeroBalanceLocked(lockSnap)

      const productRef = adminDb.collection('products').doc(latestTx.productId)
      const productSnap = await t.get(productRef)

      const nowIso = new Date().toISOString()
      const todayDate = getTodayIST()

      let reversingPayload: Record<string, unknown> = {}

      if (!productSnap.exists) {
        throw new Error('Product associated with this transaction no longer exists')
      }

      const productData = productSnap.data() as Product

      const ledgerResult = applyReverseTransaction({
        productData,
        originalTx: {
          ...latestTx,
          id: txId
        }
      })

      const productUpdates = {
        ...ledgerResult.productUpdates,
        updatedAt: nowIso
      }
      t.update(productRef, productUpdates)

      reversingPayload = {
        type: 'reversal',
        quantity: ledgerResult.reversalTxData.quantity,
        locationId: latestTx.locationId,
        locationName: latestTx.locationName,
        notes: ledgerResult.reversalTxData.notes
      }
      if (txType === 'transfer' && latestTx.toLocationId) {
        reversingPayload.locationId = latestTx.toLocationId
        reversingPayload.locationName = latestTx.toLocationName || 'Unknown'
        reversingPayload.toLocationId = latestTx.locationId
        reversingPayload.toLocationName = latestTx.locationName
      }
      if (ledgerResult.reversalTxData.previousWeight !== undefined) {
        reversingPayload.previousWeight = ledgerResult.reversalTxData.previousWeight
        reversingPayload.previousWeightMg = ledgerResult.reversalTxData.previousWeightMg
        reversingPayload.newWeight = ledgerResult.reversalTxData.newWeight
        reversingPayload.newWeightMg = ledgerResult.reversalTxData.newWeightMg
        reversingPayload.weightChange = ledgerResult.reversalTxData.weightChange
        reversingPayload.weightChangeMg = ledgerResult.reversalTxData.weightChangeMg
      }

      // 1. Mark original transaction as reversed (Never delete)
      const reversingTxRef = adminDb.collection('transactions').doc()
      t.update(txDocRef, {
        isReversed: true,
        reversedAt: FieldValue.serverTimestamp(),
        reversedBy: caller.callerUid,
        reversedByName: caller.callerName,
        reversedByEmail: caller.callerEmail,
        reversalTransactionId: reversingTxRef.id
      })

      // 2. Post reversing entry pointing at the original transaction
      const reversingEntryDoc: Record<string, unknown> = {
        ...reversingPayload,
        productId: latestTx.productId,
        productName: latestTx.productName,
        category: latestTx.category,
        metal: latestTx.metal || 'Gold',
        date: todayDate,
        createdAt: FieldValue.serverTimestamp(),
        timestamp: FieldValue.serverTimestamp(),
        operatorId: caller.callerUid,
        operatorName: caller.callerName,
        operatorEmail: caller.callerEmail,
        isReversal: true,
        reversalOf: txId
      }
      t.set(reversingTxRef, reversingEntryDoc)

      // 3. Record audit log for the reversal with server timestamp
      const auditRef = adminDb.collection('audit_logs').doc()
      t.set(auditRef, {
        userId: caller.callerUid,
        userName: caller.callerName,
        userEmail: caller.callerEmail,
        action: 'reverse',
        entityType: txType === 'purchase' ? 'purchase' : txType === 'sale' ? 'sale' : 'movement',
        entityId: txId,
        entityName: tx.productName,
        locationId: tx.locationId,
        locationName: tx.locationName,
        description: `Posted reversing entry #${reversingTxRef.id} pointing at ${txType} #${txId} ("${tx.productName}"). Original transaction preserved.`,
        metadata: {
          originalTransactionId: txId,
          reversalTransactionId: reversingTxRef.id,
          reversalType: reversingPayload.type
        },
        timestamp: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      })
      return { reversedId: txId, reversingId: reversingTxRef.id, reversingEntry: { id: reversingTxRef.id, ...reversingEntryDoc } }
    })

    return NextResponse.json({
      success: true,
      reversedTransactionId: reversalResult.reversedId,
      reversingTransactionId: reversalResult.reversingId,
      reversingEntry: reversalResult.reversingEntry
    })
  } catch (err: unknown) {
    if (err instanceof SystemLockedError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode })
    }
    console.error('DELETE /api/admin/transactions error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to reverse transaction'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

/**
 * PUT /api/admin/transactions
 * Backward-compatible delegate for Master Zero-Balance fiscal cutoff.
 * Delegates to executeZeroBalanceCutoffServer in @/lib/server/archive.
 */
export async function PUT(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (!hasModulePermission(caller, 'archive', 'zeroBalance')) {
      return NextResponse.json({ error: 'Forbidden: Super Admin or Master Zero-Balance authorization required' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const { executeZeroBalanceCutoffServer } = await import('@/lib/server/archive')

    const result = await executeZeroBalanceCutoffServer({
      caller,
      cutoffDate: body?.cutoffDate,
      expectedTransactionCount: body?.expectedTransactionCount,
      expectedAuditCount: body?.expectedAuditCount,
      confirmationPhrase: body?.confirmationPhrase
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    const { ValidationError } = await import('@/lib/errors')
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }

    const errorWithCode = err as { code?: string; message?: string }
    if (errorWithCode?.code === 'auth/requires-recent-login') {
      return NextResponse.json(
        {
          error: errorWithCode.message || 'Fresh authentication required',
          code: 'auth/requires-recent-login'
        },
        { status: 401 }
      )
    }

    if (errorWithCode?.code === 'COUNT_MISMATCH') {
      return NextResponse.json({ error: errorWithCode.message }, { status: 409 })
    }

    if (errorWithCode?.message?.includes('currently locked')) {
      return NextResponse.json({ error: errorWithCode.message }, { status: 423 })
    }

    console.error('PUT /api/admin/transactions error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to clear transactions'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    const body = await req.json().catch(() => ({}))
    const { id, quantity, price, locationId, locationName, date, customerName, vendorName, notes } = body

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid transaction ID' }, { status: 400 })
    }

    const txRef = adminDb.collection('transactions').doc(id)
    const txSnap = await txRef.get()
    if (!txSnap.exists) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    const currentTx = txSnap.data() as Transaction

    // Bill lines cannot be modified individually
    if (currentTx.orderId) {
      let orderNo = currentTx.orderNo || currentTx.invoiceNo
      if (!orderNo) {
        const orderSnap = await adminDb.collection('orders').doc(currentTx.orderId).get()
        if (orderSnap.exists) {
          orderNo = orderSnap.data()?.orderNo
        }
      }
      return NextResponse.json(
        { error: `This line belongs to bill ${orderNo || currentTx.orderId}; reverse the whole bill` },
        { status: 400 }
      )
    }

    // Staff Assigned Location Enforcement (Store Lock Check)
    const isSuperAdmin = caller.isSuperAdmin
    const userAssignedLoc = caller.callerData.assignedLocationId
    if (!isSuperAdmin && userAssignedLoc) {
      if (currentTx.locationId && currentTx.locationId !== userAssignedLoc) {
        return NextResponse.json(
          {
            error: `Access Denied: You are assigned to ${caller.callerData.assignedLocationName || 'another store'} and cannot edit transactions for a different location.`
          },
          { status: 403 }
        )
      }
      if (locationId && String(locationId).trim() !== userAssignedLoc) {
        return NextResponse.json(
          {
            error: `Access Denied: You are assigned to ${caller.callerData.assignedLocationName || 'another store'} and cannot reassign transactions to a different location.`
          },
          { status: 403 }
        )
      }
    }

    // Authorize caller: Super Admin or granular edit permission for the transaction type (purchase or sale)
    const txType = currentTx.type
    const hasEditPermission =
      caller.isSuperAdmin ||
      (txType === 'purchase' && hasModulePermission(caller, 'purchases', 'edit')) ||
      (txType === 'sale' && hasModulePermission(caller, 'sales', 'edit'))

    if (!hasEditPermission) {
      return NextResponse.json(
        { error: `Forbidden: Insufficient permissions to edit ${txType || 'ledger'} transactions` },
        { status: 403 }
      )
    }

    if (currentTx.isReversed || currentTx.reversalOf || currentTx.type === 'reversal') {
      return NextResponse.json(
        { error: 'Cannot modify a reversed transaction or reversal entry' },
        { status: 400 }
      )
    }

    // Fiscal Cutoff validation
    const closedCutoff = await getClosedFiscalCutoff()
    if (closedCutoff && (currentTx.date <= closedCutoff || (date && String(date).trim() <= closedCutoff))) {
      return NextResponse.json(
        { error: `Entries on or before closed fiscal cutoff (${closedCutoff}) are archived and locked` },
        { status: 400 }
      )
    }

    const targetDate = date ? String(date).trim() : currentTx.date
    if (date && !isValidDateStringIST(targetDate)) {
      return NextResponse.json(
        { error: `Invalid transaction date: "${date}". Date must be in YYYY-MM-DD format.` },
        { status: 400 }
      )
    }

    if (price !== undefined && (isNaN(Number(price)) || Number(price) < 0)) {
      return NextResponse.json({ error: 'Price must be a valid non-negative number' }, { status: 400 })
    }

    if (quantity !== undefined && (isNaN(Number(quantity)) || Number(quantity) < 1)) {
      return NextResponse.json({ error: 'Quantity must be at least 1' }, { status: 400 })
    }

    const updatedTxData = await adminDb.runTransaction(async (t) => {
      // Re-read transaction inside the atomic transaction to prevent concurrent race conditions
      const latestTxSnap = await t.get(txRef)
      if (!latestTxSnap.exists) {
        throw new Error('Transaction not found')
      }

      const latestTx = latestTxSnap.data() as Transaction

      if (latestTx.isReversed || latestTx.reversalOf || latestTx.type === 'reversal') {
        throw new Error('Cannot modify a reversed transaction or reversal entry')
      }

      if (latestTx.orderId) {
        const orderNo = latestTx.orderNo || latestTx.invoiceNo
        throw new Error(`This line belongs to bill ${orderNo || latestTx.orderId}; reverse the whole bill`)
      }

      if (!isSuperAdmin && userAssignedLoc && latestTx.locationId && latestTx.locationId !== userAssignedLoc) {
        throw new Error(
          `Access Denied: You are assigned to ${caller.callerData.assignedLocationName || 'another store'} and cannot edit transactions for a different location.`
        )
      }

      const lockRef = getZeroBalanceLockRef()
      const lockSnap = await t.get(lockRef)
      assertNotZeroBalanceLocked(lockSnap)

      const oldQty = Number(latestTx.quantity || 1)
      const newQty = quantity !== undefined ? Number(quantity) : oldQty
      const oldLoc = latestTx.locationId
      const newLoc = locationId ? String(locationId).trim() : oldLoc

      // Adjust product stock and idol pieces if product is linked and quantity or location changed
      if (latestTx.productId) {
        const prodRef = adminDb.collection('products').doc(latestTx.productId)
        const prodSnap = await t.get(prodRef)
        if (prodSnap.exists) {
          const prodData = prodSnap.data() as Product
          const isIdol = prodData.category === 'Idols' || (prodData as unknown as Record<string, unknown>).isIdol === true
          const ledgerState = normalizeProductLedgerState(prodData)

          let currentStock = Number(prodData.stock || 0)
          const stockByLoc = { ...((prodData.stockByLocation as Record<string, number>) || {}) }

          // Idol pieces maps
          const updatedPiecesMg = [...ledgerState.piecesMg]
          const updatedPiecesByLocMg: Record<string, number[]> = {}
          Object.entries(ledgerState.piecesByLocMg).forEach(([loc, list]) => {
            updatedPiecesByLocMg[loc] = [...list]
          })

          // Extract transaction pieces in mg
          let txPiecesMg: number[] = []
          if (Array.isArray(latestTx.pieceWeights) && latestTx.pieceWeights.length > 0) {
            txPiecesMg = latestTx.pieceWeights.map(Number).filter((w) => !isNaN(w) && w > 0).map(gramsToMg)
          } else if (latestTx.pieceWeight !== undefined && !isNaN(Number(latestTx.pieceWeight))) {
            txPiecesMg = [gramsToMg(Number(latestTx.pieceWeight))]
          }
          const unitMg = prodData.weightMg !== undefined
            ? Number(prodData.weightMg)
            : gramsToMg(Number(prodData.weight || 0))
          while (txPiecesMg.length < oldQty) {
            txPiecesMg.push(unitMg > 0 ? unitMg : 0)
          }

          if (latestTx.type === 'sale') {
            if (oldLoc === newLoc) {
              const diff = newQty - oldQty
              const locStock = Number(stockByLoc[oldLoc] || 0)
              if (diff > 0 && locStock < diff) {
                throw new Error(
                  `Insufficient stock at ${latestTx.locationName || 'store'}. Available: ${locStock}, additional units needed: ${diff}`
                )
              }
              currentStock -= diff
              stockByLoc[oldLoc] = locStock - diff

              if (isIdol && diff !== 0) {
                const locPieces = updatedPiecesByLocMg[oldLoc] ? [...updatedPiecesByLocMg[oldLoc]] : []
                if (diff > 0) {
                  // Selling more: remove additional pieces from location
                  if (locPieces.length < diff) {
                    throw new Error(
                      `Insufficient idol piece stock at ${latestTx.locationName || 'store'}. Available: ${locPieces.length}, needed: ${diff}`
                    )
                  }
                  for (let i = 0; i < diff; i++) {
                    const removedMg = locPieces.shift()!
                    const allIdx = updatedPiecesMg.indexOf(removedMg)
                    if (allIdx !== -1) updatedPiecesMg.splice(allIdx, 1)
                  }
                } else {
                  // Reducing sale: restore pieces back to location
                  const restoreCount = Math.abs(diff)
                  const restored = txPiecesMg.slice(newQty, newQty + restoreCount)
                  locPieces.push(...restored)
                  updatedPiecesMg.push(...restored)
                }
                updatedPiecesByLocMg[oldLoc] = locPieces
              }
            } else {
              // Location changed
              // 1. Restore oldQty to old location
              stockByLoc[oldLoc] = Number(stockByLoc[oldLoc] || 0) + oldQty
              // 2. Deduct newQty from new location
              const newLocStock = Number(stockByLoc[newLoc] || 0)
              if (newLocStock < newQty) {
                throw new Error(
                  `Insufficient stock at destination location. Available: ${newLocStock}, needed: ${newQty}`
                )
              }
              stockByLoc[newLoc] = newLocStock - newQty
              currentStock -= (newQty - oldQty)

              if (isIdol) {
                // Restore sold pieces to old location
                const oldLocPieces = updatedPiecesByLocMg[oldLoc] ? [...updatedPiecesByLocMg[oldLoc]] : []
                const piecesToRestore = txPiecesMg.slice(0, oldQty)
                oldLocPieces.push(...piecesToRestore)
                updatedPiecesMg.push(...piecesToRestore)
                updatedPiecesByLocMg[oldLoc] = oldLocPieces

                // Deduct newQty pieces from new location
                const newLocPieces = updatedPiecesByLocMg[newLoc] ? [...updatedPiecesByLocMg[newLoc]] : []
                if (newLocPieces.length < newQty) {
                  throw new Error(
                    `Insufficient idol piece stock at destination location. Available: ${newLocPieces.length}, needed: ${newQty}`
                  )
                }
                for (let i = 0; i < newQty; i++) {
                  const removedMg = newLocPieces.shift()!
                  const allIdx = updatedPiecesMg.indexOf(removedMg)
                  if (allIdx !== -1) updatedPiecesMg.splice(allIdx, 1)
                }
                updatedPiecesByLocMg[newLoc] = newLocPieces
              }
            }
          } else if (latestTx.type === 'purchase') {
            if (oldLoc === newLoc) {
              const diff = newQty - oldQty
              const locStock = Number(stockByLoc[oldLoc] || 0)
              if (diff < 0 && locStock < Math.abs(diff)) {
                throw new Error(
                  `Cannot reduce purchase quantity by ${Math.abs(diff)}: current location stock is only ${locStock}`
                )
              }
              currentStock += diff
              stockByLoc[oldLoc] = locStock + diff

              if (isIdol && diff !== 0) {
                const locPieces = updatedPiecesByLocMg[oldLoc] ? [...updatedPiecesByLocMg[oldLoc]] : []
                if (diff < 0) {
                  // Reducing purchase: remove pieces from location
                  const reduceCount = Math.abs(diff)
                  for (let i = 0; i < reduceCount; i++) {
                    const removedMg = locPieces.pop() ?? unitMg
                    const allIdx = updatedPiecesMg.lastIndexOf(removedMg)
                    if (allIdx !== -1) updatedPiecesMg.splice(allIdx, 1)
                  }
                } else {
                  // Increasing purchase: add pieces to location
                  const addedPieces = Array.isArray(body.pieceWeights)
                    ? body.pieceWeights.slice(oldQty).map(gramsToMg)
                    : Array(diff).fill(unitMg)
                  locPieces.push(...addedPieces)
                  updatedPiecesMg.push(...addedPieces)
                }
                updatedPiecesByLocMg[oldLoc] = locPieces
              }
            } else {
              // Revert old purchase from old location
              const oldLocStock = Number(stockByLoc[oldLoc] || 0)
              if (oldLocStock < oldQty) {
                throw new Error(
                  `Cannot reassign location: ${latestTx.locationName || 'original store'} only has ${oldLocStock} units in stock`
                )
              }
              stockByLoc[oldLoc] = oldLocStock - oldQty
              // Add new purchase to new location
              stockByLoc[newLoc] = Number(stockByLoc[newLoc] || 0) + newQty
              currentStock += (newQty - oldQty)

              if (isIdol) {
                // Move pieces from oldLoc to newLoc
                const oldLocPieces = updatedPiecesByLocMg[oldLoc] ? [...updatedPiecesByLocMg[oldLoc]] : []
                const newLocPieces = updatedPiecesByLocMg[newLoc] ? [...updatedPiecesByLocMg[newLoc]] : []

                const movedPieces: number[] = []
                for (let i = 0; i < oldQty; i++) {
                  const targetPiece = txPiecesMg[i] ?? unitMg
                  const idx = oldLocPieces.indexOf(targetPiece)
                  if (idx !== -1) {
                    movedPieces.push(oldLocPieces.splice(idx, 1)[0])
                  } else if (oldLocPieces.length > 0) {
                    movedPieces.push(oldLocPieces.pop()!)
                  }
                }
                while (movedPieces.length < newQty) {
                  movedPieces.push(unitMg)
                }
                newLocPieces.push(...movedPieces.slice(0, newQty))

                updatedPiecesByLocMg[oldLoc] = oldLocPieces
                updatedPiecesByLocMg[newLoc] = newLocPieces
              }
            }
          }

          const prodUpdates: Record<string, unknown> = {
            stock: Math.max(0, currentStock),
            stockByLocation: stockByLoc,
            updatedAt: new Date().toISOString()
          }

          if (isIdol) {
            const updatedPiecesByLocGrams: Record<string, number[]> = {}
            Object.entries(updatedPiecesByLocMg).forEach(([lId, list]) => {
              updatedPiecesByLocGrams[lId] = list.map(mgToGrams)
            })
            const updatedPiecesGrams = updatedPiecesMg.map(mgToGrams)
            const avgMg = updatedPiecesMg.length > 0 ? Math.round(updatedPiecesMg.reduce((a, b) => a + b, 0) / updatedPiecesMg.length) : 0

            prodUpdates.pieceWeightsByLocation = updatedPiecesByLocGrams
            prodUpdates.pieceWeightsByLocationMg = updatedPiecesByLocMg
            prodUpdates.pieceWeights = updatedPiecesGrams
            prodUpdates.pieceWeightsMg = updatedPiecesMg
            prodUpdates.weight = mgToGrams(avgMg)
            prodUpdates.weightMg = avgMg
          }

          t.update(prodRef, prodUpdates)
        }
      }

      const finalPrice = price !== undefined ? Number(price) : latestTx.price
      const finalTotal = finalPrice !== undefined ? finalPrice * newQty : (latestTx.totalAmount || 0)
      const finalLocationName = locationName || (newLoc === oldLoc ? latestTx.locationName : newLoc)
      const finalNotes = notes !== undefined ? String(notes).trim() : (latestTx.notes || '')

      const updatePayload: Record<string, unknown> = {
        quantity: newQty,
        price: finalPrice,
        totalAmount: finalTotal,
        locationId: newLoc,
        locationName: finalLocationName,
        date: targetDate,
        notes: finalNotes,
        lastEditedBy: caller.callerEmail,
        lastEditedByName: caller.callerName,
        lastEditedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }

      if (customerName !== undefined) {
        updatePayload.customerName = String(customerName).trim()
      }
      if (vendorName !== undefined) {
        updatePayload.vendorName = String(vendorName).trim()
      }

      t.update(txRef, updatePayload)

      // Audit Log (Never hardcode "Super Admin")
      const auditRef = adminDb.collection('audit_logs').doc()
      t.set(auditRef, {
        userId: caller.callerUid,
        userName: caller.callerName,
        userEmail: caller.callerEmail,
        action: 'transaction_modified',
        entityType: 'transaction',
        entityId: id,
        entityName: `${latestTx.type.toUpperCase()}: ${latestTx.productName}`,
        description: `${caller.callerName} updated ${latestTx.type} transaction #${id}. Qty: ${oldQty} -> ${newQty}, Price: ₹${latestTx.price || 0} -> ₹${finalPrice || 0}, Location: ${latestTx.locationName} -> ${finalLocationName}, Date: ${latestTx.date} -> ${targetDate}`,
        metadata: {
          transactionId: id,
          type: latestTx.type,
          previous: {
            quantity: oldQty,
            price: latestTx.price,
            locationId: oldLoc,
            locationName: latestTx.locationName,
            date: latestTx.date,
            customerName: latestTx.customerName,
            vendorName: latestTx.vendorName,
            notes: latestTx.notes
          },
          updated: {
            quantity: newQty,
            price: finalPrice,
            locationId: newLoc,
            locationName: finalLocationName,
            date: targetDate,
            customerName: updatePayload.customerName,
            vendorName: updatePayload.vendorName,
            notes: finalNotes
          }
        },
        timestamp: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      })

      return {
        ...latestTx,
        ...updatePayload,
        id,
        quantity: newQty,
        price: finalPrice,
        totalAmount: finalTotal,
        locationId: newLoc,
        locationName: finalLocationName,
        date: targetDate,
        notes: finalNotes
      }
    })

    return NextResponse.json({ success: true, transaction: updatedTxData })
  } catch (err: unknown) {
    console.error('PATCH /api/admin/transactions error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to update transaction'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
