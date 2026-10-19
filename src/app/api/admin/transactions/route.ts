import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { Product, Transaction, TransactionType } from '@/lib/types'
import { gramsToMg, mgToGrams } from '@/lib/utils/weight'
import { getTodayIST, getNextDayIST, getDefaultFiscalCutoffIST } from '@/lib/utils/date'
import {
  isZeroBalanceLocked,
  acquireZeroBalanceLock,
  releaseZeroBalanceLock,
  getClosedFiscalCutoff,
  setClosedFiscalCutoff
} from '@/lib/server/system-lock'
import {
  applyRecordTransaction,
  applyReverseTransaction
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

    // 0b. Block entries dated on or before a closed fiscal cutoff
    const closedCutoff = await getClosedFiscalCutoff()
    if (closedCutoff && date && String(date) <= closedCutoff) {
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

    // 1. Take a server-side lock first to block overlapping runs and pause new entries
    try {
      await acquireZeroBalanceLock(callerInfo)
      lockAcquired = true
    } catch (lockErr: unknown) {
      const msg = lockErr instanceof Error ? lockErr.message : 'Master Zero-Balance is currently locked'
      return NextResponse.json({ error: msg }, { status: 423 })
    }

    const { expectedTransactionCount, expectedAuditCount } = body || {}
    const cutoffDate = (body.cutoffDate ? String(body.cutoffDate).trim() : undefined) || getDefaultFiscalCutoffIST()
    const openingDate = getNextDayIST(cutoffDate)

    // 2. Build master archive on the server from every record up to cutoff date and compute SHA-256 checksum
    const { buildMasterArchiveServer, saveArchiveServerSide } = await import('@/lib/server/archive')
    const archiveResult = await buildMasterArchiveServer({ cutoffDate })
    const { count: verifiedTxCount, auditCount: verifiedAuditCount } = archiveResult

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

    // 4. Save archive server-side in system_archives with count and checksum recorded
    // PURGE CANNOT PROCEED UNLESS SERVER-SIDE ARCHIVE IS SAFELY PERSISTED
    const savedArchive = await saveArchiveServerSide(archiveResult, callerInfo)

    // 5. Fetch current transaction and audit documents for deletion up to cutoff
    const txSnap = await adminDb.collection('transactions').where('date', '<=', cutoffDate).get()
    const count = txSnap.size

    const cutoffTimeThreshold = new Date(`${cutoffDate}T23:59:59.999+05:30`).getTime()
    const allAuditSnap = await adminDb.collection('audit_logs').get()
    const auditDocsToDelete = allAuditSnap.docs.filter((d) => {
      const data = d.data()
      const ts = data.timestamp || data.createdAt
      let ms = Infinity
      if (ts) {
        if (typeof ts === 'object' && '_seconds' in ts) ms = (ts as { _seconds: number })._seconds * 1000
        else if (typeof ts === 'object' && 'toDate' in ts) ms = (ts as { toDate: () => Date }).toDate().getTime()
        else ms = new Date(String(ts)).getTime()
      }
      return ms <= cutoffTimeThreshold
    })
    const auditCount = auditDocsToDelete.length

    // 6. Purge historical transaction records up to cutoff in chunks of 400
    if (count > 0) {
      const chunkSize = 400
      for (let i = 0; i < txSnap.docs.length; i += chunkSize) {
        const chunk = txSnap.docs.slice(i, i + chunkSize)
        const batch = adminDb.batch()
        chunk.forEach((d) => batch.delete(d.ref))
        await batch.commit()
      }
    }

    // 6. Post consolidated opening balance records dated openingDate (e.g. 1 April)
    // Marked with isOpeningBalance: true so they cannot be reversed
    const prodsSnap = await adminDb.collection('products').get()
    if (!prodsSnap.empty) {
      const rolloverDocs: { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }[] = []
      prodsSnap.docs.forEach((pDoc) => {
        const pData = pDoc.data()
        const pStock = Number(pData.stock || 0)
        const pLocMap: Record<string, number> = pData.stockByLocation || {}
        if (pStock > 0) {
          Object.entries(pLocMap).forEach(([locId, locStock]) => {
            const numStock = Number(locStock || 0)
            if (numStock > 0) {
              const newTxRef = adminDb.collection('transactions').doc()
              rolloverDocs.push({
                ref: newTxRef,
                data: {
                  type: 'adjustment',
                  productId: pDoc.id,
                  productName: pData.name,
                  category: pData.category,
                  metal: pData.metal || 'Gold',
                  quantity: numStock,
                  locationId: locId,
                  locationName: 'Rollover Opening Balance',
                  date: openingDate,
                  notes: `Rollover opening balance as of ${openingDate} following cutoff ${cutoffDate}`,
                  isOpeningBalance: true,
                  isOpeningEntry: true,
                  createdAt: FieldValue.serverTimestamp(),
                  timestamp: FieldValue.serverTimestamp(),
                  operatorId: caller.callerUid,
                  operatorName: caller.callerName,
                  operatorEmail: caller.callerEmail
                }
              })
            }
          })
        }
      })

      if (rolloverDocs.length > 0) {
        const chunkSize = 400
        for (let i = 0; i < rolloverDocs.length; i += chunkSize) {
          const chunk = rolloverDocs.slice(i, i + chunkSize)
          const batch = adminDb.batch()
          chunk.forEach((item) => batch.set(item.ref, item.data))
          await batch.commit()
        }
      }
    }

    // 7. Scrub audit trail up to cutoff
    if (auditCount > 0) {
      const chunkSize = 400
      for (let i = 0; i < auditDocsToDelete.length; i += chunkSize) {
        const chunk = auditDocsToDelete.slice(i, i + chunkSize)
        const batch = adminDb.batch()
        chunk.forEach((d) => batch.delete(d.ref))
        await batch.commit()
      }
    }

    // 8. Record single clean post-reset audit log entry for the new baseline with server timestamp
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: 'zero_balance',
      entityType: 'archive',
      entityId: 'master_zero_balance',
      entityName: 'System Reset',
      description: `Master Zero-Balance executed up to cutoff ${cutoffDate}: verified and purged ${count} transaction(s) and scrubbed ${auditCount} audit log(s). Opening balances established on ${openingDate}. All future entries on or before ${cutoffDate} blocked.`,
      metadata: {
        cutoffDate,
        openingDate,
        purgedTransactions: count,
        scrubbedAuditLogs: auditCount
      },
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    })

    // 9. Permanently store the closed fiscal cutoff date so past entries are blocked
    await setClosedFiscalCutoff(cutoffDate, openingDate, callerInfo)

    return NextResponse.json({
      success: true,
      archiveId: savedArchive.archiveId,
      checksum: savedArchive.checksum,
      count: verifiedTxCount,
      auditCount: verifiedAuditCount,
      cutoffDate,
      openingDate,
      archive: archiveResult.archive
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
