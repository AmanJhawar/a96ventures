import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { ProductCategory, MetalType, Product } from '@/lib/types'
import { gramsToMg, mgToGrams, calculateAverageWeight } from '@/lib/utils/weight'
import { getTodayIST } from '@/lib/utils/date'
import {
  getZeroBalanceLockRef,
  assertNotZeroBalanceLocked,
  SystemLockedError
} from '@/lib/server/system-lock'

const ALLOWED_PURITIES_BY_METAL: Record<MetalType, string[]> = {
  Gold: ['999.9', '999', '995', '916', '750'],
  Silver: ['999.9', '999', '925']
}

/**
 * GET /api/admin/products
 * Fetches all inventory products.
 * Requires: products.view permission.
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (!hasModulePermission(caller, 'products', 'view')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to view products' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const includeArchived = searchParams.get('includeArchived') === 'true'

    const snap = await adminDb.collection('products').get()
    const items: Product[] = []

    snap.forEach((docSnap) => {
      const data = docSnap.data()
      if (!includeArchived && data.isArchived) return

      let normalizedCategory: ProductCategory = 'Bullions'
      let brand = data.brand ? String(data.brand).trim() : ''

      if (data.category === 'MMTC PAMP') {
        normalizedCategory = 'Bullions'
        if (!brand) brand = 'MMTC PAMP'
      } else if (data.category === 'Silver Idols' || data.category === 'Idols') {
        normalizedCategory = 'Idols'
        if (!brand) brand = 'Local'
      } else if (data.category === 'Bullions') {
        normalizedCategory = 'Bullions'
        if (!brand) brand = 'Local'
      }

      const finalStock = Number(data.stock || 0)
      const finalStockByLoc = (data.stockByLocation || {}) as Record<string, number>

      const wMg = data.weightMg !== undefined ? Number(data.weightMg) : Math.round(Number(data.weight || 0) * 1000)
      const pieceWs = Array.isArray(data.pieceWeightsMg)
        ? data.pieceWeightsMg.map((mg: number) => mg / 1000)
        : Array.isArray(data.pieceWeights)
          ? data.pieceWeights.map((w: number) => Math.round(Number(w) * 1000) / 1000)
          : undefined
      const pieceWsMg = Array.isArray(data.pieceWeightsMg)
        ? data.pieceWeightsMg
        : Array.isArray(data.pieceWeights)
          ? data.pieceWeights.map((w: number) => Math.round(Number(w) * 1000))
          : undefined

      items.push({
        id: docSnap.id,
        name: data.name || '',
        category: normalizedCategory,
        brand,
        metal: (data.metal || (normalizedCategory === 'Idols' ? 'Silver' : 'Gold')) as MetalType,
        sku: data.sku || '',
        stock: finalStock,
        stockByLocation: finalStockByLoc,
        weight: wMg / 1000,
        weightMg: wMg,
        pieceWeights: pieceWs,
        pieceWeightsMg: pieceWsMg,
        pieceWeightsByLocation: data.pieceWeightsByLocation || undefined,
        pieceWeightsByLocationMg: data.pieceWeightsByLocationMg || undefined,
        purity: data.purity || '',
        isArchived: Boolean(data.isArchived),
        archivedAt: data.archivedAt,
        archivedBy: data.archivedBy,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      })
    })

    items.sort((a, b) => {
      const timeA = typeof a.updatedAt === 'string' ? new Date(a.updatedAt).getTime() : 0
      const timeB = typeof b.updatedAt === 'string' ? new Date(b.updatedAt).getTime() : 0
      if (timeB !== timeA) return timeB - timeA
      return String(a.name || '').localeCompare(String(b.name || ''))
    })

    return NextResponse.json({ success: true, products: items })
  } catch (err: unknown) {
    console.error('GET /api/admin/products error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to fetch products'
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

    const isSuperAdmin = caller.isSuperAdmin
    const userAssignedLoc = caller.callerData.assignedLocationId
    if (!isSuperAdmin && userAssignedLoc && initialLocationId && initialLocationId !== userAssignedLoc) {
      return NextResponse.json({
        error: `Access Denied: You are assigned to ${caller.callerData.assignedLocationName || 'another store'} and cannot initialize stock at a different location.`
      }, { status: 403 })
    }

    if (initQty > 0 && initialLocationId) {
      stockByLocation[initialLocationId] = initQty
      totalStock = initQty
      if (isIdol && validPieceWeights.length > 0) {
        pieceWeightsByLocation[initialLocationId] = validPieceWeights.map(w => mgToGrams(gramsToMg(w)))
        pieceWeightsByLocationMg[initialLocationId] = validPieceWeightsMg
      }
    }
    const cleanName = String(name).trim()

    // Create Product, initial transaction, and audit log atomically in a single transaction
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
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }

    if (isIdol && validPieceWeights.length > 0) {
      productDocData.pieceWeights = validPieceWeights.map(w => mgToGrams(gramsToMg(w)))
      productDocData.pieceWeightsMg = validPieceWeightsMg
      productDocData.pieceWeightsByLocation = pieceWeightsByLocation
      productDocData.pieceWeightsByLocationMg = pieceWeightsByLocationMg
    }

    let initialTxDocData: Record<string, unknown> | null = null
    const txDocRef = adminDb.collection('transactions').doc()
    if (initQty > 0 && initialLocationId && initialLocationName) {
      initialTxDocData = {
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
        createdAt: FieldValue.serverTimestamp(),
        timestamp: FieldValue.serverTimestamp(),
        operatorId: caller.callerUid,
        operatorName: caller.callerName,
        operatorEmail: caller.callerEmail
      }
      if (isIdol && validPieceWeights.length > 0) {
        initialTxDocData.pieceWeights = validPieceWeights
      }
    }

    const auditDocRef = adminDb.collection('audit_logs').doc()
    const auditDocData = {
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: 'create',
      entityType: 'product',
      entityId: productDocRef.id,
      entityName: cleanName,
      description: `Added product "${cleanName}" (${cleanMetal} · ${cleanCategory} · Brand: ${cleanBrand} · ${numWeight}g · SKU: ${cleanSku}) with ${totalStock} opening units`,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    }

    await adminDb.runTransaction(async (t) => {
      // Check zero-balance lock inside the write transaction
      const lockRef = getZeroBalanceLockRef()
      const lockSnap = await t.get(lockRef)
      assertNotZeroBalanceLocked(lockSnap)

      t.set(productDocRef, productDocData)
      if (initialTxDocData) {
        t.set(txDocRef, initialTxDocData)
      }
      t.set(auditDocRef, auditDocData)
    })

    return NextResponse.json({ success: true, id: productDocRef.id })
  } catch (err: unknown) {
    if (err instanceof SystemLockedError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode })
    }
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

    const currentProduct = productSnap.data() as Product
    const currentCategory = (currentProduct.category === 'MMTC PAMP' ? 'Bullions' : currentProduct.category) as ProductCategory
    const currentMetal = currentProduct.metal as MetalType
    const currentStock = Number(currentProduct.stock || 0)

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

    // Lock category and metal once a product has entries or stock
    const isCategoryChanging = cleanCategory !== currentCategory
    const isMetalChanging = cleanMetal !== currentMetal

    if (isCategoryChanging || isMetalChanging) {
      let hasEntries = currentStock > 0
      if (!hasEntries && currentProduct.stockByLocation) {
        hasEntries = Object.values(currentProduct.stockByLocation).some((s) => Number(s) > 0)
      }
      if (!hasEntries) {
        const txSnap = await adminDb.collection('transactions')
          .where('productId', '==', id)
          .limit(1)
          .get()
        if (!txSnap.empty) {
          hasEntries = true
        }
      }

      if (hasEntries) {
        return NextResponse.json({
          error: 'Cannot change category or metal: this product already has inventory history or stock. Category and metal are permanently locked once a product has entries.'
        }, { status: 400 })
      }
    }

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

    if (isIdol) {
      // For Idols, weight is managed through its pieces.
      // Editing an idol product must NEVER replace its piece list or touch per-location lists/stock.
      // Change pieces only through purchases and adjustments.
      numWeight = Number(currentProduct.weight || 0)
    } else {
      if (isNaN(numWeight) || numWeight <= 0) {
        return NextResponse.json({ error: 'Product weight is mandatory and must be greater than 0g' }, { status: 400 })
      }
    }

    const weightMg = isIdol
      ? (currentProduct.weightMg !== undefined ? currentProduct.weightMg : gramsToMg(numWeight))
      : gramsToMg(numWeight)
    numWeight = mgToGrams(weightMg)

    const cleanName = String(name).trim()

    // Note: Stock and pieceWeights are strictly NOT modified by PUT /api/admin/products.
    // Stock and pieces can only be changed via verified transactions (/api/admin/transactions).
    const updatePayload: Record<string, unknown> = {
      name: cleanName,
      category: cleanCategory,
      brand: cleanBrand,
      metal: cleanMetal,
      sku: cleanSku,
      weight: numWeight,
      weightMg,
      purity: cleanPurity,
      updatedAt: FieldValue.serverTimestamp()
    }

    await productDocRef.update(updatePayload)

    // Append Audit Log with server timestamp
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: 'update',
      entityType: 'product',
      entityId: id,
      entityName: cleanName,
      description: `Updated product "${cleanName}" (${cleanSku} · Brand: ${cleanBrand} · ${numWeight}g · ${cleanPurity})`,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
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

    // Archive instead of delete: keeps stock ledger and historical transactions intact
    await productDocRef.update({
      isArchived: true,
      archivedAt: FieldValue.serverTimestamp(),
      archivedBy: caller.callerUid,
      archivedByName: caller.callerName,
      archivedByEmail: caller.callerEmail
    })

    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: 'archive',
      entityType: 'product',
      entityId: id,
      entityName: pData.name || id,
      description: `Archived product "${pData.name || id}" (${pData.sku || ''}) with ${stock} unit(s) of stock`,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    })

    return NextResponse.json({ success: true, archived: true })
  } catch (err: unknown) {
    console.error('DELETE /api/admin/products error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to archive product'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
