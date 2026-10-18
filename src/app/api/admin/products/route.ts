import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { ProductCategory, MetalType } from '@/lib/types'
import { gramsToMg, mgToGrams, calculateAverageWeight } from '@/lib/utils/weight'
import { getTodayIST } from '@/lib/utils/date'

const ALLOWED_PURITIES_BY_METAL: Record<MetalType, string[]> = {
  Gold: ['999.9', '999', '995', '916', '750'],
  Silver: ['999.9', '999', '925']
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (!hasModulePermission(caller, 'products', 'add')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to add products' }, { status: 403 })
    }

    const body = await req.json()
    const {
      name,
      category,
      brand,
      metal,
      sku,
      weight,
      purity,
      initialStock = 0,
      initialLocationId,
      initialLocationName
    } = body

    if (!name || !category || !metal || !sku || !purity) {
      return NextResponse.json({ error: 'Missing mandatory product fields' }, { status: 400 })
    }

    // Separate brand from category
    // Bullions will have two brands: MMTC PAMP and Local
    let cleanCategory: ProductCategory = category as ProductCategory
    let cleanBrand = brand ? String(brand).trim() : ''

    if ((cleanCategory as string) === 'MMTC PAMP') {
      cleanCategory = 'Bullions'
      cleanBrand = 'MMTC PAMP'
    } else if (cleanCategory === 'Bullions') {
      if (!cleanBrand || (cleanBrand !== 'MMTC PAMP' && cleanBrand !== 'Local')) {
        cleanBrand = cleanBrand || 'Local'
      }
    } else if (cleanCategory === 'Idols') {
      cleanBrand = cleanBrand || 'Local'
    }

    const cleanMetal = metal as MetalType
    const cleanPurity = String(purity).trim()

    // Tie purity to metal
    const validPurities = ALLOWED_PURITIES_BY_METAL[cleanMetal] || ['999.9']
    if (!validPurities.includes(cleanPurity)) {
      return NextResponse.json({
        error: `Invalid purity "${cleanPurity}" for ${cleanMetal}. Allowed purities for ${cleanMetal}: ${validPurities.join(', ')}`
      }, { status: 400 })
    }

    // Enforce unique SKUs (case-insensitive across active products)
    const cleanSku = String(sku).trim().toUpperCase()
    if (!cleanSku) {
      return NextResponse.json({ error: 'SKU is required' }, { status: 400 })
    }
    const existingSkuSnap = await adminDb.collection('products')
      .where('sku', '==', cleanSku)
      .get()

    const activeDup = existingSkuSnap.docs.find((d) => !d.data().isArchived)
    if (activeDup) {
      return NextResponse.json({
        error: `A product with SKU "${cleanSku}" already exists (${activeDup.data().name || 'existing product'}). SKUs must be unique.`
      }, { status: 400 })
    }

    const isIdol = cleanCategory === 'Idols'
    let numWeight = Number(weight)

    // Process Piece Weights Registry for Idols
    const rawPieces: unknown[] = Array.isArray(body.pieceWeights) ? body.pieceWeights : []
    const validPieceWeights: number[] = rawPieces.map(Number).filter((w) => !isNaN(w) && w > 0)
    const validPieceWeightsMg: number[] = validPieceWeights.map(gramsToMg)

    if (isIdol) {
      if (validPieceWeights.length > 0) {
        numWeight = calculateAverageWeight(validPieceWeights)
      } else if (isNaN(numWeight) || numWeight < 0) {
        numWeight = 0
      }
    } else {
      if (isNaN(numWeight) || numWeight <= 0) {
        return NextResponse.json({ error: 'Product weight is mandatory and must be greater than 0g' }, { status: 400 })
      }
    }

    const weightMg = gramsToMg(numWeight)
    numWeight = mgToGrams(weightMg)

    const stockByLocation: Record<string, number> = {}
    const pieceWeightsByLocation: Record<string, number[]> = {}
    const pieceWeightsByLocationMg: Record<string, number[]> = {}
    let totalStock = 0
    let initQty = Number(initialStock) || 0

    if (isIdol && validPieceWeights.length > 0) {
      initQty = validPieceWeights.length
    }

    if (initQty > 0 && initialLocationId) {
      stockByLocation[initialLocationId] = initQty
      totalStock = initQty
      if (isIdol && validPieceWeights.length > 0) {
        pieceWeightsByLocation[initialLocationId] = validPieceWeights.map(w => mgToGrams(gramsToMg(w)))
        pieceWeightsByLocationMg[initialLocationId] = validPieceWeightsMg
      }
    }

    const nowIso = new Date().toISOString()
    const cleanName = String(name).trim()

    // Create Product, initial transaction, and audit log atomically in a single batch
    const batch = adminDb.batch()
    const productDocRef = adminDb.collection('products').doc()
    const productDocData: Record<string, unknown> = {
      name: cleanName,
      category: cleanCategory,
      brand: cleanBrand,
      metal: cleanMetal,
      sku: cleanSku,
      stock: totalStock,
      stockByLocation,
      weight: numWeight,
      weightMg,
      purity: cleanPurity,
      isArchived: false,
      createdAt: nowIso,
      updatedAt: nowIso
    }

    if (isIdol && validPieceWeights.length > 0) {
      productDocData.pieceWeights = validPieceWeights.map(w => mgToGrams(gramsToMg(w)))
      productDocData.pieceWeightsMg = validPieceWeightsMg
      productDocData.pieceWeightsByLocation = pieceWeightsByLocation
      productDocData.pieceWeightsByLocationMg = pieceWeightsByLocationMg
    }

    batch.set(productDocRef, productDocData)

    // If opening stock was given, record the initial purchase transaction atomically
    if (initQty > 0 && initialLocationId && initialLocationName) {
      const txDocRef = adminDb.collection('transactions').doc()
      const txDocData: Record<string, unknown> = {
        type: 'purchase',
        productId: productDocRef.id,
        productName: cleanName,
        category: cleanCategory,
        brand: cleanBrand,
        metal: cleanMetal,
        quantity: initQty,
        price: 0,
        locationId: initialLocationId,
        locationName: initialLocationName,
        date: getTodayIST(),
        notes: isIdol && validPieceWeights.length > 0
          ? `Opening stock with ${validPieceWeights.length} idol pieces: ${validPieceWeights.join(', ')}g`
          : 'Initial opening stock',
        createdAt: nowIso,
        operatorId: caller.callerUid,
        operatorEmail: caller.callerData.email
      }
      if (isIdol && validPieceWeights.length > 0) {
        txDocData.pieceWeights = validPieceWeights
      }
      batch.set(txDocRef, txDocData)
    }

    // Append Audit Log atomically
    const auditDocRef = adminDb.collection('audit_logs').doc()
    batch.set(auditDocRef, {
      userId: caller.callerUid,
      userName: caller.callerData.displayName,
      userEmail: caller.callerData.email,
      action: 'create',
      entityType: 'product',
      entityId: productDocRef.id,
      entityName: cleanName,
      description: `Added product "${cleanName}" (${cleanMetal} · ${cleanCategory} · Brand: ${cleanBrand} · ${numWeight}g · SKU: ${cleanSku}) with ${totalStock} opening units`,
      timestamp: nowIso
    })

    await batch.commit()

    return NextResponse.json({ success: true, id: productDocRef.id })
  } catch (err: unknown) {
    console.error('POST /api/admin/products error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to add product'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (!hasModulePermission(caller, 'products', 'edit')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to edit product details' }, { status: 403 })
    }

    const body = await req.json()
    const { id, name, category, brand, metal, sku, weight, purity } = body

    if (!id) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    }

    const productDocRef = adminDb.collection('products').doc(id)
    const productSnap = await productDocRef.get()
    if (!productSnap.exists) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Separate brand from category
    let cleanCategory: ProductCategory = category as ProductCategory
    let cleanBrand = brand ? String(brand).trim() : ''

    if ((cleanCategory as string) === 'MMTC PAMP') {
      cleanCategory = 'Bullions'
      cleanBrand = 'MMTC PAMP'
    } else if (cleanCategory === 'Bullions') {
      if (!cleanBrand || (cleanBrand !== 'MMTC PAMP' && cleanBrand !== 'Local')) {
        cleanBrand = cleanBrand || 'Local'
      }
    } else if (cleanCategory === 'Idols') {
      cleanBrand = cleanBrand || 'Local'
    }

    const cleanMetal = metal as MetalType
    const cleanPurity = String(purity).trim()

    // Tie purity to metal
    const validPurities = ALLOWED_PURITIES_BY_METAL[cleanMetal] || ['999.9']
    if (!validPurities.includes(cleanPurity)) {
      return NextResponse.json({
        error: `Invalid purity "${cleanPurity}" for ${cleanMetal}. Allowed purities for ${cleanMetal}: ${validPurities.join(', ')}`
      }, { status: 400 })
    }

    // Enforce unique SKUs (check among all other active products)
    const cleanSku = String(sku).trim().toUpperCase()
    if (!cleanSku) {
      return NextResponse.json({ error: 'SKU is required' }, { status: 400 })
    }
    const existingSkuSnap = await adminDb.collection('products')
      .where('sku', '==', cleanSku)
      .get()

    const activeDup = existingSkuSnap.docs.find((d) => d.id !== id && !d.data().isArchived)
    if (activeDup) {
      return NextResponse.json({
        error: `A product with SKU "${cleanSku}" already exists (${activeDup.data().name || 'existing product'}). SKUs must be unique.`
      }, { status: 400 })
    }

    const isIdol = cleanCategory === 'Idols'
    let numWeight = Number(weight)

    const rawPieces: unknown[] = Array.isArray(body.pieceWeights) ? body.pieceWeights : []
    const validPieceWeights: number[] = rawPieces.map(Number).filter((w) => !isNaN(w) && w > 0)
    const validPieceWeightsMg: number[] = validPieceWeights.map(gramsToMg)

    if (isIdol) {
      if (validPieceWeights.length > 0) {
        numWeight = calculateAverageWeight(validPieceWeights)
      } else if (isNaN(numWeight) || numWeight < 0) {
        numWeight = 0
      }
    } else {
      if (isNaN(numWeight) || numWeight <= 0) {
        return NextResponse.json({ error: 'Product weight is mandatory and must be greater than 0g' }, { status: 400 })
      }
    }

    const weightMg = gramsToMg(numWeight)
    numWeight = mgToGrams(weightMg)

    const nowIso = new Date().toISOString()
    const cleanName = String(name).trim()

    // Note: Stock is strictly NOT modified by PUT /api/admin/products.
    // Stock can only be changed via verified transactions (/api/admin/transactions).
    const updatePayload: Record<string, unknown> = {
      name: cleanName,
      category: cleanCategory,
      brand: cleanBrand,
      metal: cleanMetal,
      sku: cleanSku,
      weight: numWeight,
      weightMg,
      purity: cleanPurity,
      updatedAt: nowIso
    }

    if (isIdol && validPieceWeights.length > 0) {
      updatePayload.pieceWeights = validPieceWeights.map(w => mgToGrams(gramsToMg(w)))
      updatePayload.pieceWeightsMg = validPieceWeightsMg
    }

    await productDocRef.update(updatePayload)

    // Append Audit Log
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerData.displayName,
      userEmail: caller.callerData.email,
      action: 'update',
      entityType: 'product',
      entityId: id,
      entityName: cleanName,
      description: `Updated product "${cleanName}" (${cleanSku} · Brand: ${cleanBrand} · ${numWeight}g · ${cleanPurity})`,
      timestamp: nowIso
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('PUT /api/admin/products error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to update product'
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

    if (!hasModulePermission(caller, 'products', 'delete')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to archive products' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    }

    const productDocRef = adminDb.collection('products').doc(id)
    const snap = await productDocRef.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const pData = snap.data()!
    const stock = Number(pData.stock || 0)
    const nowIso = new Date().toISOString()

    // Archive instead of delete: keeps stock ledger and historical transactions intact
    await productDocRef.update({
      isArchived: true,
      archivedAt: nowIso,
      archivedBy: caller.callerUid,
      archivedByEmail: caller.callerData.email
    })

    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerData.displayName,
      userEmail: caller.callerData.email,
      action: 'archive',
      entityType: 'product',
      entityId: id,
      entityName: pData.name || id,
      description: `Archived product "${pData.name || id}" (${pData.sku || ''}) with ${stock} unit(s) of stock`,
      timestamp: nowIso
    })

    return NextResponse.json({ success: true, archived: true })
  } catch (err: unknown) {
    console.error('DELETE /api/admin/products error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to archive product'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
