"use client"

import { useState, useEffect, useMemo } from 'react'
import {
  ShoppingCart,
  Plus,
  AlertCircle,
  X,
  Check,
  RotateCcw,
  IndianRupee,
  TrendingUp,
  PackageCheck,
  Lock,
  Calendar
} from 'lucide-react'
import { Product, Location, Transaction, ProductCategory, MetalType, TransactionStats } from '@/lib/types'
import {
  getProducts,
  getLocations,
  getTransactionsPage,
  getTransactionStats,
  recordTransaction,
  deleteTransaction
} from '@/lib/services/inventory.service'
import { ConfirmModal } from '@/components/confirm-modal'
import { EmptyState } from '@/components/empty-state'
import CustomSelect, { SelectOption } from '@/components/custom-select'
import CustomDatePicker from '@/components/custom-date-picker'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { EASE_OUT } from '@/components/motion-transitions'
import { usePermissions } from '@/lib/context/PermissionsContext'
import { formatWeight } from '@/lib/utils/weight'
import { getTodayIST, getDaysAgoIST } from '@/lib/utils/date'

const CATEGORIES: ProductCategory[] = ['Bullions', 'Idols']

type SalesTab = 'sales' | 'returns'

export default function AdminSales() {
  const { hasPermission, adminUser, isSuperAdmin } = usePermissions()
  const userAssignedLocationId = adminUser?.assignedLocationId
  const isLocationLocked = Boolean(!isSuperAdmin && userAssignedLocationId)
  const [activeTab, setActiveTab] = useState<SalesTab>('sales')
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

  const [stats, setStats] = useState<TransactionStats>({
    salesCount: 0,
    salesUnits: 0,
    salesRevenue: 0,
    returnsCount: 0,
    returnsUnits: 0,
    returnsAmount: 0,
    netRevenue: 0
  })
  const [loading, setLoading] = useState(true)

  // Sale form state
  const [isSaleFormOpen, setIsSaleFormOpen] = useState(false)
  const [saleProductId, setSaleProductId] = useState('')
  const [saleLocationId, setSaleLocationId] = useState('')
  const [saleQty, setSaleQty] = useState('1')
  const [salePieceWeight, setSalePieceWeight] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [saleCustomerName, setSaleCustomerName] = useState('')
  const [saleDate, setSaleDate] = useState(() => getTodayIST())
  const [saleNotes, setSaleNotes] = useState('')
  const [saleSubmitting, setSaleSubmitting] = useState(false)
  const [saleError, setSaleError] = useState<string | null>(null)

  // Return form state
  const [isReturnFormOpen, setIsReturnFormOpen] = useState(false)
  const [returnProductId, setReturnProductId] = useState('')
  const [returnLocationId, setReturnLocationId] = useState('')
  const [returnQty, setReturnQty] = useState('1')
  const [returnPieceWeight, setReturnPieceWeight] = useState('')
  const [returnPrice, setReturnPrice] = useState('')
  const [returnCustomerName, setReturnCustomerName] = useState('')
  const [returnDate, setReturnDate] = useState(() => getTodayIST())
  const [returnNotes, setReturnNotes] = useState('')
  const [returnSubmitting, setReturnSubmitting] = useState(false)
  const [returnError, setReturnError] = useState<string | null>(null)

  // Delete modal state
  const [deleteTxTarget, setDeleteTxTarget] = useState<Transaction | null>(null)

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

  // Helper map for locations
  const locationMap = useMemo(() => {
    const map = new Map<string, string>()
    locations.forEach((l) => map.set(l.id, l.name))
    return map
  }, [locations])

  // Filtered sales
  const filteredSales = useMemo(() => {
    return salesList.filter(
      (tx) =>
        (selectedCategory === 'All' || tx.category === selectedCategory) &&
        (selectedMetal === 'All' || tx.metal === selectedMetal)
    )
  }, [salesList, selectedCategory, selectedMetal])

  // Filtered returns
  const filteredReturns = useMemo(() => {
    return returnsList.filter(
      (tx) =>
        (selectedCategory === 'All' || tx.category === selectedCategory) &&
        (selectedMetal === 'All' || tx.metal === selectedMetal)
    )
  }, [returnsList, selectedCategory, selectedMetal])

  // Selected product in sale form
  const selectedSaleProduct = useMemo(() => {
    return products.find((p) => p.id === saleProductId)
  }, [products, saleProductId])

  // Stock available at selected location for sale form
  const availableStockAtSaleLocation = useMemo(() => {
    if (!selectedSaleProduct || !saleLocationId) return 0
    return selectedSaleProduct.stockByLocation?.[saleLocationId] || 0
  }, [selectedSaleProduct, saleLocationId])

  const saleProductOptions: SelectOption[] = useMemo(() => {
    return products
      .filter((p) => !p.isArchived)
      .map((p) => {
        const weightLabel = p.category === 'Idols' && p.weight && p.weight > 0 ? `~${formatWeight(p.weight)} avg` : formatWeight(p.weight)
        const brandLabel = p.brand ? ` · ${p.brand}` : ''
        return {
          value: p.id,
          label: p.name,
          sublabel: `${p.category}${brandLabel} · ${weightLabel} · ${p.sku}`,
          badge: `${p.stock} in stock`
        }
      })
  }, [products])

  const isSaleProductAnIdol = useMemo(() => {
    return selectedSaleProduct?.category === 'Idols'
  }, [selectedSaleProduct])

  const availableSalePieces = useMemo(() => {
    if (!selectedSaleProduct || !saleLocationId) return []
    return selectedSaleProduct.pieceWeightsByLocation?.[saleLocationId] || []
  }, [selectedSaleProduct, saleLocationId])

  const [prevSaleKey, setPrevSaleKey] = useState('')
  const saleKey = `${saleProductId}_${saleLocationId}_${availableSalePieces.join(',')}`
  if (saleKey !== prevSaleKey) {
    setPrevSaleKey(saleKey)
    if (isSaleProductAnIdol && availableSalePieces.length > 0) {
      if (!salePieceWeight || !availableSalePieces.includes(Number(salePieceWeight))) {
        setSalePieceWeight(String(availableSalePieces[0]))
      }
    } else if (isSaleProductAnIdol && availableSalePieces.length === 0) {
      setSalePieceWeight('')
    }
  }

  const selectedReturnProduct = useMemo(() => {
    return products.find((p) => p.id === returnProductId)
  }, [products, returnProductId])

  const isReturnProductAnIdol = useMemo(() => {
    return selectedReturnProduct?.category === 'Idols'
  }, [selectedReturnProduct])

  const saleLocationOptions: SelectOption[] = useMemo(() => {
    return locations.map((l) => {
      const stock = selectedSaleProduct?.stockByLocation?.[l.id] || 0
      return {
        value: l.id,
        label: l.name,
        badge: `${stock} available`
      }
    })
  }, [locations, selectedSaleProduct])

  const returnLocationOptions: SelectOption[] = useMemo(() => {
    return locations.map((l) => ({
      value: l.id,
      label: l.name
    }))
  }, [locations])

  // Open Sale modal
  const handleOpenSaleForm = () => {
    const firstP = products.find((p) => p.stock > 0) || products[0]
    setSaleProductId(firstP?.id || '')
    // Default and lock to assigned store if staff has an assignment
    let defaultLoc = userAssignedLocationId || locations[0]?.id || ''
    if (!userAssignedLocationId && firstP?.stockByLocation) {
      const locWithStock = Object.keys(firstP.stockByLocation).find((id) => (firstP.stockByLocation[id] || 0) > 0)
      if (locWithStock) defaultLoc = locWithStock
    }
    setSaleLocationId(defaultLoc)
    setSaleQty('1')
    setSalePieceWeight('')
    setSalePrice('')
    setSaleCustomerName('')
    setSaleDate(getTodayIST())
    setSaleNotes('')
    setSaleError(null)
    setIsSaleFormOpen(true)
  }

  // Open Return modal
  const handleOpenReturnForm = () => {
    setReturnProductId(products[0]?.id || '')
    // Default and lock to assigned store if staff has an assignment
    setReturnLocationId(userAssignedLocationId || locations[0]?.id || '')
    setReturnQty('1')
    setReturnPieceWeight('')
    setReturnPrice('')
    setReturnCustomerName('')
    setReturnDate(getTodayIST())
    setReturnNotes('')
    setReturnError(null)
    setIsReturnFormOpen(true)
  }

  // Submit Sale
  const handleSaveSale = async (e: React.FormEvent) => {
    e.preventDefault()
    const prod = products.find((p) => p.id === saleProductId)
    if (!prod) {
      setSaleError('Please select a valid product')
      return
    }
    const effectiveLocId = isLocationLocked && userAssignedLocationId ? userAssignedLocationId : saleLocationId
    if (!effectiveLocId) {
      setSaleError('Please select a selling location')
      return
    }

    const isIdol = prod.category === 'Idols'
    if (isIdol && !salePieceWeight) {
      setSaleError('Please select which specific piece weight is being sold')
      return
    }
    const qty = isIdol ? 1 : Number(saleQty)

    if (isNaN(qty) || qty <= 0) {
      setSaleError('Quantity must be at least 1')
      return
    }

    if (!salePrice || isNaN(Number(salePrice)) || Number(salePrice) <= 0) {
      setSaleError('Selling price per unit is required and must be greater than ₹0')
      return
    }

    const stockAvailable = prod.stockByLocation?.[effectiveLocId] || 0
    if (qty > stockAvailable) {
      setSaleError(`Insufficient stock at this location. Available: ${stockAvailable}, Requested: ${qty}`)
      return
    }

    setSaleSubmitting(true)
    setSaleError(null)

    try {
      const locName = locationMap.get(effectiveLocId) || adminUser?.assignedLocationName || ''
      const { transaction: createdTx } = await recordTransaction({
        type: 'sale',
        productId: prod.id,
        productName: prod.name,
        category: prod.category,
        brand: prod.brand,
        metal: prod.metal,
        quantity: qty,
        pieceWeight: isIdol ? Number(salePieceWeight) : undefined,
        price: Number(salePrice),
        locationId: effectiveLocId,
        locationName: locName,
        customerName: saleCustomerName,
        date: saleDate,
        notes: saleNotes
      })
      setIsSaleFormOpen(false)
      toast.success('Sale recorded successfully')

      // Optimistically update local transactions & product stock without network reloads
      setSalesList((prev) => [createdTx, ...prev])
      const saleAmt = (Number(salePrice) || 0) * qty
      setStats((prev) => ({
        ...prev,
        salesCount: prev.salesCount + 1,
        salesUnits: prev.salesUnits + qty,
        salesRevenue: prev.salesRevenue + saleAmt,
        netRevenue: prev.netRevenue + saleAmt
      }))
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== prod.id) return p
          const currentLocStock = p.stockByLocation?.[effectiveLocId] || 0
          const updatedLocStock = Math.max(0, currentLocStock - qty)
          const updatedStockByLoc = { ...p.stockByLocation, [effectiveLocId]: updatedLocStock }
          const updatedTotalStock = Math.max(0, (p.stock || 0) - qty)

          let updatedPieces = p.pieceWeights
          let updatedPiecesByLoc = p.pieceWeightsByLocation
          if (isIdol && salePieceWeight) {
            const soldWeight = Number(salePieceWeight)
            const locPieces = p.pieceWeightsByLocation?.[effectiveLocId] || []
            const idxInLoc = locPieces.indexOf(soldWeight)
            const newLocPieces = idxInLoc >= 0 ? [...locPieces.slice(0, idxInLoc), ...locPieces.slice(idxInLoc + 1)] : locPieces
            updatedPiecesByLoc = { ...p.pieceWeightsByLocation, [effectiveLocId]: newLocPieces }

            const allPieces = p.pieceWeights || []
            const idxInAll = allPieces.indexOf(soldWeight)
            updatedPieces = idxInAll >= 0 ? [...allPieces.slice(0, idxInAll), ...allPieces.slice(idxInAll + 1)] : allPieces
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record sale'
      setSaleError(msg)
      toast.error(msg)
    } finally {
      setSaleSubmitting(false)
    }
  }

  // Submit Return
  const handleSaveReturn = async (e: React.FormEvent) => {
    e.preventDefault()
    const prod = products.find((p) => p.id === returnProductId)
    if (!prod) {
      setReturnError('Please select a product')
      return
    }
    const effectiveLocId = isLocationLocked && userAssignedLocationId ? userAssignedLocationId : returnLocationId
    if (!effectiveLocId) {
      setReturnError('Please select a location to receive the return')
      return
    }

    const isIdol = prod.category === 'Idols'
    if (isIdol) {
      const numW = Number(returnPieceWeight)
      if (isNaN(numW) || numW <= 0) {
        setReturnError('Please enter the returned piece weight in grams')
        return
      }
    }
    const qty = isIdol ? 1 : Number(returnQty)

    if (isNaN(qty) || qty <= 0) {
      setReturnError('Quantity must be at least 1')
      return
    }

    setReturnSubmitting(true)
    setReturnError(null)

    try {
      const locName = locationMap.get(effectiveLocId) || adminUser?.assignedLocationName || ''
      const { transaction: createdTx } = await recordTransaction({
        type: 'return',
        productId: prod.id,
        productName: prod.name,
        category: prod.category,
        brand: prod.brand,
        metal: prod.metal,
        quantity: qty,
        pieceWeight: isIdol ? Number(returnPieceWeight) : undefined,
        price: returnPrice ? Number(returnPrice) : undefined,
        locationId: effectiveLocId,
        locationName: locName,
        customerName: returnCustomerName,
        date: returnDate,
        notes: returnNotes
      })
      setIsReturnFormOpen(false)
      toast.success('Return recorded and restocked successfully')

      // Optimistically update local transactions & product stock
      setReturnsList((prev) => [createdTx, ...prev])
      const retAmt = (Number(returnPrice) || 0) * qty
      setStats((prev) => ({
        ...prev,
        returnsCount: prev.returnsCount + 1,
        returnsUnits: prev.returnsUnits + qty,
        returnsAmount: prev.returnsAmount + retAmt,
        netRevenue: prev.netRevenue - retAmt
      }))
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== prod.id) return p
          const currentLocStock = p.stockByLocation?.[effectiveLocId] || 0
          const updatedLocStock = currentLocStock + qty
          const updatedStockByLoc = { ...p.stockByLocation, [effectiveLocId]: updatedLocStock }
          const updatedTotalStock = (p.stock || 0) + qty

          let updatedPieces = p.pieceWeights
          let updatedPiecesByLoc = p.pieceWeightsByLocation
          if (isIdol && returnPieceWeight) {
            const retWeight = Number(returnPieceWeight)
            const locPieces = p.pieceWeightsByLocation?.[effectiveLocId] || []
            updatedPiecesByLoc = { ...p.pieceWeightsByLocation, [effectiveLocId]: [...locPieces, retWeight] }
            const allPieces = p.pieceWeights || []
            updatedPieces = [...allPieces, retWeight]
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record return'
      setReturnError(msg)
      toast.error(msg)
    } finally {
      setReturnSubmitting(false)
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
          netRevenue: Math.max(0, prev.netRevenue - targetTotal)
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
          netRevenue: prev.netRevenue + targetTotal
        }))
      }

      // Reverse stock on product locally
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
          <p className="text-gray-500 text-sm">
            Customer sales and returns.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasPermission('returns', 'add') && (
            <button
              onClick={handleOpenReturnForm}
              disabled={products.length === 0 || locations.length === 0}
              className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 hover:text-black hover:bg-gray-50 rounded-lg text-xs font-semibold disabled:opacity-40 transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]"
            >
              <RotateCcw size={14} />
              New Return
            </button>
          )}
          {hasPermission('sales', 'add') && (
            <button
              onClick={handleOpenSaleForm}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs uppercase font-semibold tracking-wider">Gross Sales</span>
            <IndianRupee size={16} className="text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-black tabular-nums">
            ₹{stats.salesRevenue.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-gray-400 mt-1">{stats.salesCount} sales</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs uppercase font-semibold tracking-wider">Units Sold</span>
            <PackageCheck size={16} className="text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-black tabular-nums">
            {stats.salesUnits.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-gray-400 mt-1">units dispatched</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs uppercase font-semibold tracking-wider">Returns</span>
            <RotateCcw size={16} className="text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-black tabular-nums">
            ₹{stats.returnsAmount.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-gray-400 mt-1">{stats.returnsCount} returns</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs uppercase font-semibold tracking-wider">Net Sales</span>
            <TrendingUp size={16} className="text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-black tabular-nums">
            ₹{stats.netRevenue.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-gray-400 mt-1">Sales minus returns</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-gray-200 mb-6">
        {(isSuperAdmin || hasPermission('sales', 'view')) && (
          <button
            onClick={() => {
              setActiveTab('sales')
              setIsSaleFormOpen(false)
              setIsReturnFormOpen(false)
            }}
            className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 ${activeTab === 'sales'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
              }`}
          >
            <ShoppingCart size={16} />
            Sales ({stats.salesCount})
          </button>
        )}
        {(isSuperAdmin || hasPermission('returns', 'view')) && (
          <button
            onClick={() => {
              setActiveTab('returns')
              setIsSaleFormOpen(false)
              setIsReturnFormOpen(false)
            }}
            className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 ${activeTab === 'returns'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
              }`}
          >
            <RotateCcw size={16} />
            Returns ({stats.returnsCount})
          </button>
        )}
      </div>

      {/* Date Range Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 mb-6 bg-white border border-gray-200 rounded-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 mr-1">
            <Calendar size={14} className="text-gray-400" />
            Date Range:
          </span>
          {([
            { id: 'all', label: 'All Dates' },
            { id: 'today', label: 'Today' },
            { id: 'week', label: 'Last 7 Days' },
            { id: 'month', label: 'Last 30 Days' },
            { id: 'custom', label: 'Custom' },
          ] as const).map((preset) => (
            <button
              key={preset.id}
              onClick={() => {
                setLoading(true)
                setDateRangePreset(preset.id)
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${dateRangePreset === preset.id
                ? 'bg-black text-white border border-black shadow-xs'
                : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-black'
                }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {dateRangePreset === 'custom' && (
          <div className="flex items-center gap-2">
            <div className="w-36">
              <CustomDatePicker
                value={customStartDate}
                onChange={(d) => {
                  setLoading(true)
                  setCustomStartDate(d)
                }}
                placeholder="Start Date"
              />
            </div>
            <span className="text-xs text-gray-400">to</span>
            <div className="w-36">
              <CustomDatePicker
                value={customEndDate}
                onChange={(d) => {
                  setLoading(true)
                  setCustomEndDate(d)
                }}
                placeholder="End Date"
              />
            </div>
          </div>
        )}
      </div>

      {/* Category & Metal Filter Squircles */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Category:</span>
          <button
            onClick={() => setSelectedCategory('All')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${selectedCategory === 'All'
              ? 'bg-black text-white border border-black shadow-xs'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
              }`}
          >
            All Categories
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${selectedCategory === cat
                ? 'bg-black text-white border border-black shadow-xs'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Metal:</span>
          {(['All', 'Gold', 'Silver'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMetal(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${selectedMetal === m
                ? 'bg-black text-white border border-black shadow-xs'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                }`}
            >
              {m === 'All' ? 'All' : m}
            </button>
          ))}
        </div>
      </div>

      {/* Record Sale Modal / Card */}
      <AnimatePresence>
        {isSaleFormOpen && (
          <motion.div
            initial={{ opacity: 0, transform: "scale(0.97) translateY(8px)" }}
            animate={{ opacity: 1, transform: "scale(1) translateY(0px)" }}
            exit={{ opacity: 0, transform: "scale(0.97) translateY(8px)" }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm"
          >
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-black">Record Customer Sale</h2>
              <button
                onClick={() => setIsSaleFormOpen(false)}
                className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97]"
              >
                <X size={18} />
              </button>
            </div>

            {saleError && (
              <div className="mb-4 p-3 bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle size={14} className="text-gray-600" />
                {saleError}
              </div>
            )}

            <form onSubmit={handleSaveSale} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Select Product <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect
                    value={saleProductId}
                    onValueChange={setSaleProductId}
                    options={saleProductOptions}
                    placeholder="Select product to sell..."
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                      Fulfill from Location <span className="text-red-500">*</span>
                    </label>
                    {isLocationLocked && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                        <Lock className="w-3 h-3 text-gray-500" />
                        Assigned Store
                      </span>
                    )}
                  </div>
                  {isLocationLocked ? (
                    <div className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-black flex items-center justify-between">
                      <span className="font-semibold text-black">
                        {locationMap.get(saleLocationId) || adminUser?.assignedLocationName || 'Assigned Location'}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">
                        Default & Locked
                      </span>
                    </div>
                  ) : (
                    <CustomSelect
                      value={saleLocationId}
                      onValueChange={setSaleLocationId}
                      options={saleLocationOptions}
                      placeholder="Select selling location..."
                    />
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    Available at selected location:{' '}
                    <strong className={availableStockAtSaleLocation > 0 ? 'text-black' : 'text-gray-400'}>
                      {availableStockAtSaleLocation} units
                    </strong>
                  </div>
                </div>
              </div>

              {/* Idol Piece Selection for Sale */}
              {isSaleProductAnIdol && (
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                      Select Piece Weight to Sell <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-gray-500 font-medium">
                      {availableSalePieces.length} available at this location
                    </span>
                  </div>
                  {availableSalePieces.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                      {availableSalePieces.map((pw, i) => (
                        <button
                          key={`${pw}-${i}`}
                          type="button"
                          onClick={() => setSalePieceWeight(String(pw))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${String(salePieceWeight) === String(pw)
                            ? 'bg-black text-white shadow-xs'
                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                          #{i + 1}: {formatWeight(pw)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-black font-semibold">
                      No idol pieces in stock at this location.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                      Quantity Sold <span className="text-red-500">*</span>
                    </label>
                    {isSaleProductAnIdol && salePieceWeight && (
                      <span className="text-[11px] font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                        Piece: {formatWeight(salePieceWeight)}
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    min="1"
                    max={availableStockAtSaleLocation}
                    disabled={isSaleProductAnIdol}
                    value={isSaleProductAnIdol ? '1' : saleQty}
                    onChange={(e) => setSaleQty(e.target.value)}
                    className={`w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150 ${isSaleProductAnIdol ? 'bg-gray-100 cursor-not-allowed font-semibold' : ''
                      }`}
                    required
                  />
                  {isSaleProductAnIdol && (
                    <p className="text-[11px] text-gray-500 mt-1">
                      Idols are sold 1 unique piece at a time.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Selling Price per Unit (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="e.g. 78500"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Sale Date <span className="text-red-500">*</span>
                  </label>
                  <CustomDatePicker
                    value={saleDate}
                    onChange={setSaleDate}
                    placeholder="Select sale date"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Customer Name / Entity
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rajesh Kumar / Sterling Jewellers"
                    value={saleCustomerName}
                    onChange={(e) => setSaleCustomerName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Invoice / Reference / Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Tax Invoice #INV-2026-081"
                    value={saleNotes}
                    onChange={(e) => setSaleNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSaleFormOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saleSubmitting || availableStockAtSaleLocation === 0}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                >
                  <Check size={16} />
                  {saleSubmitting ? 'Recording...' : 'Complete Sale & Deduct Stock'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Record Return Modal / Card */}
      <AnimatePresence>
        {isReturnFormOpen && (
          <motion.div
            initial={{ opacity: 0, transform: "scale(0.97) translateY(8px)" }}
            animate={{ opacity: 1, transform: "scale(1) translateY(0px)" }}
            exit={{ opacity: 0, transform: "scale(0.97) translateY(8px)" }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm"
          >
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-black">Record Customer Return (Restock)</h2>
              <button
                onClick={() => setIsReturnFormOpen(false)}
                className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97]"
              >
                <X size={18} />
              </button>
            </div>

            {returnError && (
              <div className="mb-4 p-3 bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle size={14} className="text-gray-600" />
                {returnError}
              </div>
            )}

            <form onSubmit={handleSaveReturn} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Select Product <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect
                    value={returnProductId}
                    onValueChange={setReturnProductId}
                    options={saleProductOptions}
                    placeholder="Select product..."
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                      Restock into Location <span className="text-red-500">*</span>
                    </label>
                    {isLocationLocked && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                        <Lock className="w-3 h-3 text-gray-500" />
                        Assigned Store
                      </span>
                    )}
                  </div>
                  {isLocationLocked ? (
                    <div className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-black flex items-center justify-between">
                      <span className="font-semibold text-black">
                        {locationMap.get(returnLocationId) || adminUser?.assignedLocationName || 'Assigned Location'}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">
                        Default & Locked
                      </span>
                    </div>
                  ) : (
                    <CustomSelect
                      value={returnLocationId}
                      onValueChange={setReturnLocationId}
                      options={returnLocationOptions}
                      placeholder="Select location to restock..."
                    />
                  )}
                </div>
              </div>

              {/* Idol Piece Weight for Return */}
              {isReturnProductAnIdol && (
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Returned Piece Weight (Grams) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    placeholder="e.g. 48.250"
                    value={returnPieceWeight}
                    onChange={(e) => setReturnPieceWeight(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                    required
                  />
                  <p className="text-xs text-gray-500">
                    This weight will be registered back into the idol inventory at the restocked location.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Quantity Returned <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    disabled={isReturnProductAnIdol}
                    value={isReturnProductAnIdol ? '1' : returnQty}
                    onChange={(e) => setReturnQty(e.target.value)}
                    className={`w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150 ${isReturnProductAnIdol ? 'bg-gray-100 cursor-not-allowed font-semibold' : ''
                      }`}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Refund Price per Unit (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 78500"
                    value={returnPrice}
                    onChange={(e) => setReturnPrice(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Return Date
                  </label>
                  <CustomDatePicker
                    value={returnDate}
                    onChange={setReturnDate}
                    placeholder="Select return date"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh Shah"
                    value={returnCustomerName}
                    onChange={(e) => setReturnCustomerName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Return Reason / Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Exchange for higher weight / seal intact"
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReturnFormOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={returnSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                >
                  <Check size={16} />
                  {returnSubmitting ? 'Recording...' : 'Accept Return & Add Stock'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Tables */}
      {loading ? (
        <div className="flex justify-center items-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
        </div>
      ) : activeTab === 'sales' ? (
        filteredSales.length === 0 ? (
          <EmptyState
            title="No sales recorded"
            description="When you record a customer sale, stock is automatically decremented from the chosen physical location."
            action={
              hasPermission('sales', 'add') ? (
                <button
                  onClick={handleOpenSaleForm}
                  disabled={products.length === 0 || locations.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                >
                  <Plus size={16} />
                  Record First Sale
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase font-semibold text-gray-500 tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Date</th>
                    <th className="px-6 py-3.5">Customer</th>
                    <th className="px-6 py-3.5">Product</th>
                    <th className="px-6 py-3.5">Metal</th>
                    <th className="px-6 py-3.5">Category</th>
                    <th className="px-6 py-3.5">Location</th>
                    <th className="px-6 py-3.5 text-right">Quantity</th>
                    <th className="px-6 py-3.5 text-right">Unit Price</th>
                    <th className="px-6 py-3.5 text-right">Total (₹)</th>
                    <th className="px-6 py-3.5">Notes</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSales.map((tx) => {
                    const totalVal = tx.price ? tx.price * tx.quantity : 0
                    return (
                      <tr key={tx.id} className="hover:bg-gray-50/70 transition-[background-color] duration-100">
                        <td className="px-6 py-4 text-xs font-mono text-gray-500">
                          {tx.date}
                        </td>
                        <td className="px-6 py-4 font-semibold text-black">
                          {tx.customerName || <span className="text-gray-300 italic">—</span>}
                        </td>
                        <td className="px-6 py-4 font-semibold text-black">
                          {tx.productName}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border border-gray-200 text-gray-700 bg-gray-50">
                            {tx.metal || 'Silver'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-600">
                          {tx.category}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          {tx.locationName}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums font-semibold text-black">
                          −{tx.quantity}
                          {tx.pieceWeight && (
                            <div className="text-[11px] font-mono text-gray-500">
                              ({formatWeight(tx.pieceWeight)})
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums text-gray-600">
                          {tx.price ? `₹${tx.price.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums font-bold text-black">
                          {totalVal > 0 ? `₹${totalVal.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500 max-w-xs truncate">
                          {tx.notes || '—'}
                          {tx.isReversed && (
                            <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              Reversed
                            </span>
                          )}
                          {tx.reversalOf && (
                            <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                              Reversal
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {hasPermission('sales', 'delete') && !tx.isReversed && !tx.reversalOf && (
                            <button
                              onClick={() => setDeleteTxTarget(tx)}
                              title="Post reversing entry (restores stock)"
                              className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Load More Controls */}
            <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
              <span className="font-mono">
                Showing <strong className="text-black font-semibold">{filteredSales.length}</strong> of{' '}
                <strong className="text-black font-semibold">{stats.salesCount}</strong> recorded sales
              </span>
              {salesHasMore ? (
                <button
                  onClick={handleLoadMoreSales}
                  disabled={loadingMoreSales}
                  className="h-9 px-4 inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-800 hover:text-black hover:bg-gray-50 rounded-lg text-xs font-semibold shadow-xs transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] disabled:opacity-50"
                >
                  {loadingMoreSales ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      Loading more...
                    </>
                  ) : (
                    'Load More Sales'
                  )}
                </button>
              ) : (
                <span className="text-[11px] text-gray-400 font-mono">
                  {filteredSales.length > 0 ? 'All sales loaded' : ''}
                </span>
              )}
            </div>
          </div>
        )
      ) : (
        /* Returns Tab */
        filteredReturns.length === 0 ? (
          <EmptyState
            title="No returns recorded"
            description="Returns restore items back into stock at your chosen location and track customer refund amounts."
            action={
              hasPermission('returns', 'add') ? (
                <button
                  onClick={handleOpenReturnForm}
                  disabled={products.length === 0 || locations.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                >
                  <RotateCcw size={16} />
                  Record First Return
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase font-semibold text-gray-500 tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Date</th>
                    <th className="px-6 py-3.5">Customer</th>
                    <th className="px-6 py-3.5">Product</th>
                    <th className="px-6 py-3.5">Metal</th>
                    <th className="px-6 py-3.5">Category</th>
                    <th className="px-6 py-3.5">Restocked At</th>
                    <th className="px-6 py-3.5 text-right">Quantity</th>
                    <th className="px-6 py-3.5 text-right">Refund Unit Price</th>
                    <th className="px-6 py-3.5 text-right">Total Refund (₹)</th>
                    <th className="px-6 py-3.5">Notes</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredReturns.map((tx) => {
                    const totalVal = tx.price ? tx.price * tx.quantity : 0
                    return (
                      <tr key={tx.id} className="hover:bg-gray-50/70 transition-[background-color] duration-100">
                        <td className="px-6 py-4 text-xs font-mono text-gray-500">
                          {tx.date}
                        </td>
                        <td className="px-6 py-4 font-semibold text-black">
                          {tx.customerName || <span className="text-gray-300 italic">—</span>}
                        </td>
                        <td className="px-6 py-4 font-semibold text-black">
                          {tx.productName}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border border-gray-200 text-gray-700 bg-gray-50">
                            {tx.metal || 'Silver'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-600">
                          {tx.category}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          {tx.locationName}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums font-semibold text-black">
                          +{tx.quantity}
                          {tx.pieceWeight && (
                            <div className="text-[11px] font-mono text-gray-500">
                              ({formatWeight(tx.pieceWeight)})
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums text-gray-600">
                          {tx.price ? `₹${tx.price.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums font-bold text-black">
                          {totalVal > 0 ? `₹${totalVal.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500 max-w-xs truncate">
                          {tx.notes || '—'}
                          {tx.isReversed && (
                            <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              Reversed
                            </span>
                          )}
                          {tx.reversalOf && (
                            <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                              Reversal
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {hasPermission('returns', 'delete') && !tx.isReversed && !tx.reversalOf && (
                            <button
                              onClick={() => setDeleteTxTarget(tx)}
                              title="Post reversing entry (reverses restock)"
                              className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Load More Controls */}
            <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
              <span className="font-mono">
                Showing <strong className="text-black font-semibold">{filteredReturns.length}</strong> of{' '}
                <strong className="text-black font-semibold">{stats.returnsCount}</strong> recorded returns
              </span>
              {returnsHasMore ? (
                <button
                  onClick={handleLoadMoreReturns}
                  disabled={loadingMoreReturns}
                  className="h-9 px-4 inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-800 hover:text-black hover:bg-gray-50 rounded-lg text-xs font-semibold shadow-xs transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] disabled:opacity-50"
                >
                  {loadingMoreReturns ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      Loading more...
                    </>
                  ) : (
                    'Load More Returns'
                  )}
                </button>
              ) : (
                <span className="text-[11px] text-gray-400 font-mono">
                  {filteredReturns.length > 0 ? 'All returns loaded' : ''}
                </span>
              )}
            </div>
          </div>
        )
      )}

      {/* Reversal Modal */}
      <ConfirmModal
        isOpen={!!deleteTxTarget}
        title={`Reverse ${deleteTxTarget?.type === 'sale' ? 'Sale' : 'Return'}`}
        description={`Posting a reversing entry will invert its stock effect (${deleteTxTarget?.type === 'sale' ? 'restore sold stock back into location' : 'remove returned stock from location'
          }) without deleting audit history. This action cannot be undone. Continue?`}
        confirmText="Post Reversing Entry"
        onConfirm={executeDeleteTransaction}
        onClose={() => setDeleteTxTarget(null)}
      />
    </div>
  )
}
