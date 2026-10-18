import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { Product, TransactionType, ProductCategory, MetalType } from '@/lib/types'

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

    const qty = Number(quantity || 0)
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
          if (isIdol && qty !== 1) {
            throw new Error('Idols are unique pieces and must be purchased 1 unit at a time.')
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
        category: category || productData.category,
        metal: metal || productData.metal || 'Gold',
        quantity: qty,
        locationId,
        locationName,
        date: date || nowIso.split('T')[0],
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
        const oldW = Number(previousWeight !== undefined ? previousWeight : productData.weight || 0)
        const newW = Number(newWeight)
        txPayload.previousWeight = oldW
        txPayload.newWeight = newW
        txPayload.weightChange = Number((newW - oldW).toFixed(2))
      }
      if (type === 'melt' && recoveredWeight !== undefined) {
        txPayload.recoveredWeight = Number(recoveredWeight)
      }

      t.set(txRef, txPayload)

      // Update Product document with verified new stock
      const productUpdates: Record<string, unknown> = {
        stock: newTotal,
        stockByLocation: currentLocMap,
        updatedAt: nowIso
      }
      if (type === 'repair' && newWeight) {
        productUpdates.weight = Number(newWeight)
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

    // Permission Gate for Deleting / Reversing Transactions
    if (txType === 'sale' && !hasModulePermission(caller, 'sales', 'delete')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to delete sales records' }, { status: 403 })
    }
    if (txType === 'purchase' && !hasModulePermission(caller, 'purchases', 'delete')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to delete purchase records' }, { status: 403 })
    }
    if (txType === 'return' && !hasModulePermission(caller, 'returns', 'delete')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to delete return records' }, { status: 403 })
    }
    if (['transfer', 'adjustment', 'repair', 'melt'].includes(txType) && !hasModulePermission(caller, 'movements', 'delete')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to delete stock movement records' }, { status: 403 })
    }

    // Atomic Reversal Transaction
    await adminDb.runTransaction(async (t) => {
      const productRef = adminDb.collection('products').doc(tx.productId)
      const productSnap = await t.get(productRef)

      if (productSnap.exists) {
        const productData = productSnap.data() as Product
        const currentTotal = Number(productData.stock || 0)
        const currentLocMap: Record<string, number> = { ...(productData.stockByLocation || {}) }
        const qty = Number(tx.quantity || 0)

        let newTotal = currentTotal

        switch (txType) {
          case 'purchase': {
            const locStock = Number(currentLocMap[tx.locationId] || 0)
            currentLocMap[tx.locationId] = Math.max(0, locStock - qty)
            newTotal = Math.max(0, currentTotal - qty)
            break
          }
          case 'sale': {
            const locStock = Number(currentLocMap[tx.locationId] || 0)
            currentLocMap[tx.locationId] = locStock + qty
            newTotal = currentTotal + qty
            break
          }
          case 'return': {
            const locStock = Number(currentLocMap[tx.locationId] || 0)
            currentLocMap[tx.locationId] = Math.max(0, locStock - qty)
            newTotal = Math.max(0, currentTotal - qty)
            break
          }
          case 'transfer': {
            if (tx.toLocationId) {
              const fromStock = Number(currentLocMap[tx.locationId] || 0)
              const toStock = Number(currentLocMap[tx.toLocationId] || 0)
              currentLocMap[tx.locationId] = fromStock + qty
              currentLocMap[tx.toLocationId] = Math.max(0, toStock - qty)
            }
            break
          }
          case 'adjustment': {
            const locStock = Number(currentLocMap[tx.locationId] || 0)
            currentLocMap[tx.locationId] = Math.max(0, locStock - qty)
            newTotal = Math.max(0, currentTotal - qty)
            break
          }
          case 'melt': {
            const locStock = Number(currentLocMap[tx.locationId] || 0)
            currentLocMap[tx.locationId] = locStock + qty
            newTotal = currentTotal + qty
            break
          }
          case 'repair': {
            if (tx.previousWeight !== undefined) {
              t.update(productRef, {
                weight: tx.previousWeight,
                updatedAt: new Date().toISOString()
              })
            }
            break
          }
        }

        if (txType !== 'repair') {
          t.update(productRef, {
            stock: newTotal,
            stockByLocation: currentLocMap,
            updatedAt: new Date().toISOString()
          })
        }
      }

      t.delete(txDocRef)

      // Audit Log for Reversal
      const auditRef = adminDb.collection('audit_logs').doc()
      t.set(auditRef, {
        userId: caller.callerUid,
        userName: caller.callerData.displayName,
        userEmail: caller.callerData.email,
        action: 'reverse',
        entityType: txType === 'purchase' ? 'purchase' : txType === 'sale' ? 'sale' : 'movement',
        entityId: txId,
        entityName: tx.productName,
        locationId: tx.locationId,
        locationName: tx.locationName,
        description: `Server-reversal: Deleted ${txType} record for "${tx.productName}" (${tx.quantity} unit(s))`,
        timestamp: new Date().toISOString()
      })
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('DELETE /api/admin/transactions error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to delete transaction'
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

    const snap = await adminDb.collection('transactions').get()
    const count = snap.size
    if (count > 0) {
      const batch = adminDb.batch()
      snap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }

    const nowIso = new Date().toISOString()
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerData.displayName,
      userEmail: caller.callerData.email,
      action: 'zero_balance',
      entityType: 'archive',
      entityId: 'master_zero_balance',
      entityName: 'All Transaction History',
      description: `Master Zero-Balance executed: purged ${count} transactions from database`,
      timestamp: nowIso
    })

    return NextResponse.json({ success: true, count })
  } catch (err: unknown) {
    console.error('PUT /api/admin/transactions error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to clear transactions'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
