import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { Product, Transaction, TransactionType } from '@/lib/types'
import { gramsToMg, mgToGrams } from '@/lib/utils/weight'
import { getTodayIST, getNextDayIST, getDefaultFiscalCutoffIST, isValidDateStringIST, validateFiscalCutoffDate } from '@/lib/utils/date'
import {
  isZeroBalanceLocked,
  acquireZeroBalanceLock,
  releaseZeroBalanceLock,
  getClosedFiscalCutoff,
  setClosedFiscalCutoff,
  getZeroBalanceLockRef,
  assertNotZeroBalanceLocked,
  SystemLockedError
} from '@/lib/server/system-lock'
import {
  applyRecordTransaction,
  applyReverseTransaction,
  calculateNetTransactionsEffect,
  calculateOpeningBalances
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
      // Check zero-balance lock inside the write transaction
      const lockRef = getZeroBalanceLockRef()
      const lockSnap = await t.get(lockRef)
      assertNotZeroBalanceLocked(lockSnap)

      const productRef = adminDb.collection('products').doc(tx.productId)
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
          ...tx,
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
        locationId: tx.locationId,
        locationName: tx.locationName,
        notes: ledgerResult.reversalTxData.notes
      }
      if (txType === 'transfer' && tx.toLocationId) {
        reversingPayload.locationId = tx.toLocationId
        reversingPayload.locationName = tx.toLocationName || 'Unknown'
        reversingPayload.toLocationId = tx.locationId
        reversingPayload.toLocationName = tx.locationName
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
        productId: tx.productId,
        productName: tx.productName,
        category: tx.category,
        metal: tx.metal || 'Gold',
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

export async function PUT(req: NextRequest) {
  // Purge / Clear Transaction History (Master Zero-Balance with Cutoff and Server-Side Lock)
  let callerInfo: { callerUid: string; callerName: string; callerEmail: string } | null = null
  let lockAcquired = false

  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult
    callerInfo = {
      callerUid: caller.callerUid,
      callerName: caller.callerName,
      callerEmail: caller.callerEmail
    }

    if (!hasModulePermission(caller, 'archive', 'zeroBalance')) {
      return NextResponse.json({ error: 'Forbidden: Super Admin or Master Zero-Balance authorization required' }, { status: 403 })
    }

    // 0. Require fresh sign-in / re-authentication on the server (auth_time within 5 minutes)
    const authTime = Number(caller.decodedToken.auth_time)
    const nowSeconds = Math.floor(Date.now() / 1000)
    const RECENT_LOGIN_MAX_AGE_SECONDS = 300 // 5 minutes
    if (!authTime || nowSeconds - authTime > RECENT_LOGIN_MAX_AGE_SECONDS) {
      return NextResponse.json(
        {
          error: 'Fresh authentication required: This irreversible action requires sign-in or re-authentication within the last 5 minutes. Please re-enter your password to proceed.',
          code: 'auth/requires-recent-login'
        },
        { status: 401 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const confirmationPhrase = typeof body.confirmationPhrase === 'string' ? body.confirmationPhrase.trim() : ''
    if (confirmationPhrase !== 'CONFIRM ZERO BALANCE') {
      return NextResponse.json(
        { error: 'Confirmation phrase mismatch. You must type "CONFIRM ZERO BALANCE" exactly to execute this irreversible operation.' },
        { status: 400 }
      )
    }

    const {
      buildMasterArchiveServer,
      saveArchiveServerSide,
      getSavedArchiveServer,
      updateArchiveProgress,
      findIncompleteArchiveForCutoff
    } = await import('@/lib/server/archive')

    // Check if an incomplete / interrupted archive run already exists for this cutoff date
    const rawRequestedCutoff = typeof body?.cutoffDate === 'string' ? body.cutoffDate.trim() : undefined
    const lastClosedCutoff = await getClosedFiscalCutoff()
    const incompleteArchive = rawRequestedCutoff ? await findIncompleteArchiveForCutoff(rawRequestedCutoff) : null

    let cutoffDate: string
    let openingDate: string

    if (incompleteArchive) {
      // Resuming an existing incomplete run
      cutoffDate = incompleteArchive.cutoffDate!
      openingDate = incompleteArchive.openingDate || getNextDayIST(cutoffDate)
    } else {
      // Fresh run: validate cutoff format, calendar boundary, and non-duplicate cutoff
      const cutoffValidation = validateFiscalCutoffDate(body?.cutoffDate, lastClosedCutoff)
      if (!cutoffValidation.isValid) {
        return NextResponse.json({ error: cutoffValidation.error }, { status: 400 })
      }
      cutoffDate = cutoffValidation.cutoffDate!
      openingDate = getNextDayIST(cutoffDate)
    }

    // 1. Take a server-side lock to block overlapping runs and pause new operational entries
    try {
      await acquireZeroBalanceLock(callerInfo)
      lockAcquired = true
    } catch (lockErr: unknown) {
      const msg = lockErr instanceof Error ? lockErr.message : 'Master Zero-Balance is currently locked'
      return NextResponse.json({ error: msg }, { status: 423 })
    }

    let archivePayload: Record<string, unknown>
    let archiveId: string
    let checksum: string
    let verifiedTxCount: number
    let verifiedAuditCount: number
    let currentStage = 'archive_saved'
    let progress: { purgedTransactions?: number; openingsPosted?: boolean; openingTransactionCount?: number; scrubbedAuditLogs?: number } = {}

    if (incompleteArchive) {
      // Resuming from interrupted archive record. getSavedArchiveServer re-verifies checksum on read.
      const saved = await getSavedArchiveServer(incompleteArchive.archiveId)
      archivePayload = saved as unknown as Record<string, unknown>
      archiveId = incompleteArchive.archiveId
      checksum = incompleteArchive.checksum
      verifiedTxCount = incompleteArchive.count
      verifiedAuditCount = incompleteArchive.auditCount
      currentStage = incompleteArchive.stage || 'archive_saved'
      progress = incompleteArchive.progress || {}
    } else {
      const { expectedTransactionCount, expectedAuditCount } = body || {}

      // 2. Build master archive on the server from every record up to cutoff date and compute SHA-256 checksum
      const archiveResult = await buildMasterArchiveServer({ cutoffDate })
      verifiedTxCount = archiveResult.count
      verifiedAuditCount = archiveResult.auditCount

      // 3. Count safety checks - verify client expectations against live database
      if (typeof expectedTransactionCount === 'number' && verifiedTxCount !== expectedTransactionCount) {
        return NextResponse.json(
          {
            error: `Transaction count mismatch: archive was built with ${expectedTransactionCount} transaction(s) up to ${cutoffDate}, but database currently contains ${verifiedTxCount}. Zero-balance aborted to prevent unarchived data loss.`
          },
          { status: 409 }
        )
      }

      if (typeof expectedAuditCount === 'number' && verifiedAuditCount !== expectedAuditCount) {
        return NextResponse.json(
          {
            error: `Audit log count mismatch: archive was built with ${expectedAuditCount} audit log(s) up to ${cutoffDate}, but database currently contains ${verifiedAuditCount}. Zero-balance aborted to prevent unarchived data loss.`
          },
          { status: 409 }
        )
      }

      // 4. Save archive server-side in system_archives with count, checksum, and initial progress state
      const savedArchive = await saveArchiveServerSide(archiveResult, callerInfo)
      archivePayload = archiveResult.archive as unknown as Record<string, unknown>
      archiveId = savedArchive.archiveId
      checksum = savedArchive.checksum
      currentStage = 'archive_saved'
      progress = savedArchive.progress || {}
    }

    // 5. SET THE CLOSED-PERIOD LOCK IMMEDIATELY UPON ARCHIVE SEALING
    // Setting this lock now guarantees no new entries on or before cutoffDate can ever be posted,
    // even if the subsequent purge or opening post is interrupted or fails partway.
    await setClosedFiscalCutoff(cutoffDate, openingDate, callerInfo)

    // 6. Delete exactly what was archived using the archived IDs
    const archivedTxIds = (Array.isArray(archivePayload.transactions) ? archivePayload.transactions : [])
      .map((t: Record<string, unknown>) => String(t.id || ''))
      .filter(Boolean)
    const count = archivedTxIds.length

    const archivedAuditIds = (Array.isArray(archivePayload.auditLogs) ? archivePayload.auditLogs : [])
      .map((l: Record<string, unknown>) => String(l.id || ''))
      .filter(Boolean)
    const auditCount = archivedAuditIds.length

    // Stage 1: Purge historical transaction records by archived IDs in chunks of 400
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

    // Stage 2: Post consolidated opening balance records dated openingDate (e.g. 1 April)
    // Opening = today’s stock minus the net effect of entries dated after the cutoff, per location.
    // Assigns dedicated 'opening' transaction type, real location name, total weights, and idol piece lists.
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

    // Stage 3: Scrub audit trail by archived IDs in chunks of 400
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

    // Stage 4: Record clean baseline audit entry & mark archive completed
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
        resumed: Boolean(incompleteArchive)
      },
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    })

    await updateArchiveProgress(archiveId, {
      stage: 'completed',
      status: 'completed'
    })

    return NextResponse.json({
      success: true,
      resumed: Boolean(incompleteArchive),
      archiveId,
      checksum,
      count: verifiedTxCount,
      auditCount: verifiedAuditCount,
      cutoffDate,
      openingDate
    })
  } catch (err: unknown) {
    console.error('PUT /api/admin/transactions error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to clear transactions'
    return NextResponse.json({ error: msg }, { status: 500 })
  } finally {
    if (lockAcquired) {
      await releaseZeroBalanceLock()
    }
  }
}
