"use client"

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ShoppingCart, Plus, RotateCcw, Lock } from 'lucide-react'
import { toast } from 'sonner'
import {
  Product,
  Location,
  Transaction,
  ProductCategory,
  MetalType,
  TransactionStats,
  Order
} from '@/lib/types'
import {
  getProducts,
  getLocations,
  getTransactionsPage,
  getTransactionStats,
  deleteTransaction
} from '@/lib/services/inventory.service'
import { getOrders, reverseOrder } from '@/lib/services/orders.service'
import { ConfirmModal } from '@/components/confirm-modal'
import { SkeletonTable } from '@/components/ui/skeleton'
import { SelectOption } from '@/components/custom-select'
import { usePermissions } from '@/lib/context/PermissionsContext'
import { formatWeight } from '@/lib/utils/weight'
import { getTodayIST, getDaysAgoIST } from '@/lib/utils/date'

// Extracted Sales Components
import { SaleBill, SalesTab } from './components/types'
import { RecordSaleModal, ValidatedSaleItem } from './components/RecordSaleModal'
import { RecordReturnModal } from './components/RecordReturnModal'
import { SalesBillsTable } from './components/SalesBillsTable'
import { ReturnsTable } from './components/ReturnsTable'
import { EditSaleModal } from './components/EditSaleModal'
import { SalesMetricsStrip } from './components/SalesMetricsStrip'
import { SalesFilterBar } from './components/SalesFilterBar'

export default function AdminSales() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { hasPermission, adminUser, isSuperAdmin } = usePermissions()
  const userAssignedLocationId = adminUser?.assignedLocationId
  const isLocationLocked = Boolean(!isSuperAdmin && userAssignedLocationId)

  // URL-synchronized tabs (?tab=sales | ?tab=returns)
  const tabParam = searchParams.get('tab')
  const activeTab: SalesTab = tabParam === 'returns' ? 'returns' : 'sales'

  const handleTabChange = (tab: SalesTab) => {
    setIsSaleFormOpen(false)
    setIsReturnFormOpen(false)
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'sales') {
      params.delete('tab')
    } else {
      params.set('tab', tab)
    }
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const [expandedBillKeys, setExpandedBillKeys] = useState<Set<string>>(new Set())

  const toggleBillExpand = (key: string) => {
    setExpandedBillKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Filter state
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'All'>('All')
  const [selectedMetal, setSelectedMetal] = useState<MetalType | 'All'>('All')

  // Data state
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [salesList, setSalesList] = useState<Transaction[]>([])
  const [salesCursor, setSalesCursor] = useState<string | null>(null)
  const [salesHasMore, setSalesHasMore] = useState(false)
  const [loadingMoreSales, setLoadingMoreSales] = useState(false)

  const [returnsList, setReturnsList] = useState<Transaction[]>([])
  const [returnsCursor, setReturnsCursor] = useState<string | null>(null)
  const [returnsHasMore, setReturnsHasMore] = useState(false)
  const [loadingMoreReturns, setLoadingMoreReturns] = useState(false)

  const [ordersList, setOrdersList] = useState<Order[]>([])
  const [reverseOrderTarget, setReverseOrderTarget] = useState<SaleBill | null>(null)
  const [reversingOrder, setReversingOrder] = useState(false)

  const [stats, setStats] = useState<TransactionStats>({
    salesCount: 0,
    salesUnits: 0,
    salesRevenue: 0,
    returnsCount: 0,
    returnsUnits: 0,
    returnsAmount: 0,
    netRevenue: 0,
    profit: 0
  })
  const [loading, setLoading] = useState(true)

  // Modals state
  const [isSaleFormOpen, setIsSaleFormOpen] = useState(false)
  const [isReturnFormOpen, setIsReturnFormOpen] = useState(false)
  const [deleteTxTarget, setDeleteTxTarget] = useState<Transaction | null>(null)
  const [editingSale, setEditingSale] = useState<Transaction | null>(null)

  // Date Range State
  const [dateRangePreset, setDateRangePreset] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  const { effectiveStartDate, effectiveEndDate } = useMemo(() => {
    if (dateRangePreset === 'today') {
      const today = getTodayIST()
      return { effectiveStartDate: today, effectiveEndDate: today }
    }
    if (dateRangePreset === 'week') {
      return { effectiveStartDate: getDaysAgoIST(7), effectiveEndDate: getTodayIST() }
    }
    if (dateRangePreset === 'month') {
      return { effectiveStartDate: getDaysAgoIST(30), effectiveEndDate: getTodayIST() }
    }
    if (dateRangePreset === 'custom') {
      return { effectiveStartDate: customStartDate, effectiveEndDate: customEndDate }
    }
    return { effectiveStartDate: '', effectiveEndDate: '' }
  }, [dateRangePreset, customStartDate, customEndDate])

  // Server stats & transaction pagination loader
  useEffect(() => {
    let ignore = false

    Promise.all([
      getProducts(),
      getLocations(),
      getTransactionStats({
        startDate: effectiveStartDate || undefined,
        endDate: effectiveEndDate || undefined,
        locationId: userAssignedLocationId || undefined
      }),
      getTransactionsPage({
        startDate: effectiveStartDate || undefined,
        endDate: effectiveEndDate || undefined,
        type: 'sale',
        limitCount: 25
      }),
      getTransactionsPage({
        startDate: effectiveStartDate || undefined,
        endDate: effectiveEndDate || undefined,
        type: 'return',
        limitCount: 25
      })
    ])
      .then(([prods, locs, serverStats, salesPageRes, returnsPageRes]) => {
        if (!ignore) {
          setProducts(prods)
          setLocations(locs)
          setStats(serverStats)
          setSalesList(salesPageRes.transactions)
          setSalesCursor(salesPageRes.nextCursor)
          setSalesHasMore(salesPageRes.hasMore)
          setReturnsList(returnsPageRes.transactions)
          setReturnsCursor(returnsPageRes.nextCursor)
          setReturnsHasMore(returnsPageRes.hasMore)
          setLoading(false)

          getOrders({ limit: 100 })
            .then((data) => {
              if (!ignore && data?.orders) {
                setOrdersList(data.orders)
              }
            })
            .catch((err) => console.error('Failed to load orders', err))
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          console.error('Failed to load sales data', err)
          const msg = err instanceof Error ? err.message : 'Unable to load sales data. Please check connection.'
          toast.error(msg)
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [effectiveStartDate, effectiveEndDate, userAssignedLocationId])

  const refreshStats = useCallback(async () => {
    try {
      const serverStats = await getTransactionStats({
        startDate: effectiveStartDate || undefined,
        endDate: effectiveEndDate || undefined,
        locationId: userAssignedLocationId || undefined
      })
      if (serverStats) {
        setStats(serverStats)
      }
    } catch (err) {
      console.warn('Failed to refresh stats:', err)
    }
  }, [effectiveStartDate, effectiveEndDate, userAssignedLocationId, setStats])

  const broadcastTxUpdate = useCallback(() => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const bc = new BroadcastChannel('a96-tx-updates')
      bc.postMessage({ type: 'transaction-updated' })
      bc.close()
    }
  }, [])

  useEffect(() => {
    const handleFocus = () => {
      refreshStats()
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshStats()
      }
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    let bc: BroadcastChannel | null = null
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      bc = new BroadcastChannel('a96-tx-updates')
      bc.onmessage = (event) => {
        if (event.data?.type === 'transaction-updated') {
          refreshStats()
        }
      }
    }

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
      if (bc) bc.close()
    }
  }, [refreshStats])

  // Load More Handlers
  const handleLoadMoreSales = async () => {
    if (!salesCursor || loadingMoreSales) return
    try {
      setLoadingMoreSales(true)
      const res = await getTransactionsPage({
        startDate: effectiveStartDate || undefined,
        endDate: effectiveEndDate || undefined,
        type: 'sale',
        limitCount: 25,
        cursorDocId: salesCursor
      })
      setSalesList((prev) => [...prev, ...res.transactions])
      setSalesCursor(res.nextCursor)
      setSalesHasMore(res.hasMore)
    } catch (err) {
      console.error('Failed to load more sales', err)
      toast.error('Failed to load more sales')
    } finally {
      setLoadingMoreSales(false)
    }
  }

  const handleLoadMoreReturns = async () => {
    if (!returnsCursor || loadingMoreReturns) return
    try {
      setLoadingMoreReturns(true)
      const res = await getTransactionsPage({
        startDate: effectiveStartDate || undefined,
        endDate: effectiveEndDate || undefined,
        type: 'return',
        limitCount: 25,
        cursorDocId: returnsCursor
      })
      setReturnsList((prev) => [...prev, ...res.transactions])
      setReturnsCursor(res.nextCursor)
      setReturnsHasMore(res.hasMore)
    } catch (err) {
      console.error('Failed to load more returns', err)
      toast.error('Failed to load more returns')
    } finally {
      setLoadingMoreReturns(false)
    }
  }

  // Location lookups and options
  const locationMap = useMemo(() => {
    const map = new Map<string, string>()
    locations.forEach((l) => map.set(l.id, l.name))
    return map
  }, [locations])

  const saleLocationOptions: SelectOption[] = useMemo(() => {
    return locations
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
      .map((l) => ({
        value: l.id,
        label: l.name
      }))
  }, [locations])

  const returnLocationOptions: SelectOption[] = useMemo(() => {
    return locations
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
      .map((l) => ({
        value: l.id,
        label: l.name
      }))
  }, [locations])

  // Filtered lists
  const filteredSales = useMemo(() => {
    return salesList.filter(
      (tx) =>
        (selectedCategory === 'All' || tx.category === selectedCategory) &&
        (selectedMetal === 'All' || tx.metal === selectedMetal)
    )
  }, [salesList, selectedCategory, selectedMetal])

  const filteredReturns = useMemo(() => {
    return returnsList.filter(
      (tx) =>
        (selectedCategory === 'All' || tx.category === selectedCategory) &&
        (selectedMetal === 'All' || tx.metal === selectedMetal)
    )
  }, [returnsList, selectedCategory, selectedMetal])

  // Orders map for invoice grouping
  const ordersMap = useMemo(() => {
    const map = new Map<string, Order>()
    for (const o of ordersList) {
      map.set(o.id, o)
    }
    return map
  }, [ordersList])

  // Group sales transactions into bills/invoices
  const saleBills: SaleBill[] = useMemo(() => {
    const billMap = new Map<string, SaleBill>()

    for (const tx of filteredSales) {
      const order = tx.orderId ? ordersMap.get(tx.orderId) : undefined
      const invoiceKey = tx.orderId
        ? `order_${tx.orderId}`
        : (tx.notes && tx.notes.trim())
          ? `${tx.notes.trim()}_${tx.date}_${tx.locationId}`
          : tx.id

      let bill = billMap.get(invoiceKey)
      if (!bill) {
        bill = {
          billKey: invoiceKey,
          invoiceNo: order?.orderNo || tx.notes?.trim() || `TX-${tx.id.slice(0, 8).toUpperCase()}`,
          orderId: tx.orderId,
          date: tx.date,
          customerName: order?.customerSnapshot?.displayName || tx.customerName || '',
          customerId: order?.customerId || tx.customerId,
          locationName: tx.locationName || '',
          locationId: tx.locationId,
          items: [],
          totalQuantity: 0,
          totalAmount: 0,
          paymentModes: order?.payments?.map((p) => p.mode),
          hasReversed: false,
          hasActive: false
        }
        billMap.set(invoiceKey, bill)
      }

      bill.items.push(tx)
      bill.totalQuantity += tx.quantity || 1
      bill.totalAmount += (tx.price || 0) * (tx.quantity || 1)
      if (tx.isReversed || order?.isReversed || (order as { status?: string })?.status === 'reversed') {
        bill.hasReversed = true
      } else {
        bill.hasActive = true
      }
    }

    return Array.from(billMap.values())
  }, [filteredSales, ordersMap])

  // Product options formatted for CustomSelect
  const saleProductOptions: SelectOption[] = useMemo(() => {
    const metalOrder = (m?: string) => {
      const lower = (m || '').toLowerCase()
      if (lower === 'gold') return 1
      if (lower === 'silver') return 2
      return 3
    }

    return products
      .filter((p) => !p.isArchived)
      .slice()
      .sort((a, b) => {
        const orderA = metalOrder(a.metal)
        const orderB = metalOrder(b.metal)
        if (orderA !== orderB) return orderA - orderB
        return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
      })
      .map((p) => {
        const weightLabel =
          p.category === 'Idols' && p.weight && p.weight > 0 ? `~${formatWeight(p.weight)} avg` : formatWeight(p.weight)
        const brandLabel = p.brand ? ` · ${p.brand}` : ''
        return {
          value: p.id,
          label: p.name,
          sublabel: `${p.category}${brandLabel} · ${weightLabel} · ${p.sku}`,
          badge: `${p.stock} in stock`,
          group: p.metal || 'Silver'
        }
      })
  }, [products])

  // Callbacks from extracted modals
  const handleSaleRecorded = (createdOrder: Order, validatedItems: ValidatedSaleItem[]) => {
    setOrdersList((prev) => [createdOrder, ...prev])

    const newTransactions: Transaction[] = createdOrder.lines.map((l) => {
      const prod = products.find((p) => p.id === l.productId)
      return {
        id: l.transactionId,
        orderId: createdOrder.id,
        type: 'sale' as const,
        productId: l.productId,
        productName: l.productName,
        category: l.category as ProductCategory,
        brand: prod?.brand,
        metal: l.metal as MetalType,
        quantity: l.qty,
        pieceWeight: l.pieceWeightMg ? l.pieceWeightMg / 1000 : undefined,
        price: l.unitPricePaise / 100,
        locationId: createdOrder.locationId,
        locationName: createdOrder.locationName,
        customerId: createdOrder.customerId,
        customerName: createdOrder.customerSnapshot?.displayName || undefined,
        date: createdOrder.date,
        notes: createdOrder.orderNo,
        createdAt: createdOrder.createdAt
      }
    })

    setSalesList((prev) => [...newTransactions, ...prev])
    const totalSaleAmt = createdOrder.totals.amountPaise / 100
    const totalUnits = createdOrder.totals.units

    setStats((prev) => ({
      ...prev,
      salesCount: prev.salesCount + newTransactions.length,
      salesUnits: prev.salesUnits + totalUnits,
      salesRevenue: prev.salesRevenue + totalSaleAmt,
      netRevenue: prev.netRevenue + totalSaleAmt,
      profit: (prev.profit ?? prev.netRevenue) + totalSaleAmt
    }))
    broadcastTxUpdate()
    refreshStats()

    const effectiveLocId = createdOrder.locationId
    setProducts((prev) => {
      let updated = [...prev]
      for (const it of validatedItems) {
        updated = updated.map((p) => {
          if (p.id !== it.prod.id) return p
          const currentLocStock = p.stockByLocation?.[effectiveLocId] || 0
          const updatedLocStock = Math.max(0, currentLocStock - it.qty)
          const updatedStockByLoc = { ...p.stockByLocation, [effectiveLocId]: updatedLocStock }
          const updatedTotalStock = Math.max(0, (p.stock || 0) - it.qty)

          let updatedPieces = p.pieceWeights
          let updatedPiecesByLoc = p.pieceWeightsByLocation
          if (it.pieceWeight) {
            const soldWeight = it.pieceWeight
            const locPieces = p.pieceWeightsByLocation?.[effectiveLocId] || []
            const idxInLoc = locPieces.indexOf(soldWeight)
            const newLocPieces =
              idxInLoc >= 0 ? [...locPieces.slice(0, idxInLoc), ...locPieces.slice(idxInLoc + 1)] : locPieces
            updatedPiecesByLoc = { ...p.pieceWeightsByLocation, [effectiveLocId]: newLocPieces }

            const allPieces = p.pieceWeights || []
            const idxInAll = allPieces.indexOf(soldWeight)
            updatedPieces =
              idxInAll >= 0 ? [...allPieces.slice(0, idxInAll), ...allPieces.slice(idxInAll + 1)] : allPieces
          }

          return {
            ...p,
            stock: updatedTotalStock,
            stockByLocation: updatedStockByLoc,
            pieceWeights: updatedPieces,
            pieceWeightsByLocation: updatedPiecesByLoc
          }
        })
      }
      return updated
    })
  }

  const handleReturnRecorded = (
    createdTx: Transaction,
    prod: Product,
    qty: number,
    effectiveLocId: string,
    pieceWeightNum?: number
  ) => {
    setReturnsList((prev) => [createdTx, ...prev])
    const retAmt = (createdTx.price || 0) * qty
    setStats((prev) => ({
      ...prev,
      returnsCount: prev.returnsCount + 1,
      returnsUnits: prev.returnsUnits + qty,
      returnsAmount: prev.returnsAmount + retAmt,
      netRevenue: prev.netRevenue - retAmt,
      profit: (prev.profit ?? prev.netRevenue) - retAmt
    }))
    broadcastTxUpdate()
    refreshStats()

    const isIdol = prod.category === 'Idols'
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== prod.id) return p
        const currentLocStock = p.stockByLocation?.[effectiveLocId] || 0
        const updatedLocStock = currentLocStock + qty
        const updatedStockByLoc = { ...p.stockByLocation, [effectiveLocId]: updatedLocStock }
        const updatedTotalStock = (p.stock || 0) + qty

        let updatedPieces = p.pieceWeights
        let updatedPiecesByLoc = p.pieceWeightsByLocation
        if (isIdol && pieceWeightNum) {
          const locPieces = p.pieceWeightsByLocation?.[effectiveLocId] || []
          updatedPiecesByLoc = { ...p.pieceWeightsByLocation, [effectiveLocId]: [...locPieces, pieceWeightNum] }
          const allPieces = p.pieceWeights || []
          updatedPieces = [...allPieces, pieceWeightNum]
        }

        return {
          ...p,
          stock: updatedTotalStock,
          stockByLocation: updatedStockByLoc,
          pieceWeights: updatedPieces,
          pieceWeightsByLocation: updatedPiecesByLoc
        }
      })
    )
  }

  const handleSaleUpdated = (
    updated: Transaction,
    oldQty: number,
    oldPrice: number,
    newQty: number,
    newPrice: number,
    oldLoc: string,
    newLoc: string
  ) => {
    setSalesList((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)))

    const oldTotal = oldQty * oldPrice
    const newTotal = newQty * newPrice
    const qtyDiff = newQty - oldQty
    const revDiff = newTotal - oldTotal

    setStats((prev) => ({
      ...prev,
      salesUnits: prev.salesUnits + qtyDiff,
      salesRevenue: prev.salesRevenue + revDiff,
      netRevenue: prev.netRevenue + revDiff,
      profit: (prev.profit ?? prev.netRevenue) + revDiff
    }))
    broadcastTxUpdate()
    refreshStats()

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== updated.productId) return p
        const locStock = { ...(p.stockByLocation || {}) }
        let totalStock = p.stock || 0
        if (oldLoc === newLoc) {
          locStock[oldLoc] = (locStock[oldLoc] || 0) - qtyDiff
          totalStock -= qtyDiff
        } else {
          locStock[oldLoc] = (locStock[oldLoc] || 0) + oldQty
          locStock[newLoc] = (locStock[newLoc] || 0) - newQty
          totalStock -= qtyDiff
        }
        return {
          ...p,
          stock: Math.max(0, totalStock),
          stockByLocation: locStock
        }
      })
    )
  }

  // Reverse complete Order Bill with atomic inventory restoration
  const handleConfirmReverseOrder = async () => {
    if (!reverseOrderTarget || !reverseOrderTarget.orderId) return
    try {
      setReversingOrder(true)
      const data = await reverseOrder(reverseOrderTarget.orderId)
      const reversedOrder: Order = data.order
      toast.success(`Bill ${reversedOrder.orderNo} reversed successfully`)

      setOrdersList((prev) =>
        prev.map((o) => (o.id === reversedOrder.id ? { ...o, isReversed: true } : o))
      )

      const lineTxIds = new Set(reversedOrder.lines.map((l) => l.transactionId))
      setSalesList((prev) =>
        prev.map((t) => (lineTxIds.has(t.id) ? { ...t, isReversed: true } : t))
      )

      const totalOrderAmt = reversedOrder.totals.amountPaise / 100
      const totalOrderUnits = reversedOrder.totals.units
      setStats((prev) => ({
        ...prev,
        salesCount: Math.max(0, prev.salesCount - reversedOrder.lines.length),
        salesUnits: Math.max(0, prev.salesUnits - totalOrderUnits),
        salesRevenue: Math.max(0, prev.salesRevenue - totalOrderAmt),
        netRevenue: Math.max(0, prev.netRevenue - totalOrderAmt),
        profit: Math.max(0, (prev.profit ?? prev.netRevenue) - totalOrderAmt)
      }))
      broadcastTxUpdate()
      refreshStats()

      setProducts((prev) => {
        let updated = [...prev]
        for (const line of reversedOrder.lines) {
          updated = updated.map((p) => {
            if (p.id !== line.productId) return p
            const locId = reversedOrder.locationId
            const currentLocStock = p.stockByLocation?.[locId] || 0
            const updatedLocStock = currentLocStock + line.qty
            const updatedStockByLoc = { ...p.stockByLocation, [locId]: updatedLocStock }
            const updatedTotalStock = (p.stock || 0) + line.qty

            let updatedPieces = p.pieceWeights
            let updatedPiecesByLoc = p.pieceWeightsByLocation
            if (line.pieceWeightMg) {
              const restoredWeightGrams = line.pieceWeightMg / 1000
              const locPieces = p.pieceWeightsByLocation?.[locId] || []
              updatedPiecesByLoc = { ...p.pieceWeightsByLocation, [locId]: [...locPieces, restoredWeightGrams] }
              const allPieces = p.pieceWeights || []
              updatedPieces = [...allPieces, restoredWeightGrams]
            }

            return {
              ...p,
              stock: updatedTotalStock,
              stockByLocation: updatedStockByLoc,
              pieceWeights: updatedPieces,
              pieceWeightsByLocation: updatedPiecesByLoc
            }
          })
        }
        return updated
      })

      setReverseOrderTarget(null)
    } catch (err: unknown) {
      console.error('Error reversing order', err)
      const msg = err instanceof Error ? err.message : 'Failed to reverse order'
      toast.error(msg)
    } finally {
      setReversingOrder(false)
    }
  }

  // Reverse transaction with automatic reversing entry
  const executeDeleteTransaction = async () => {
    if (!deleteTxTarget) return
    try {
      const res = await deleteTransaction(deleteTxTarget)
      toast.success('Reversing entry posted successfully')

      const reversedId = deleteTxTarget.id
      const isTargetSale = deleteTxTarget.type === 'sale'
      const isTargetReturn = deleteTxTarget.type === 'return'
      const targetQty = Number(deleteTxTarget.quantity || 1)
      const targetPrice = Number(deleteTxTarget.price || 0)
      const targetTotal = targetPrice * targetQty

      if (isTargetSale) {
        setSalesList((prev) => {
          const updated = prev.map((t) => (t.id === reversedId ? { ...t, isReversed: true } : t))
          return res.reversingEntry ? [res.reversingEntry, ...updated] : updated
        })
        setStats((prev) => ({
          ...prev,
          salesCount: Math.max(0, prev.salesCount - 1),
          salesUnits: Math.max(0, prev.salesUnits - targetQty),
          salesRevenue: Math.max(0, prev.salesRevenue - targetTotal),
          netRevenue: Math.max(0, prev.netRevenue - targetTotal),
          profit: Math.max(0, (prev.profit ?? prev.netRevenue) - targetTotal)
        }))
      } else if (isTargetReturn) {
        setReturnsList((prev) => {
          const updated = prev.map((t) => (t.id === reversedId ? { ...t, isReversed: true } : t))
          return res.reversingEntry ? [res.reversingEntry, ...updated] : updated
        })
        setStats((prev) => ({
          ...prev,
          returnsCount: Math.max(0, prev.returnsCount - 1),
          returnsUnits: Math.max(0, prev.returnsUnits - targetQty),
          returnsAmount: Math.max(0, prev.returnsAmount - targetTotal),
          netRevenue: prev.netRevenue + targetTotal,
          profit: (prev.profit ?? prev.netRevenue) + targetTotal
        }))
      }
      broadcastTxUpdate()
      refreshStats()

      const targetProdId = deleteTxTarget.productId
      const targetLocId = deleteTxTarget.locationId

      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== targetProdId) return p
          const locStock = p.stockByLocation?.[targetLocId] || 0
          const updatedLocStock = isTargetSale
            ? locStock + targetQty
            : isTargetReturn
              ? Math.max(0, locStock - targetQty)
              : locStock
          const updatedTotalStock = isTargetSale
            ? (p.stock || 0) + targetQty
            : isTargetReturn
              ? Math.max(0, (p.stock || 0) - targetQty)
              : (p.stock || 0)

          let updatedPieces = p.pieceWeights
          let updatedPiecesByLoc = p.pieceWeightsByLocation
          if (p.category === 'Idols' && deleteTxTarget.pieceWeight) {
            const pw = Number(deleteTxTarget.pieceWeight)
            if (isTargetSale) {
              const locPieces = p.pieceWeightsByLocation?.[targetLocId] || []
              updatedPiecesByLoc = { ...p.pieceWeightsByLocation, [targetLocId]: [...locPieces, pw] }
              updatedPieces = [...(p.pieceWeights || []), pw]
            } else if (isTargetReturn) {
              const locPieces = p.pieceWeightsByLocation?.[targetLocId] || []
              const idx = locPieces.indexOf(pw)
              const newLoc = idx >= 0 ? [...locPieces.slice(0, idx), ...locPieces.slice(idx + 1)] : locPieces
              updatedPiecesByLoc = { ...p.pieceWeightsByLocation, [targetLocId]: newLoc }
              const allPieces = p.pieceWeights || []
              const idxAll = allPieces.indexOf(pw)
              updatedPieces = idxAll >= 0 ? [...allPieces.slice(0, idxAll), ...allPieces.slice(idxAll + 1)] : allPieces
            }
          }

          return {
            ...p,
            stock: updatedTotalStock,
            stockByLocation: { ...p.stockByLocation, [targetLocId]: updatedLocStock },
            pieceWeights: updatedPieces,
            pieceWeightsByLocation: updatedPiecesByLoc
          }
        })
      )
      setDeleteTxTarget(null)
    } catch (err: unknown) {
      console.error('Failed to reverse transaction', err)
      const msg = err instanceof Error ? err.message : 'Failed to reverse transaction'
      toast.error(msg)
    }
  }

  if (!isSuperAdmin && !hasPermission('sales', 'view') && !hasPermission('returns', 'view')) {
    return (
      <div className="w-full py-20 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-black">
          <Lock size={22} />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-black mb-2">Access Restricted</h2>
        <p className="text-sm text-gray-500 max-w-md">
          You do not have permission to view sales or returns records.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-black mb-1">Sales</h1>
          <p className="text-gray-500 text-sm">Customer sales and returns.</p>
        </div>

        <div className="flex items-center gap-2">
          {hasPermission('returns', 'add') && (
            <button
              onClick={() => {
                setIsSaleFormOpen(false)
                setIsReturnFormOpen(true)
              }}
              disabled={products.length === 0 || locations.length === 0}
              className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 hover:text-black hover:bg-gray-50 rounded-lg text-xs font-semibold disabled:opacity-40 transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]"
            >
              <RotateCcw size={14} />
              New Return
            </button>
          )}
          {hasPermission('sales', 'add') && (
            <button
              onClick={() => {
                setIsReturnFormOpen(false)
                setIsSaleFormOpen(true)
              }}
              disabled={products.length === 0 || locations.length === 0}
              className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-black text-white hover:bg-gray-800 rounded-lg text-xs font-semibold disabled:opacity-40 transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              <Plus size={14} />
              New Sale
            </button>
          )}
        </div>
      </div>

      {/* Metrics Summary Strip */}
      <SalesMetricsStrip stats={stats} />

      {/* Tabs */}
      <div className="flex items-center border-b border-gray-200 mb-6">
        {(isSuperAdmin || hasPermission('sales', 'view')) && (
          <button
            onClick={() => handleTabChange('sales')}
            className={`pb-3 px-3.5 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 ${
              activeTab === 'sales' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-black'
            }`}
          >
            <ShoppingCart size={15} className="shrink-0" />
            <span>Sales</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-medium ${
                activeTab === 'sales' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {stats.salesCount}
            </span>
          </button>
        )}
        {(isSuperAdmin || hasPermission('returns', 'view')) && (
          <button
            onClick={() => handleTabChange('returns')}
            className={`pb-3 px-3.5 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 ${
              activeTab === 'returns' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-black'
            }`}
          >
            <RotateCcw size={15} className="shrink-0" />
            <span>Returns</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-medium ${
                activeTab === 'returns' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {stats.returnsCount}
            </span>
          </button>
        )}
      </div>

      {/* Filters (Date range + Category + Metal) */}
      <SalesFilterBar
        dateRangePreset={dateRangePreset}
        onPresetChange={(preset) => {
          setLoading(true)
          setDateRangePreset(preset)
        }}
        customStartDate={customStartDate}
        onCustomStartDateChange={(d) => {
          setLoading(true)
          setCustomStartDate(d)
        }}
        customEndDate={customEndDate}
        onCustomEndDateChange={(d) => {
          setLoading(true)
          setCustomEndDate(d)
        }}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        selectedMetal={selectedMetal}
        onMetalChange={setSelectedMetal}
      />

      {/* Record Sale Modal */}
      <RecordSaleModal
        isOpen={isSaleFormOpen}
        onClose={() => setIsSaleFormOpen(false)}
        products={products}
        locations={locations}
        locationMap={locationMap}
        saleLocationOptions={saleLocationOptions}
        saleProductOptions={saleProductOptions}
        isLocationLocked={isLocationLocked}
        userAssignedLocationId={userAssignedLocationId}
        adminLocationName={adminUser?.assignedLocationName}
        onSaleRecorded={handleSaleRecorded}
      />

      {/* Record Return Modal */}
      <RecordReturnModal
        isOpen={isReturnFormOpen}
        onClose={() => setIsReturnFormOpen(false)}
        products={products}
        locations={locations}
        locationMap={locationMap}
        returnLocationOptions={returnLocationOptions}
        saleProductOptions={saleProductOptions}
        isLocationLocked={isLocationLocked}
        userAssignedLocationId={userAssignedLocationId}
        adminLocationName={adminUser?.assignedLocationName}
        onReturnRecorded={handleReturnRecorded}
      />

      {/* Main Tables */}
      {loading ? (
        <SkeletonTable rows={6} columns={7} />
      ) : activeTab === 'sales' ? (
        <SalesBillsTable
          saleBills={saleBills}
          filteredSalesCount={filteredSales.length}
          totalSalesCount={stats.salesCount}
          expandedBillKeys={expandedBillKeys}
          onToggleBillExpand={toggleBillExpand}
          hasPermission={hasPermission}
          isSuperAdmin={isSuperAdmin}
          onOpenEditSale={setEditingSale}
          onReverseOrder={setReverseOrderTarget}
          onReverseTx={setDeleteTxTarget}
          onOpenSaleForm={() => {
            setIsReturnFormOpen(false)
            setIsSaleFormOpen(true)
          }}
          canAddSale={hasPermission('sales', 'add') && products.length > 0 && locations.length > 0}
          salesHasMore={salesHasMore}
          loadingMoreSales={loadingMoreSales}
          onLoadMoreSales={handleLoadMoreSales}
        />
      ) : (
        <ReturnsTable
          filteredReturns={filteredReturns}
          totalReturnsCount={stats.returnsCount}
          hasPermission={hasPermission}
          onReverseReturn={setDeleteTxTarget}
          returnsHasMore={returnsHasMore}
          loadingMoreReturns={loadingMoreReturns}
          onLoadMoreReturns={handleLoadMoreReturns}
          onOpenReturnForm={() => {
            setIsSaleFormOpen(false)
            setIsReturnFormOpen(true)
          }}
          canAddReturn={hasPermission('returns', 'add') && products.length > 0 && locations.length > 0}
        />
      )}

      {/* Reversal Confirmation Modal (Single Line Item / Return) */}
      <ConfirmModal
        isOpen={!!deleteTxTarget}
        title={`Reverse ${deleteTxTarget?.type === 'sale' ? 'Sale' : 'Return'}`}
        description={`Posting a reversing entry will invert its stock effect (${
          deleteTxTarget?.type === 'sale' ? 'restore sold stock back into location' : 'remove returned stock from location'
        }) without deleting audit history. This action cannot be undone. Continue?`}
        confirmText="Post Reversing Entry"
        onConfirm={executeDeleteTransaction}
        onClose={() => setDeleteTxTarget(null)}
      />

      {/* Order Reversal Modal (Complete Bill) */}
      <ConfirmModal
        isOpen={!!reverseOrderTarget}
        title="Reverse Sale Bill"
        description={`Posting a reversing entry will reverse bill ${reverseOrderTarget?.invoiceNo || ''} and all ${
          reverseOrderTarget?.items.length || 0
        } line item(s), restore all sold stock back into the location, and recalculate customer statistics. This action cannot be undone. Continue?`}
        confirmText={reversingOrder ? 'Reversing...' : 'Reverse Bill'}
        disabled={reversingOrder}
        onConfirm={handleConfirmReverseOrder}
        onClose={() => setReverseOrderTarget(null)}
      />

      {/* Super Admin Edit Sale Modal */}
      <EditSaleModal
        editingSale={editingSale}
        onClose={() => setEditingSale(null)}
        saleLocationOptions={saleLocationOptions}
        locationMap={locationMap}
        onSaleUpdated={handleSaleUpdated}
      />
    </div>
  )
}
