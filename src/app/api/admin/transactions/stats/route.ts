import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { AggregateField } from 'firebase-admin/firestore'
import { getAuthenticatedCaller, hasModulePermission } from '@/lib/firebase/server-auth'
import { TransactionStats } from '@/lib/types'

export async function GET(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedCaller(req)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { caller } = authResult

    if (
      !hasModulePermission(caller, 'sales', 'view') &&
      !hasModulePermission(caller, 'reports', 'view')
    ) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to view transaction stats' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined
    const locationId = searchParams.get('locationId') || undefined

    // Restrict staff if locked to location
    const isSuperAdmin = caller.isSuperAdmin
    const userAssignedLoc = caller.callerData.assignedLocationId
    const effectiveLocationId = !isSuperAdmin && userAssignedLoc ? userAssignedLoc : locationId

    let salesCount = 0
    let salesUnits = 0
    let salesRevenue = 0

    let returnsCount = 0
    let returnsUnits = 0
    let returnsAmount = 0

    const productSalesStats: Record<string, { unitsSold: number; totalRevenue: number; salesCount: number }> = {}

    // 1. Compute Sales Totals with Firestore Aggregation Queries
    let salesQuery: FirebaseFirestore.Query = adminDb.collection('transactions').where('type', '==', 'sale')
    if (startDate) salesQuery = salesQuery.where('date', '>=', startDate)
    if (endDate) salesQuery = salesQuery.where('date', '<=', endDate)
    if (effectiveLocationId) salesQuery = salesQuery.where('locationId', '==', effectiveLocationId)

    let aggSalesCount = 0
    let aggSalesUnits = 0
    let aggSalesRevenue = 0
    let usedSalesAgg = false

    try {
      const allAggPromise = salesQuery.aggregate({
        count: AggregateField.count(),
        sumQty: AggregateField.sum('quantity'),
        sumTotalAmount: AggregateField.sum('totalAmount')
      }).get()

      const revAggPromise = salesQuery.where('isReversed', '==', true).aggregate({
        count: AggregateField.count(),
        sumQty: AggregateField.sum('quantity'),
        sumTotalAmount: AggregateField.sum('totalAmount')
      }).get()

      const [allSnap, revSnap] = await Promise.all([allAggPromise, revAggPromise])
      const allData = allSnap.data()
      const revData = revSnap.data()

      aggSalesCount = Math.max(0, (allData.count || 0) - (revData.count || 0))
      aggSalesUnits = Math.max(0, (allData.sumQty || 0) - (revData.sumQty || 0))
      aggSalesRevenue = Math.max(0, (allData.sumTotalAmount || 0) - (revData.sumTotalAmount || 0))
      usedSalesAgg = true
    } catch {
      // If composite index pending or field error, document scan handles it below
    }

    // 2. Compute Returns Totals with Firestore Aggregation Queries
    let returnsQuery: FirebaseFirestore.Query = adminDb.collection('transactions').where('type', '==', 'return')
    if (startDate) returnsQuery = returnsQuery.where('date', '>=', startDate)
    if (endDate) returnsQuery = returnsQuery.where('date', '<=', endDate)
    if (effectiveLocationId) returnsQuery = returnsQuery.where('locationId', '==', effectiveLocationId)

    let aggReturnsCount = 0
    let aggReturnsUnits = 0
    let aggReturnsAmount = 0
    let usedReturnsAgg = false

    try {
      const allAggPromise = returnsQuery.aggregate({
        count: AggregateField.count(),
        sumQty: AggregateField.sum('quantity'),
        sumTotalAmount: AggregateField.sum('totalAmount')
      }).get()

      const revAggPromise = returnsQuery.where('isReversed', '==', true).aggregate({
        count: AggregateField.count(),
        sumQty: AggregateField.sum('quantity'),
        sumTotalAmount: AggregateField.sum('totalAmount')
      }).get()

      const [allSnap, revSnap] = await Promise.all([allAggPromise, revAggPromise])
      const allData = allSnap.data()
      const revData = revSnap.data()

      aggReturnsCount = Math.max(0, (allData.count || 0) - (revData.count || 0))
      aggReturnsUnits = Math.max(0, (allData.sumQty || 0) - (revData.sumQty || 0))
      aggReturnsAmount = Math.max(0, (allData.sumTotalAmount || 0) - (revData.sumTotalAmount || 0))
      usedReturnsAgg = true
    } catch {
      // Document scan fallback handles it below
    }

    // 3. Document scan for per-product stats AND ground-truth non-reversed totals
    let cleanSalesCount = 0
    let cleanSalesUnits = 0
    let cleanSalesRevenue = 0

    let cleanReturnsCount = 0
    let cleanReturnsUnits = 0
    let cleanReturnsAmount = 0

    try {
      let salesDocsSnap: FirebaseFirestore.QuerySnapshot
      try {
        salesDocsSnap = await salesQuery.select('productId', 'quantity', 'price', 'totalAmount', 'type', 'locationId', 'isReversed', 'isReversal', 'reversalOf').get()
      } catch {
        let fallbackQ: FirebaseFirestore.Query = adminDb.collection('transactions')
        if (startDate) fallbackQ = fallbackQ.where('date', '>=', startDate)
        if (endDate) fallbackQ = fallbackQ.where('date', '<=', endDate)
        salesDocsSnap = await fallbackQ.select('productId', 'quantity', 'price', 'totalAmount', 'type', 'locationId', 'isReversed', 'isReversal', 'reversalOf').get()
      }

      salesDocsSnap.docs.forEach((docSnap) => {
        const d = docSnap.data()
        if (d.type !== 'sale') return
        if (effectiveLocationId && d.locationId && d.locationId !== effectiveLocationId) return

        // LEAVE OUT REVERSED ENTRIES AND REVERSAL ENTRIES
        if (d.isReversed === true || d.isReversal === true || Boolean(d.reversalOf)) return

        const qty = Number(d.quantity || 0)
        const amt = typeof d.totalAmount === 'number'
          ? d.totalAmount
          : typeof d.price === 'number'
            ? d.price * (qty > 0 ? qty : 1)
            : 0

        cleanSalesCount++
        cleanSalesUnits += qty
        cleanSalesRevenue += amt

        const pId = String(d.productId || '')
        if (pId) {
          if (!productSalesStats[pId]) {
            productSalesStats[pId] = { unitsSold: 0, totalRevenue: 0, salesCount: 0 }
          }
          productSalesStats[pId].unitsSold += qty
          productSalesStats[pId].totalRevenue += amt
          productSalesStats[pId].salesCount++
        }
      })

      let returnsDocsSnap: FirebaseFirestore.QuerySnapshot
      try {
        returnsDocsSnap = await returnsQuery.select('quantity', 'price', 'totalAmount', 'type', 'locationId', 'isReversed', 'isReversal', 'reversalOf').get()
      } catch {
        let fallbackQ: FirebaseFirestore.Query = adminDb.collection('transactions')
        if (startDate) fallbackQ = fallbackQ.where('date', '>=', startDate)
        if (endDate) fallbackQ = fallbackQ.where('date', '<=', endDate)
        returnsDocsSnap = await fallbackQ.select('quantity', 'price', 'totalAmount', 'type', 'locationId', 'isReversed', 'isReversal', 'reversalOf').get()
      }

      returnsDocsSnap.docs.forEach((docSnap) => {
        const d = docSnap.data()
        if (d.type !== 'return') return
        if (effectiveLocationId && d.locationId && d.locationId !== effectiveLocationId) return

        // LEAVE OUT REVERSED ENTRIES AND REVERSAL ENTRIES
        if (d.isReversed === true || d.isReversal === true || Boolean(d.reversalOf)) return

        const qty = Number(d.quantity || 0)
        const amt = typeof d.totalAmount === 'number'
          ? d.totalAmount
          : typeof d.price === 'number'
            ? d.price * (qty > 0 ? qty : 1)
            : 0

        cleanReturnsCount++
        cleanReturnsUnits += qty
        cleanReturnsAmount += amt
      })

      // Ground truth clean totals ensure exact correspondence between top sellers and executive cards
      salesCount = cleanSalesCount
      salesUnits = cleanSalesUnits
      salesRevenue = cleanSalesRevenue

      returnsCount = cleanReturnsCount
      returnsUnits = cleanReturnsUnits
      returnsAmount = cleanReturnsAmount
    } catch (err: unknown) {
      console.error('Error fetching document breakdown for stats:', err)
      if (usedSalesAgg) {
        salesCount = aggSalesCount
        salesUnits = aggSalesUnits
        salesRevenue = aggSalesRevenue
      }
      if (usedReturnsAgg) {
        returnsCount = aggReturnsCount
        returnsUnits = aggReturnsUnits
        returnsAmount = aggReturnsAmount
      }
    }

    const netRevenue = salesRevenue - returnsAmount

    const stats: TransactionStats = {
      salesCount,
      salesUnits,
      salesRevenue,
      returnsCount,
      returnsUnits,
      returnsAmount,
      netRevenue,
      productSalesStats
    }

    return NextResponse.json({ success: true, stats })
  } catch (err: unknown) {
    console.error('GET /api/admin/transactions/stats error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to query transaction stats'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
