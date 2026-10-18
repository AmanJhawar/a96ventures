import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { Product, TransactionType, ProductCategory, MetalType } from '@/lib/types'
import { gramsToMg, mgToGrams } from '@/lib/utils/weight'
import { getTodayIST } from '@/lib/utils/date'

export async function POST(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

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
    const isSuperAdmin = caller.callerData.role === 'super_admin' || (caller.callerData.role as string) === 'admin' || !caller.callerData.role
    const userAssignedLoc = caller.callerData.assignedLocationId
    if (!isSuperAdmin && userAssignedLoc) {
      if (type === 'sale' || type === 'return') {
        if (locationId !== userAssignedLoc) {
          return NextResponse.json({
            error: `Access Denied: You are assigned to ${caller.callerData.assignedLocationName || 'another store'} and cannot record ${type}s at a different location.`
          }, { status: 403 })
        }
      } else if (type === 'transfer' || type === 'melt' || type === 'adjustment') {
        if (locationId !== userAssignedLoc) {
          return NextResponse.json({
            error: `Access Denied: You can only record ${type} movements at your assigned store (${caller.callerData.assignedLocationName || userAssignedLoc}).`
          }, { status: 403 })
        }
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
      const currentTotal = Number(productData.stock || 0)
      const currentLocMap: Record<string, number> = { ...(productData.stockByLocation || {}) }
      const sourceLocStock = Number(currentLocMap[locationId] || 0)

      let newTotal = currentTotal

      switch (type) {
        case 'purchase': {
          const isIdol = productData.category === 'Idols'
          // For Idols with pieceWeights, allow purchasing multiple pieces at once
          const rawPieces: unknown[] = Array.isArray(body.pieceWeights) ? body.pieceWeights : []
          const validPieces: number[] = rawPieces.map(Number).filter((w) => !isNaN(w) && w > 0)

          if (isIdol && validPieces.length > 0) {
            // Qty matches count of pieces
            qty = validPieces.length
          }

          if (qty <= 0) throw new Error('Purchase quantity must be greater than 0')
          currentLocMap[locationId] = sourceLocStock + qty
          newTotal = currentTotal + qty
          break
        }

        case 'sale': {
          if (qty <= 0) throw new Error('Sale quantity must be greater than 0')
          if (sourceLocStock < qty) {
            throw new Error(`Insufficient stock at ${locationName}. Available: ${sourceLocStock}, requested: ${qty}`)
          }
          currentLocMap[locationId] = sourceLocStock - qty
          newTotal = currentTotal - qty
          break
        }

        case 'return': {
          if (qty <= 0) throw new Error('Return quantity must be greater than 0')
          currentLocMap[locationId] = sourceLocStock + qty
          newTotal = currentTotal + qty
          break
        }

        case 'transfer': {
          if (qty <= 0) throw new Error('Transfer quantity must be greater than 0')
          if (!toLocationId || toLocationId === locationId) {
            throw new Error('Please select a distinct destination location')
          }
          if (sourceLocStock < qty) {
            throw new Error(`Insufficient stock at ${locationName}. Available: ${sourceLocStock}, requested: ${qty}`)
          }
          const destLocStock = Number(currentLocMap[toLocationId] || 0)
          currentLocMap[locationId] = sourceLocStock - qty
          currentLocMap[toLocationId] = destLocStock + qty
          break
        }

        case 'adjustment': {
          if (qty === 0) throw new Error('Quantity adjustment cannot be 0')
          if (sourceLocStock + qty < 0) {
            throw new Error(`Stock at ${locationName} cannot be less than 0. Available: ${sourceLocStock}, adjustment: ${qty}`)
          }
          currentLocMap[locationId] = sourceLocStock + qty
          newTotal = currentTotal + qty
          break
        }

        case 'melt': {
          if (qty <= 0) throw new Error('Melt quantity must be greater than 0')
          if (sourceLocStock < qty) {
            throw new Error(`Insufficient stock at ${locationName}. Available: ${sourceLocStock}, requested: ${qty}`)
          }
          currentLocMap[locationId] = sourceLocStock - qty
          newTotal = currentTotal - qty
          break
        }

        case 'repair': {
          if (newWeight === undefined || newWeight === null || isNaN(Number(newWeight)) || Number(newWeight) <= 0) {
            throw new Error('Please enter a valid new weight for the repaired item')
          }
          break
        }
      }

      // Write Transaction document
      const txRef = adminDb.collection('transactions').doc()
      const nowIso = new Date().toISOString()
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
        createdAt: nowIso,
        operatorId: caller.callerUid,
        operatorEmail: caller.callerData.email
      }

      if (price !== undefined && !isNaN(Number(price))) {
        txPayload.price = Number(price)
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

      // Handle Idol Piece Weights Registry Updates (Stored in Whole Milligrams)
      const isIdol = productData.category === 'Idols'
      let updatedPiecesMg: number[] = Array.isArray(productData.pieceWeightsMg)
        ? [...productData.pieceWeightsMg]
        : Array.isArray(productData.pieceWeights)
          ? productData.pieceWeights.map(gramsToMg)
          : []

      const updatedPiecesByLocMg: Record<string, number[]> = {}
      if (productData.pieceWeightsByLocationMg) {
        Object.entries(productData.pieceWeightsByLocationMg).forEach(([loc, list]) => {
          if (Array.isArray(list)) updatedPiecesByLocMg[loc] = [...list]
        })
      } else if (productData.pieceWeightsByLocation) {
        Object.entries(productData.pieceWeightsByLocation).forEach(([loc, list]) => {
          if (Array.isArray(list)) updatedPiecesByLocMg[loc] = list.map(gramsToMg)
        })
      }

      const sourceLocPiecesMg = updatedPiecesByLocMg[locationId] || []

      if (isIdol) {
        if (type === 'purchase') {
          const rawPieces: unknown[] = Array.isArray(body.pieceWeights) ? body.pieceWeights : []
          const validPiecesMg: number[] = rawPieces.map(Number).filter((w) => !isNaN(w) && w > 0).map(gramsToMg)
          if (validPiecesMg.length > 0) {
            updatedPiecesByLocMg[locationId] = [...sourceLocPiecesMg, ...validPiecesMg]
            updatedPiecesMg = [...updatedPiecesMg, ...validPiecesMg]
            txPayload.pieceWeights = validPiecesMg.map(mgToGrams)
            txPayload.pieceWeightsMg = validPiecesMg
          }
        } else if (type === 'sale') {
          const selW = body.pieceWeight !== undefined && !isNaN(Number(body.pieceWeight)) ? Number(body.pieceWeight) : undefined
          if (selW !== undefined) {
            const selWMg = gramsToMg(selW)
            txPayload.pieceWeight = mgToGrams(selWMg)
            txPayload.pieceWeightMg = selWMg
            const idx = sourceLocPiecesMg.indexOf(selWMg)
            if (idx !== -1) {
              sourceLocPiecesMg.splice(idx, 1)
              updatedPiecesByLocMg[locationId] = sourceLocPiecesMg
            }
            const allIdx = updatedPiecesMg.indexOf(selWMg)
            if (allIdx !== -1) updatedPiecesMg.splice(allIdx, 1)
          }
        } else if (type === 'transfer' && toLocationId) {
          const destLocPiecesMg = updatedPiecesByLocMg[toLocationId] || []
          const selW = body.pieceWeight !== undefined && !isNaN(Number(body.pieceWeight)) ? Number(body.pieceWeight) : undefined
          if (selW !== undefined) {
            const selWMg = gramsToMg(selW)
            txPayload.pieceWeight = mgToGrams(selWMg)
            txPayload.pieceWeightMg = selWMg
            const idx = sourceLocPiecesMg.indexOf(selWMg)
            if (idx !== -1) {
              sourceLocPiecesMg.splice(idx, 1)
              updatedPiecesByLocMg[locationId] = sourceLocPiecesMg
              updatedPiecesByLocMg[toLocationId] = [...destLocPiecesMg, selWMg]
            }
          }
        } else if (type === 'melt') {
          const selW = body.pieceWeight !== undefined && !isNaN(Number(body.pieceWeight)) ? Number(body.pieceWeight) : undefined
          if (selW !== undefined) {
            const selWMg = gramsToMg(selW)
            txPayload.pieceWeight = mgToGrams(selWMg)
            txPayload.pieceWeightMg = selWMg
            const idx = sourceLocPiecesMg.indexOf(selWMg)
            if (idx !== -1) {
              sourceLocPiecesMg.splice(idx, 1)
              updatedPiecesByLocMg[locationId] = sourceLocPiecesMg
            }
            const allIdx = updatedPiecesMg.indexOf(selWMg)
            if (allIdx !== -1) updatedPiecesMg.splice(allIdx, 1)
          }
        } else if (type === 'return') {
          const selW = body.pieceWeight !== undefined && !isNaN(Number(body.pieceWeight)) ? Number(body.pieceWeight) : undefined
          if (selW !== undefined) {
            const selWMg = gramsToMg(selW)
            txPayload.pieceWeight = mgToGrams(selWMg)
            txPayload.pieceWeightMg = selWMg
            updatedPiecesByLocMg[locationId] = [...sourceLocPiecesMg, selWMg]
            updatedPiecesMg = [...updatedPiecesMg, selWMg]
          }
        }
      }

      t.set(txRef, txPayload)

      // Update Product document with verified new stock and piece weights in milligrams
      const productUpdates: Record<string, unknown> = {
        stock: newTotal,
        stockByLocation: currentLocMap,
        updatedAt: nowIso
      }
      if (type === 'repair' && newWeight) {
        const nWMg = gramsToMg(newWeight)
        productUpdates.weight = mgToGrams(nWMg)
        productUpdates.weightMg = nWMg
      } else if (isIdol) {
        const updatedPiecesGrams = updatedPiecesMg.map(mgToGrams)
        const updatedPiecesByLocGrams: Record<string, number[]> = {}
        Object.entries(updatedPiecesByLocMg).forEach(([lId, list]) => {
          updatedPiecesByLocGrams[lId] = list.map(mgToGrams)
        })
        productUpdates.pieceWeights = updatedPiecesGrams
        productUpdates.pieceWeightsMg = updatedPiecesMg
        productUpdates.pieceWeightsByLocation = updatedPiecesByLocGrams
        productUpdates.pieceWeightsByLocationMg = updatedPiecesByLocMg
        if (updatedPiecesMg.length > 0) {
          const avgMg = Math.round(updatedPiecesMg.reduce((a, b) => a + b, 0) / updatedPiecesMg.length)
          productUpdates.weight = mgToGrams(avgMg)
          productUpdates.weightMg = avgMg
        } else {
          productUpdates.weight = 0
          productUpdates.weightMg = 0
        }
      }

      t.update(productRef, productUpdates)

      // Append immutable audit log
      const auditRef = adminDb.collection('audit_logs').doc()
      t.set(auditRef, {
        userId: caller.callerUid,
        userName: caller.callerData.displayName,
        userEmail: caller.callerData.email,
        action: type === 'transfer' ? 'transfer' : type === 'adjustment' ? 'adjustment' : type === 'repair' ? 'repair' : type === 'melt' ? 'melt' : 'create',
        entityType: type === 'purchase' ? 'purchase' : type === 'sale' ? 'sale' : 'movement',
        entityId: txRef.id,
        entityName: productName || productData.name,
        locationId,
        locationName,
        description: `Server-verified ${type}: ${qty} unit(s) of "${productName || productData.name}" at ${locationName}`,
        timestamp: nowIso
      })

      return txRef.id
    })

    return NextResponse.json({ success: true, id: transactionId })
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

    // Atomic Reversal via Reversing Entry (Never Delete)
    await adminDb.runTransaction(async (t) => {
      const productRef = adminDb.collection('products').doc(tx.productId)
      const productSnap = await t.get(productRef)

      const nowIso = new Date().toISOString()
      const todayDate = getTodayIST()

      let reversingPayload: Record<string, unknown> = {}
      let newTotal = 0
      let currentLocMap: Record<string, number> = {}
      let newWeight: number | undefined = undefined

      if (productSnap.exists) {
        const productData = productSnap.data() as Product
        const currentTotal = Number(productData.stock || 0)
        currentLocMap = { ...(productData.stockByLocation || {}) }
        const qty = Number(tx.quantity || 0)

        newTotal = currentTotal

        // Reversal calculations without clamping at zero to preserve mathematical accuracy
        switch (txType) {
          case 'purchase': {
            const locStock = Number(currentLocMap[tx.locationId] || 0)
            currentLocMap[tx.locationId] = locStock - qty
            newTotal = currentTotal - qty
            reversingPayload = {
              type: 'adjustment',
              quantity: -qty,
              locationId: tx.locationId,
              locationName: tx.locationName,
              notes: `Reversal of purchase #${txId}${tx.notes ? `: ${tx.notes}` : ''}`
            }
            break
          }
          case 'sale': {
            const locStock = Number(currentLocMap[tx.locationId] || 0)
            currentLocMap[tx.locationId] = locStock + qty
            newTotal = currentTotal + qty
            reversingPayload = {
              type: 'adjustment',
              quantity: qty,
              locationId: tx.locationId,
              locationName: tx.locationName,
              notes: `Reversal of sale #${txId}${tx.customerName ? ` (${tx.customerName})` : ''}`
            }
            break
          }
          case 'return': {
            const locStock = Number(currentLocMap[tx.locationId] || 0)
            currentLocMap[tx.locationId] = locStock - qty
            newTotal = currentTotal - qty
            reversingPayload = {
              type: 'adjustment',
              quantity: -qty,
              locationId: tx.locationId,
              locationName: tx.locationName,
              notes: `Reversal of return #${txId}`
            }
            break
          }
          case 'transfer': {
            if (tx.toLocationId) {
              const fromStock = Number(currentLocMap[tx.locationId] || 0)
              const toStock = Number(currentLocMap[tx.toLocationId] || 0)
              currentLocMap[tx.locationId] = fromStock + qty
              currentLocMap[tx.toLocationId] = toStock - qty
              reversingPayload = {
                type: 'transfer',
                quantity: qty,
                locationId: tx.toLocationId,
                locationName: tx.toLocationName || 'Unknown',
                toLocationId: tx.locationId,
                toLocationName: tx.locationName,
                notes: `Reversal of transfer #${txId}`
              }
            }
            break
          }
          case 'adjustment': {
            const locStock = Number(currentLocMap[tx.locationId] || 0)
            currentLocMap[tx.locationId] = locStock - qty
            newTotal = currentTotal - qty
            reversingPayload = {
              type: 'adjustment',
              quantity: -qty,
              locationId: tx.locationId,
              locationName: tx.locationName,
              notes: `Reversal of adjustment #${txId}`
            }
            break
          }
          case 'melt': {
            const locStock = Number(currentLocMap[tx.locationId] || 0)
            currentLocMap[tx.locationId] = locStock + qty
            newTotal = currentTotal + qty
            reversingPayload = {
              type: 'adjustment',
              quantity: qty,
              locationId: tx.locationId,
              locationName: tx.locationName,
              notes: `Reversal of melt #${txId}`
            }
            break
          }
          case 'repair': {
            // Reverse delta weight change using integer milligram precision
            const currentProdWMg = productData.weightMg !== undefined ? productData.weightMg : gramsToMg(productData.weight || 0)
            const weightDeltaMg = tx.weightChangeMg !== undefined ? tx.weightChangeMg : gramsToMg(tx.weightChange || 0)
            const newWMg = currentProdWMg - weightDeltaMg
            newWeight = mgToGrams(newWMg)
            reversingPayload = {
              type: 'repair',
              quantity: tx.quantity || 1,
              locationId: tx.locationId,
              locationName: tx.locationName,
              previousWeight: mgToGrams(currentProdWMg),
              previousWeightMg: currentProdWMg,
              newWeight: newWeight,
              newWeightMg: newWMg,
              weightChange: mgToGrams(-weightDeltaMg),
              weightChangeMg: -weightDeltaMg,
              notes: `Reversal of repair #${txId}${tx.notes ? `: ${tx.notes}` : ''}`
            }
            break
          }
        }

        const isIdol = productData.category === 'Idols'
        let updatedPiecesMg: number[] = Array.isArray(productData.pieceWeightsMg)
          ? [...productData.pieceWeightsMg]
          : Array.isArray(productData.pieceWeights)
            ? productData.pieceWeights.map(gramsToMg)
            : []

        const updatedPiecesByLocMg: Record<string, number[]> = {}
        if (productData.pieceWeightsByLocationMg) {
          Object.entries(productData.pieceWeightsByLocationMg).forEach(([loc, list]) => {
            if (Array.isArray(list)) updatedPiecesByLocMg[loc] = [...list]
          })
        } else if (productData.pieceWeightsByLocation) {
          Object.entries(productData.pieceWeightsByLocation).forEach(([loc, list]) => {
            if (Array.isArray(list)) updatedPiecesByLocMg[loc] = list.map(gramsToMg)
          })
        }
        const txLocPiecesMg = updatedPiecesByLocMg[tx.locationId] || []

        if (isIdol) {
          if (tx.pieceWeightMg !== undefined || tx.pieceWeight !== undefined) {
            const pWMg = tx.pieceWeightMg !== undefined ? Number(tx.pieceWeightMg) : gramsToMg(tx.pieceWeight)
            if (txType === 'sale' || txType === 'melt') {
              // Reversing sale or melt restores piece weight back to source location
              updatedPiecesByLocMg[tx.locationId] = [...txLocPiecesMg, pWMg]
              updatedPiecesMg = [...updatedPiecesMg, pWMg]
            } else if (txType === 'transfer' && tx.toLocationId) {
              // Reversing transfer moves piece weight from destination back to source
              const destPiecesMg = updatedPiecesByLocMg[tx.toLocationId] || []
              const idx = destPiecesMg.indexOf(pWMg)
              if (idx !== -1) {
                destPiecesMg.splice(idx, 1)
                updatedPiecesByLocMg[tx.toLocationId] = destPiecesMg
                updatedPiecesByLocMg[tx.locationId] = [...txLocPiecesMg, pWMg]
              }
            } else if (txType === 'return') {
              // Reversing return removes piece weight back from location and product
              const idx = txLocPiecesMg.indexOf(pWMg)
              if (idx !== -1) {
                txLocPiecesMg.splice(idx, 1)
                updatedPiecesByLocMg[tx.locationId] = txLocPiecesMg
              }
              const allIdx = updatedPiecesMg.indexOf(pWMg)
              if (allIdx !== -1) updatedPiecesMg.splice(allIdx, 1)
            }
          } else if ((tx.pieceWeightsMg && Array.isArray(tx.pieceWeightsMg)) || (tx.pieceWeights && Array.isArray(tx.pieceWeights))) {
            const piecesToReverseMg = Array.isArray(tx.pieceWeightsMg) ? tx.pieceWeightsMg : (tx.pieceWeights as (number | string)[]).map((w) => gramsToMg(w))
            if (txType === 'purchase') {
              // Reversing purchase removes those piece weights
              piecesToReverseMg.forEach((numWMg: number) => {
                const idx = txLocPiecesMg.indexOf(numWMg)
                if (idx !== -1) txLocPiecesMg.splice(idx, 1)
                const allIdx = updatedPiecesMg.indexOf(numWMg)
                if (allIdx !== -1) updatedPiecesMg.splice(allIdx, 1)
              })
              updatedPiecesByLocMg[tx.locationId] = txLocPiecesMg
            }
          }
        }

        const prodUpdates: Record<string, unknown> = {
          updatedAt: nowIso
        }

        if (txType === 'repair') {
          if (newWeight !== undefined) {
            const nWMg = gramsToMg(newWeight)
            prodUpdates.weight = mgToGrams(nWMg)
            prodUpdates.weightMg = nWMg
          }
        } else {
          prodUpdates.stock = newTotal
          prodUpdates.stockByLocation = currentLocMap
          if (isIdol) {
            const updatedPiecesGrams = updatedPiecesMg.map(mgToGrams)
            const updatedPiecesByLocGrams: Record<string, number[]> = {}
            Object.entries(updatedPiecesByLocMg).forEach(([lId, list]) => {
              updatedPiecesByLocGrams[lId] = list.map(mgToGrams)
            })
            prodUpdates.pieceWeights = updatedPiecesGrams
            prodUpdates.pieceWeightsMg = updatedPiecesMg
            prodUpdates.pieceWeightsByLocation = updatedPiecesByLocGrams
            prodUpdates.pieceWeightsByLocationMg = updatedPiecesByLocMg
            if (updatedPiecesMg.length > 0) {
              const avgMg = Math.round(updatedPiecesMg.reduce((a, b) => a + b, 0) / updatedPiecesMg.length)
              prodUpdates.weight = mgToGrams(avgMg)
              prodUpdates.weightMg = avgMg
            } else {
              prodUpdates.weight = 0
              prodUpdates.weightMg = 0
            }
          }
        }

        t.update(productRef, prodUpdates)
      }

      // 1. Mark original transaction as reversed (Never delete)
      const reversingTxRef = adminDb.collection('transactions').doc()
      t.update(txDocRef, {
        isReversed: true,
        reversedAt: nowIso,
        reversedBy: caller.callerUid,
        reversedByEmail: caller.callerData.email,
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
        createdAt: nowIso,
        operatorId: caller.callerUid,
        operatorEmail: caller.callerData.email,
        isReversal: true,
        reversalOf: txId
      }
      t.set(reversingTxRef, reversingEntryDoc)

      // 3. Record audit log for the reversal
      const auditRef = adminDb.collection('audit_logs').doc()
      t.set(auditRef, {
        userId: caller.callerUid,
        userName: caller.callerData.displayName || caller.callerData.email || 'Admin',
        userEmail: caller.callerData.email,
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
        timestamp: nowIso
      })
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('DELETE /api/admin/transactions error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to reverse transaction'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function PUT(req: NextRequest) {
  // Purge / Clear Transaction History (Master Zero-Balance)
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (!hasModulePermission(caller, 'archive', 'zeroBalance')) {
      return NextResponse.json({ error: 'Forbidden: Super Admin or Master Zero-Balance authorization required' }, { status: 403 })
    }

    const nowIso = new Date().toISOString()

    // 1. Purge all historical transaction records in chunks of 400
    const txSnap = await adminDb.collection('transactions').get()
    const count = txSnap.size
    if (count > 0) {
      const chunkSize = 400
      for (let i = 0; i < txSnap.docs.length; i += chunkSize) {
        const chunk = txSnap.docs.slice(i, i + chunkSize)
        const batch = adminDb.batch()
        chunk.forEach((d) => batch.delete(d.ref))
        await batch.commit()
      }
    }

    // 2. Post consolidated opening balance records for any products with active stock
    // This preserves ledger integrity so derived stock continues to match without disruption
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
                  date: getTodayIST(),
                  notes: 'Rollover opening balance post Master Zero-Balance',
                  createdAt: nowIso,
                  operatorId: caller.callerUid,
                  operatorEmail: caller.callerData.email
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

    // 3. Scrub audit trail and activity log
    const auditSnap = await adminDb.collection('audit_logs').get()
    const auditCount = auditSnap.size
    if (auditCount > 0) {
      const chunkSize = 400
      for (let i = 0; i < auditSnap.docs.length; i += chunkSize) {
        const chunk = auditSnap.docs.slice(i, i + chunkSize)
        const batch = adminDb.batch()
        chunk.forEach((d) => batch.delete(d.ref))
        await batch.commit()
      }
    }

    // 4. Record single clean post-reset audit log entry for the new baseline
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerData.displayName || caller.callerData.email || 'Admin',
      userEmail: caller.callerData.email,
      action: 'zero_balance',
      entityType: 'archive',
      entityId: 'master_zero_balance',
      entityName: 'System Reset',
      description: `Master Zero-Balance executed: purged ${count} transaction(s) and scrubbed ${auditCount} audit log entry/entries. System ledger and activity log reset to a clean slate.`,
      timestamp: nowIso
    })

    return NextResponse.json({ success: true, count, auditCount })
  } catch (err: unknown) {
    console.error('PUT /api/admin/transactions error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to clear transactions'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
