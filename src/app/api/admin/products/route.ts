import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { ProductCategory, MetalType } from '@/lib/types'

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

    const isIdol = category === 'Idols'
    let numWeight = Number(weight)
    if (!isIdol) {
      if (isNaN(numWeight) || numWeight <= 0) {
        return NextResponse.json({ error: 'Product weight is mandatory and must be greater than 0g' }, { status: 400 })
      }
    } else {
      if (isNaN(numWeight) || numWeight < 0) numWeight = 0
    }

    const stockByLocation: Record<string, number> = {}
    let totalStock = 0
    const initQty = isIdol ? Math.min(1, Number(initialStock) || 0) : Number(initialStock) || 0

    if (initQty > 0 && initialLocationId) {
      stockByLocation[initialLocationId] = initQty
      totalStock = initQty
    }

    const nowIso = new Date().toISOString()
    const cleanName = String(name).trim()
    const cleanSku = String(sku).trim().toUpperCase()

    // Create Product in Firestore
    const productDocRef = adminDb.collection('products').doc()
    await productDocRef.set({
      name: cleanName,
      category: category as ProductCategory,
      metal: metal as MetalType,
      sku: cleanSku,
      stock: totalStock,
      stockByLocation,
      weight: numWeight,
      purity: String(purity).trim(),
      createdAt: nowIso,
      updatedAt: nowIso
    })

    // If opening stock was given, record the initial purchase transaction
    if (initQty > 0 && initialLocationId && initialLocationName) {
      await adminDb.collection('transactions').add({
        type: 'purchase',
        productId: productDocRef.id,
        productName: cleanName,
        category,
        metal,
        quantity: initQty,
        price: 0,
        locationId: initialLocationId,
        locationName: initialLocationName,
        date: nowIso.split('T')[0],
        notes: 'Initial opening stock',
        createdAt: nowIso,
        operatorId: caller.callerUid,
        operatorEmail: caller.callerData.email
      })
    }

    // Append Audit Log
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerData.displayName,
      userEmail: caller.callerData.email,
      action: 'create',
      entityType: 'product',
      entityId: productDocRef.id,
      entityName: cleanName,
      description: `Added product "${cleanName}" (${metal} · ${category} · ${numWeight}g · SKU: ${cleanSku}) with ${totalStock} opening units`,
      timestamp: nowIso
    })

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
    const { id, name, category, metal, sku, weight, purity } = body

    if (!id) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    }

    const productDocRef = adminDb.collection('products').doc(id)
    const productSnap = await productDocRef.get()
    if (!productSnap.exists) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const isIdol = category === 'Idols'
    let numWeight = Number(weight)
    if (!isIdol) {
      if (isNaN(numWeight) || numWeight <= 0) {
        return NextResponse.json({ error: 'Product weight is mandatory and must be greater than 0g' }, { status: 400 })
      }
    } else {
      if (isNaN(numWeight) || numWeight < 0) numWeight = 0
    }

    const nowIso = new Date().toISOString()
    const cleanName = String(name).trim()
    const cleanSku = String(sku).trim().toUpperCase()

    // Note: Stock is strictly NOT modified by PUT /api/admin/products.
    // Stock can only be changed via verified transactions (/api/admin/transactions).
    await productDocRef.update({
      name: cleanName,
      category: category as ProductCategory,
      metal: metal as MetalType,
      sku: cleanSku,
      weight: numWeight,
      purity: String(purity).trim(),
      updatedAt: nowIso
    })

    // Append Audit Log
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerData.displayName,
      userEmail: caller.callerData.email,
      action: 'update',
      entityType: 'product',
      entityId: id,
      entityName: cleanName,
      description: `Updated product "${cleanName}" (${cleanSku} · ${numWeight}g · ${purity})`,
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
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to delete products' }, { status: 403 })
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
    if (stock > 0) {
      return NextResponse.json({ error: `Cannot delete product with existing stock (${stock} units). Zero out or transfer stock first.` }, { status: 400 })
    }

    await productDocRef.delete()

    const nowIso = new Date().toISOString()
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerData.displayName,
      userEmail: caller.callerData.email,
      action: 'delete',
      entityType: 'product',
      entityId: id,
      entityName: pData.name || id,
      description: `Deleted product "${pData.name || id}" from catalog`,
      timestamp: nowIso
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('DELETE /api/admin/products error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to delete product'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
