"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ShoppingCart,
  Plus,
  AlertCircle,
  X,
  RotateCcw,
  IndianRupee,
  TrendingUp,
  PackageCheck,
  Lock,
  Calendar,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  ExternalLink
} from 'lucide-react'

export interface SaleLineItem {
  id: string
  productId: string
  quantity: string
  price: string
  pieceWeight?: string
}

export interface SaleBill {
  billKey: string
  invoiceNo: string
  orderId?: string
  date: string
  customerName: string
  customerId?: string
  locationName: string
  locationId: string
  items: Transaction[]
  totalQuantity: number
  totalAmount: number
  paymentModes?: string[]
  hasReversed: boolean
  hasActive: boolean
}

function formatDateDisplay(rawDate?: string) {
  if (!rawDate) return '—'
  const parts = rawDate.split('-')
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    }
  }
  return rawDate
}

import { Product, Location, Transaction, ProductCategory, MetalType, TransactionStats, Customer, Order, OrderPayment } from '@/lib/types'
import CustomerPicker from '@/components/customer-picker'
import PaymentSplit from '@/components/payment-split'
import { rupeesToPaise } from '@/lib/utils/money'
import { gramsToMg } from '@/lib/utils/weight'
import {
  getProducts,
  getLocations,
  getTransactionsPage,
  getTransactionStats,
  recordTransaction,
  deleteTransaction,
  updateTransaction
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
import { SkeletonTable } from '@/components/ui/skeleton'

const CATEGORIES: ProductCategory[] = ['Bullions', 'Idols']

type SalesTab = 'sales' | 'returns'

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

  // Sale form state (multi-item)
  const [isSaleFormOpen, setIsSaleFormOpen] = useState(false)
  const [saleLocationId, setSaleLocationId] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [isWalkInCustomer, setIsWalkInCustomer] = useState(false)
  const [salePayments, setSalePayments] = useState<OrderPayment[]>([])
  const [isPaymentBalanced, setIsPaymentBalanced] = useState(false)
  const [ordersList, setOrdersList] = useState<Order[]>([])
  const [reverseOrderTarget, setReverseOrderTarget] = useState<SaleBill | null>(null)
  const [reversingOrder, setReversingOrder] = useState(false)
  const [saleDate, setSaleDate] = useState(() => getTodayIST())
  const [saleNotes, setSaleNotes] = useState('')
  const [saleItems, setSaleItems] = useState<SaleLineItem[]>([
    { id: '1', productId: '', quantity: '1', price: '', pieceWeight: '' }
  ])
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

  // Edit Sale modal state (Super Admin only)
  const [editingSale, setEditingSale] = useState<Transaction | null>(null)
  const [editSaleDate, setEditSaleDate] = useState('')
  const [editSaleLocationId, setEditSaleLocationId] = useState('')
  const [editSaleQuantity, setEditSaleQuantity] = useState('1')
  const [editSalePrice, setEditSalePrice] = useState('')
  const [editSaleCustomerName, setEditSaleCustomerName] = useState('')
  const [editSaleNotes, setEditSaleNotes] = useState('')
  const [editSaleSubmitting, setEditSaleSubmitting] = useState(false)
  const [editSaleError, setEditSaleError] = useState<string | null>(null)

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

          fetch('/api/admin/orders?limit=100')
            .then((r) => (r.ok ? r.json() : null))
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

  // Orders map for fast lookup
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

  // Filtered returns
  const filteredReturns = useMemo(() => {
    return returnsList.filter(
      (tx) =>
        (selectedCategory === 'All' || tx.category === selectedCategory) &&
        (selectedMetal === 'All' || tx.metal === selectedMetal)
    )
  }, [returnsList, selectedCategory, selectedMetal])

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
        const weightLabel = p.category === 'Idols' && p.weight && p.weight > 0 ? `~${formatWeight(p.weight)} avg` : formatWeight(p.weight)
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

  const saleTotals = useMemo(() => {
    let totalUnits = 0
    let totalWeightGrams = 0
    let grandTotal = 0

    saleItems.forEach((item) => {
      const prod = products.find((p) => p.id === item.productId)
      const qty = Number(item.quantity) || 0
      const price = Number(item.price) || 0
      totalUnits += qty
      grandTotal += qty * price

      if (prod) {
        if (prod.category === 'Idols' && item.pieceWeight) {
          totalWeightGrams += Number(item.pieceWeight) || 0
        } else if (prod.weight) {
          totalWeightGrams += prod.weight * qty
        }
      }
    })

    return { totalUnits, totalWeightGrams, grandTotal }
  }, [saleItems, products])

  const saleTotalsPaise = useMemo(() => {
    return rupeesToPaise(saleTotals.grandTotal)
  }, [saleTotals.grandTotal])

  const selectedReturnProduct = useMemo(() => {
    return products.find((p) => p.id === returnProductId)
  }, [products, returnProductId])

  const isReturnProductAnIdol = useMemo(() => {
    return selectedReturnProduct?.category === 'Idols'
  }, [selectedReturnProduct])

  // Form completion validation states
  const isSaleFormValid = useMemo(() => {
    const effectiveLocId = isLocationLocked && userAssignedLocationId ? userAssignedLocationId : saleLocationId
    if (!effectiveLocId || !saleDate.trim() || saleItems.length === 0) return false
    if (!selectedCustomer && !isWalkInCustomer) return false
    if (!isPaymentBalanced || salePayments.length === 0) return false

    const requiredStockPerProduct: Record<string, number> = {}
    const chosenPiecesPerProduct: Record<string, Set<number>> = {}

    for (const item of saleItems) {
      if (!item.productId.trim()) return false
      const prod = products.find((p) => p.id === item.productId)
      if (!prod) return false

      const isIdol = prod.category === 'Idols'
      if (isIdol && !item.pieceWeight) return false

      const qty = isIdol ? 1 : Number(item.quantity)
      if (isNaN(qty) || qty <= 0) return false

      const unitPrice = Number(item.price)
      if (isNaN(unitPrice) || unitPrice <= 0) return false

      if (isIdol && item.pieceWeight) {
        const pw = Number(item.pieceWeight)
        if (!chosenPiecesPerProduct[prod.id]) {
          chosenPiecesPerProduct[prod.id] = new Set()
        }
        if (chosenPiecesPerProduct[prod.id].has(pw)) return false
        chosenPiecesPerProduct[prod.id].add(pw)
      }

      requiredStockPerProduct[prod.id] = (requiredStockPerProduct[prod.id] || 0) + qty
      const available = prod.stockByLocation?.[effectiveLocId] || 0
      if (requiredStockPerProduct[prod.id] > available) return false
    }

    return true
  }, [
    isLocationLocked,
    userAssignedLocationId,
    saleLocationId,
    saleDate,
    saleItems,
    products,
    selectedCustomer,
    isWalkInCustomer,
    isPaymentBalanced,
    salePayments
  ])

  const isReturnFormValid = useMemo(() => {
    const effectiveLocId = isLocationLocked && userAssignedLocationId ? userAssignedLocationId : returnLocationId
    if (!effectiveLocId || !returnProductId.trim() || !returnDate.trim()) return false
    const prod = products.find((p) => p.id === returnProductId)
    if (!prod) return false
    const isIdol = prod.category === 'Idols'
    if (isIdol) {
      const numW = Number(returnPieceWeight)
      if (isNaN(numW) || numW <= 0) return false
    } else {
      const q = Number(returnQty)
      if (isNaN(q) || q <= 0) return false
    }
    if (returnPrice.trim()) {
      const p = Number(returnPrice)
      if (isNaN(p) || p < 0) return false
    }
    return true
  }, [isLocationLocked, userAssignedLocationId, returnLocationId, returnProductId, returnDate, products, returnPieceWeight, returnQty, returnPrice])

  const isEditSaleValid = useMemo(() => {
    if (!editSaleDate.trim() || !editSaleLocationId.trim() || !editSalePrice.trim()) return false
    const q = Number(editSaleQuantity)
    if (isNaN(q) || q < 1) return false
    const p = Number(editSalePrice)
    if (isNaN(p) || p < 0) return false
    return true
  }, [editSaleDate, editSaleLocationId, editSaleQuantity, editSalePrice])

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

  // Open Sale modal (multi-item)
  const handleOpenSaleForm = () => {
    setSaleLocationId(isLocationLocked && userAssignedLocationId ? userAssignedLocationId : '')
    setSelectedCustomer(null)
    setIsWalkInCustomer(false)
    setSalePayments([])
    setIsPaymentBalanced(false)
    setSaleDate(getTodayIST())
    setSaleNotes('')
    setSaleError(null)

    setSaleItems([
      {
        id: String(Date.now()),
        productId: '',
        quantity: '',
        price: '',
        pieceWeight: ''
      }
    ])
    setIsSaleFormOpen(true)
  }

  const handleAddSaleItem = () => {
    setSaleItems((prev) => [
      ...prev,
      {
        id: String(Date.now() + Math.random()),
        productId: '',
        quantity: '',
        price: '',
        pieceWeight: ''
      }
    ])
  }

  const handleRemoveSaleItem = (id: string) => {
    setSaleItems((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((item) => item.id !== id)
    })
  }

  const handleUpdateSaleItem = (id: string, updates: Partial<SaleLineItem>) => {
    setSaleItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const updated = { ...item, ...updates }
        if (updates.productId && updates.productId !== item.productId) {
          const newProd = products.find((p) => p.id === updates.productId)
          const isIdol = newProd?.category === 'Idols'
          updated.pieceWeight = ''
          updated.quantity = isIdol ? '1' : ''
        }
        return updated
      })
    )
  }

  // Open Return modal
  const handleOpenReturnForm = () => {
    setReturnProductId('')
    setReturnLocationId(isLocationLocked && userAssignedLocationId ? userAssignedLocationId : '')
    setReturnQty('')
    setReturnPieceWeight('')
    setReturnPrice('')
    setReturnCustomerName('')
    setReturnDate('')
    setReturnNotes('')
    setReturnError(null)
    setIsReturnFormOpen(true)
  }

  // Submit Multi-Item Sale
  const handleSaveSale = async (e: React.FormEvent) => {
    e.preventDefault()
    const effectiveLocId = isLocationLocked && userAssignedLocationId ? userAssignedLocationId : saleLocationId
    if (!effectiveLocId) {
      setSaleError('Please select a selling location')
      return
    }

    if (!saleDate) {
      setSaleError('Please select a sale date')
      return
    }

    if (saleItems.length === 0) {
      setSaleError('Please add at least one item to the sale')
      return
    }

    // Validate each line item
    const validatedItems: Array<{
      prod: Product
      qty: number
      price: number
      pieceWeight?: number
    }> = []

    const requiredStockPerProduct: Record<string, number> = {}
    const chosenPiecesPerProduct: Record<string, Set<number>> = {}

    for (let i = 0; i < saleItems.length; i++) {
      const item = saleItems[i]
      const itemNum = i + 1
      const prod = products.find((p) => p.id === item.productId)
      if (!prod) {
        setSaleError(`Item #${itemNum}: Please select a valid product`)
        return
      }

      const isIdol = prod.category === 'Idols'
      if (isIdol && !item.pieceWeight) {
        setSaleError(`Item #${itemNum} (${prod.name}): Please select which piece weight is being sold`)
        return
      }

      const qty = isIdol ? 1 : Number(item.quantity)
      if (isNaN(qty) || qty <= 0) {
        setSaleError(`Item #${itemNum} (${prod.name}): Quantity must be at least 1`)
        return
      }

      const unitPrice = Number(item.price)
      if (isNaN(unitPrice) || unitPrice <= 0) {
        setSaleError(`Item #${itemNum} (${prod.name}): Selling price per unit is required and must be greater than ₹0`)
        return
      }

      if (isIdol && item.pieceWeight) {
        const pw = Number(item.pieceWeight)
        if (!chosenPiecesPerProduct[prod.id]) {
          chosenPiecesPerProduct[prod.id] = new Set()
        }
        if (chosenPiecesPerProduct[prod.id].has(pw)) {
          setSaleError(`Item #${itemNum}: Piece weight ${formatWeight(pw)} is already selected in another row`)
          return
        }
        chosenPiecesPerProduct[prod.id].add(pw)
      }

      requiredStockPerProduct[prod.id] = (requiredStockPerProduct[prod.id] || 0) + qty
      const available = prod.stockByLocation?.[effectiveLocId] || 0
      if (requiredStockPerProduct[prod.id] > available) {
        setSaleError(`Insufficient stock for "${prod.name}" at this location. Available: ${available}, Total in sale: ${requiredStockPerProduct[prod.id]}`)
        return
      }

      validatedItems.push({
        prod,
        qty,
        price: unitPrice,
        pieceWeight: isIdol && item.pieceWeight ? Number(item.pieceWeight) : undefined
      })
    }

    setSaleSubmitting(true)
    setSaleError(null)

    try {
      if (!selectedCustomer && !isWalkInCustomer) {
        setSaleError('Please select a customer or choose Walk-in customer')
        return
      }
      if (!isPaymentBalanced || salePayments.length === 0) {
        setSaleError('Payment amounts must balance the grand total exactly before recording')
        return
      }

      const payload = {
        type: 'sale',
        customerId: selectedCustomer ? selectedCustomer.id : undefined,
        locationId: effectiveLocId,
        date: saleDate,
        lines: validatedItems.map((it) => ({
          productId: it.prod.id,
          qty: it.qty,
          pieceWeightMg: it.pieceWeight ? gramsToMg(it.pieceWeight) : undefined,
          unitPricePaise: rupeesToPaise(it.price)
        })),
        payments: salePayments,
        notes: saleNotes.trim() || undefined
      }

      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record sale order')
      }

      const createdOrder: Order = data.order

      setIsSaleFormOpen(false)
      toast.success(`Bill ${createdOrder.orderNo} recorded successfully`)

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
          customerName: createdOrder.customerSnapshot?.displayName || selectedCustomer?.displayName || undefined,
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
        netRevenue: prev.netRevenue + totalSaleAmt
      }))

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
        }
        return updated
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record sale'
      setSaleError(msg)
      toast.error(msg)
    } finally {
      setSaleSubmitting(false)
    }
  }

  // Reverse complete Order Bill with atomic inventory restoration
  const handleConfirmReverseOrder = async () => {
    if (!reverseOrderTarget || !reverseOrderTarget.orderId) return
    try {
      setReversingOrder(true)
      const res = await fetch(`/api/admin/orders/${reverseOrderTarget.orderId}/reverse`, {
        method: 'POST'
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reverse order')
      }

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
        netRevenue: Math.max(0, prev.netRevenue - totalOrderAmt)
      }))

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

    if (!returnDate) {
      setReturnError('Please select a return date')
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

  const handleOpenEditSale = (tx: Transaction) => {
    setEditingSale(tx)
    setEditSaleDate(tx.date || getTodayIST())
    setEditSaleLocationId(tx.locationId || '')
    setEditSaleQuantity(String(tx.quantity || 1))
    setEditSalePrice(tx.price !== undefined ? String(tx.price) : '')
    setEditSaleCustomerName(tx.customerName || '')
    setEditSaleNotes(tx.notes || '')
    setEditSaleError(null)
  }

  const handleSaveEditSale = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSale) return

    const qty = Number(editSaleQuantity)
    if (isNaN(qty) || qty < 1) {
      setEditSaleError('Quantity must be at least 1')
      return
    }

    const priceNum = Number(editSalePrice)
    if (isNaN(priceNum) || priceNum < 0) {
      setEditSaleError('Price must be a valid non-negative number')
      return
    }

    setEditSaleSubmitting(true)
    setEditSaleError(null)

    try {
      const res = await updateTransaction(editingSale.id, {
        quantity: qty,
        price: priceNum,
        locationId: editSaleLocationId,
        locationName: locationMap.get(editSaleLocationId) || editingSale.locationName,
        date: editSaleDate,
        customerName: editSaleCustomerName,
        notes: editSaleNotes
      })

      const updated = res.transaction
      setSalesList((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)))

      const oldQty = Number(editingSale.quantity || 1)
      const oldPrice = Number(editingSale.price || 0)
      const oldTotal = oldQty * oldPrice
      const newTotal = qty * priceNum
      const qtyDiff = qty - oldQty
      const revDiff = newTotal - oldTotal

      setStats((prev) => ({
        ...prev,
        salesUnits: prev.salesUnits + qtyDiff,
        salesRevenue: prev.salesRevenue + revDiff,
        netRevenue: prev.netRevenue + revDiff
      }))

      // Update product stock in local products state if quantity or location changed
      const oldLoc = editingSale.locationId
      const newLoc = editSaleLocationId
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== editingSale.productId) return p
          const locStock = { ...(p.stockByLocation || {}) }
          let totalStock = p.stock || 0
          if (oldLoc === newLoc) {
            locStock[oldLoc] = (locStock[oldLoc] || 0) - qtyDiff
            totalStock -= qtyDiff
          } else {
            locStock[oldLoc] = (locStock[oldLoc] || 0) + oldQty
            locStock[newLoc] = (locStock[newLoc] || 0) - qty
            totalStock -= qtyDiff
          }
          return {
            ...p,
            stock: Math.max(0, totalStock),
            stockByLocation: locStock
          }
        })
      )

      toast.success('Sale entry updated successfully')
      setEditingSale(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update sale'
      setEditSaleError(msg)
      toast.error(msg)
    } finally {
      setEditSaleSubmitting(false)
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
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase font-semibold tracking-wider text-gray-500">Gross Sales</span>
            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700">
              <IndianRupee size={14} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-black tabular-nums tracking-tight">
              ₹{stats.salesRevenue.toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-gray-400 mt-1 font-medium">{stats.salesCount} sales</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase font-semibold tracking-wider text-gray-500">Units Sold</span>
            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700">
              <PackageCheck size={14} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-black tabular-nums tracking-tight">
              {stats.salesUnits.toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-gray-400 mt-1 font-medium">units dispatched</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase font-semibold tracking-wider text-gray-500">Returns</span>
            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700">
              <RotateCcw size={14} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-black tabular-nums tracking-tight">
              ₹{stats.returnsAmount.toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-gray-400 mt-1 font-medium">{stats.returnsCount} returns</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase font-semibold tracking-wider text-gray-500">Net Sales</span>
            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700">
              <TrendingUp size={14} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-black tabular-nums tracking-tight">
              ₹{stats.netRevenue.toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-gray-400 mt-1 font-medium">Sales minus returns</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-gray-200 mb-6">
        {(isSuperAdmin || hasPermission('sales', 'view')) && (
          <button
            onClick={() => handleTabChange('sales')}
            className={`pb-3 px-3.5 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 ${activeTab === 'sales'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
              }`}
          >
            <ShoppingCart size={15} className="shrink-0" />
            <span>Sales</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-medium ${
              activeTab === 'sales' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'
            }`}>
              {stats.salesCount}
            </span>
          </button>
        )}
        {(isSuperAdmin || hasPermission('returns', 'view')) && (
          <button
            onClick={() => handleTabChange('returns')}
            className={`pb-3 px-3.5 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 ${activeTab === 'returns'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
              }`}
          >
            <RotateCcw size={15} className="shrink-0" />
            <span>Returns</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-medium ${
              activeTab === 'returns' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'
            }`}>
              {stats.returnsCount}
            </span>
          </button>
        )}
      </div>

      {/* Date Range Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 mb-6 bg-white border border-gray-200 rounded-xl shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 px-2 select-none">
            <Calendar size={14} className="text-gray-400" />
            Date Range:
          </span>
          <div className="inline-flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl">
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
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${dateRangePreset === preset.id
                  ? 'bg-white text-black font-semibold shadow-xs'
                  : 'text-gray-600 hover:text-black'
                  }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {dateRangePreset === 'custom' && (
          <div className="flex items-center gap-2">
            <div className="w-36">
              <CustomDatePicker
                size="sm"
                value={customStartDate}
                onChange={(d) => {
                  setLoading(true)
                  setCustomStartDate(d)
                }}
                placeholder="Start Date"
              />
            </div>
            <span className="text-xs text-gray-400 font-medium">to</span>
            <div className="w-36">
              <CustomDatePicker
                size="sm"
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

      {/* Category & Metal Segmented Filters */}
      <div className="flex flex-wrap items-center gap-2.5 mb-6">
        {/* Category Filter */}
        <div className="inline-flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-2 select-none">Category</span>
          <button
            onClick={() => setSelectedCategory('All')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${
              selectedCategory === 'All'
                ? 'bg-white text-black font-semibold shadow-xs'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${
                selectedCategory === cat
                  ? 'bg-white text-black font-semibold shadow-xs'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Metal Filter */}
        <div className="inline-flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-2 select-none">Metal</span>
          {(['All', 'Gold', 'Silver'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMetal(m)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${
                selectedMetal === m
                  ? 'bg-white text-black font-semibold shadow-xs'
                  : 'text-gray-600 hover:text-black'
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
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-black">Record Customer Sale</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                  {saleItems.length} {saleItems.length === 1 ? 'item' : 'items'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsSaleFormOpen(false)}
                className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97]"
              >
                <X size={18} />
              </button>
            </div>

            {saleError && (
              <div className="mb-4 p-3 bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle size={14} className="text-gray-600 shrink-0" />
                <span>{saleError}</span>
              </div>
            )}

            <form onSubmit={handleSaveSale} className="space-y-5">
              {/* Common Sale Metadata Header */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50/70 border border-gray-200 rounded-xl">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700">
                      Location <span className="text-red-500">*</span>
                    </label>
                    {isLocationLocked && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                        <Lock className="w-2.5 h-2.5 text-gray-500" />
                        Locked
                      </span>
                    )}
                  </div>
                  {isLocationLocked ? (
                    <div className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-xs font-semibold text-black">
                      {locationMap.get(saleLocationId) || adminUser?.assignedLocationName || 'Assigned Location'}
                    </div>
                  ) : (
                    <CustomSelect
                      value={saleLocationId}
                      onValueChange={setSaleLocationId}
                      options={saleLocationOptions}
                      placeholder="Select location..."
                    />
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Sale Date <span className="text-red-500">*</span>
                  </label>
                  <CustomDatePicker
                    value={saleDate}
                    onChange={setSaleDate}
                    placeholder="Select sale date"
                  />
                </div>

                <div>
                  <CustomerPicker
                    selectedCustomer={selectedCustomer}
                    isWalkIn={isWalkInCustomer}
                    onSelectCustomer={(cust) => {
                      setSelectedCustomer(cust)
                      if (cust) {
                        setIsWalkInCustomer(false)
                      }
                    }}
                    onSelectWalkIn={() => {
                      setIsWalkInCustomer(true)
                      setSelectedCustomer(null)
                    }}
                    onClear={() => {
                      setSelectedCustomer(null)
                      setIsWalkInCustomer(false)
                    }}
                    disabled={saleSubmitting}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Invoice / Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Tax Invoice #INV-001"
                    value={saleNotes}
                    onChange={(e) => setSaleNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                  />
                </div>
              </div>

              {/* Line Items List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Items to Sell ({saleItems.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddSaleItem}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-black bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                  >
                    <Plus size={13} />
                    Add Another Item
                  </button>
                </div>

                <div className="space-y-3">
                  {saleItems.map((item, idx) => {
                    const prod = products.find((p) => p.id === item.productId)
                    const isIdol = prod?.category === 'Idols'
                    const availableInStore = prod?.stockByLocation?.[saleLocationId] || 0
                    const usedInOtherLines = saleItems
                      .filter((other) => other.id !== item.id && other.productId === item.productId)
                      .reduce((sum, other) => sum + (Number(other.quantity) || 0), 0)
                    const availableForThisLine = Math.max(0, availableInStore - usedInOtherLines)

                    const locPieces = prod?.pieceWeightsByLocation?.[saleLocationId] || []
                    const chosenInOtherLines = new Set(
                      saleItems
                        .filter((other) => other.id !== item.id && other.productId === item.productId && other.pieceWeight)
                        .map((other) => Number(other.pieceWeight))
                    )
                    const availableLinePieces = locPieces.filter((pw) => !chosenInOtherLines.has(pw))
                    const lineTotal = (Number(item.price) || 0) * (Number(item.quantity) || 0)

                    return (
                      <div
                        key={item.id}
                        className="p-4 bg-gray-50/70 border border-gray-200 rounded-xl space-y-3 relative"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-semibold text-gray-800">
                              Item #{idx + 1}
                            </span>
                            {prod && (
                              <span className="text-[11px] font-mono text-gray-500">
                                ({prod.category} · {prod.metal || 'Silver'})
                              </span>
                            )}
                          </div>

                          {saleItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSaleItem(item.id)}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                              title="Remove item"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                          <div className="sm:col-span-6">
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-600 mb-1">
                              Product <span className="text-red-500">*</span>
                            </label>
                            <CustomSelect
                              size="sm"
                              value={item.productId}
                              onValueChange={(val) => handleUpdateSaleItem(item.id, { productId: val })}
                              options={saleProductOptions}
                              placeholder="Select product..."
                            />
                            <div className="flex items-center justify-between text-[11px] text-gray-500 mt-1">
                              <span>Available in store:</span>
                              {prod ? (
                                <strong className={availableForThisLine > 0 ? 'text-black' : 'text-red-600'}>
                                  {availableForThisLine} units
                                </strong>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </div>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-600 mb-1">
                              Qty <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              min="1"
                              max={Math.max(1, availableForThisLine)}
                              disabled={isIdol}
                              placeholder={isIdol ? '1' : 'Qty'}
                              value={isIdol ? '1' : item.quantity}
                              onChange={(e) => handleUpdateSaleItem(item.id, { quantity: e.target.value })}
                              className={`h-9 w-full px-3 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150 ${isIdol ? 'bg-gray-100 cursor-not-allowed font-semibold' : ''}`}
                              required
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-600 mb-1">
                              Unit Price (₹) <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              placeholder="e.g. 78500"
                              value={item.price}
                              onChange={(e) => handleUpdateSaleItem(item.id, { price: e.target.value })}
                              className="h-9 w-full px-3 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                              required
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-600 mb-1">
                              Total
                            </label>
                            <div className="h-9 px-3 bg-gray-100 border border-gray-200 rounded-lg flex items-center justify-end font-bold text-xs text-black tabular-nums">
                              {lineTotal > 0 ? `₹${lineTotal.toLocaleString('en-IN')}` : '—'}
                            </div>
                          </div>
                        </div>

                        {/* Idol piece weight selector */}
                        {isIdol && (
                          <div className="pt-2 border-t border-gray-200/60">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-700">
                                Select Piece Weight <span className="text-red-500">*</span>
                              </span>
                              <span className="text-[11px] text-gray-500">
                                {availableLinePieces.length} available
                              </span>
                            </div>
                            {availableLinePieces.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                {availableLinePieces.map((pw, i) => (
                                  <button
                                    key={`${pw}-${i}`}
                                    type="button"
                                    onClick={() => handleUpdateSaleItem(item.id, { pieceWeight: String(pw) })}
                                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${
                                      String(item.pieceWeight) === String(pw)
                                        ? 'bg-black text-white shadow-xs'
                                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                                    }`}
                                  >
                                    #{i + 1}: {formatWeight(pw)}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-red-600 font-semibold">
                                No available idol pieces in stock at this location.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Payment Split */}
              <div className="pt-2">
                <PaymentSplit
                  totalPaise={saleTotalsPaise}
                  payments={salePayments}
                  onChange={(payments, isBalanced) => {
                    setSalePayments(payments)
                    setIsPaymentBalanced(isBalanced)
                  }}
                  disabled={saleSubmitting}
                />
              </div>

              {/* Order Summary Footer */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-6 divide-x divide-gray-200 text-xs">
                  <div>
                    <span className="text-gray-500 block">Total Items</span>
                    <span className="font-bold text-sm text-black tabular-nums">
                      {saleItems.length} {saleItems.length === 1 ? 'item' : 'items'} ({saleTotals.totalUnits} units)
                    </span>
                  </div>
                  {saleTotals.totalWeightGrams > 0 && (
                    <div className="pl-6">
                      <span className="text-gray-500 block">Total Weight</span>
                      <span className="font-bold text-sm text-black tabular-nums">
                        {formatWeight(saleTotals.totalWeightGrams)}
                      </span>
                    </div>
                  )}
                  <div className="pl-6">
                    <span className="text-gray-500 block">Grand Total</span>
                    <span className="font-extrabold text-base text-black tabular-nums">
                      ₹{saleTotals.grandTotal.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSaleFormOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saleSubmitting || !isSaleFormValid}
                    className="px-5 py-2 text-xs font-semibold text-white bg-black hover:bg-black/85 rounded-lg shadow-xs transition-[background-color,opacity,transform] duration-150 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none inline-flex items-center gap-2"
                  >
                    {saleSubmitting ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </>
                    ) : (
                      `Record Sale (${saleItems.length} ${saleItems.length === 1 ? 'item' : 'items'})`
                    )}
                  </button>
                </div>
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
                  disabled={returnSubmitting || !isReturnFormValid}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none transition-[background-color,opacity,transform] duration-150 active:scale-[0.97]"
                >
                  {returnSubmitting ? 'Recording...' : 'Accept Return & Add Stock'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Tables */}
      {loading ? (
        <SkeletonTable rows={6} columns={7} />
      ) : activeTab === 'sales' ? (
        saleBills.length === 0 ? (
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
            <div className="overflow-x-auto max-h-[720px] overflow-y-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="sticky top-0 bg-gray-50/95 backdrop-blur z-10 border-b border-gray-200 text-xs uppercase font-semibold text-gray-500 tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Bill / Invoice</th>
                    <th className="px-5 py-3.5">Date</th>
                    <th className="px-5 py-3.5">Customer</th>
                    <th className="px-5 py-3.5">Location</th>
                    <th className="px-5 py-3.5 text-right">Items</th>
                    <th className="px-5 py-3.5 text-right">Total (₹)</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {saleBills.map((bill) => {
                    const isExpanded = expandedBillKeys.has(bill.billKey)
                    return (
                      <React.Fragment key={bill.billKey}>
                        <tr
                          onClick={() => toggleBillExpand(bill.billKey)}
                          className="hover:bg-gray-50/80 cursor-pointer transition-[background-color] duration-150 group"
                        >
                          <td className="px-5 py-4 font-mono font-medium text-xs text-black">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 flex items-center justify-center rounded text-gray-400 group-hover:text-black group-hover:bg-gray-200/60 transition-[background-color,color] duration-150">
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </span>
                              <span className="font-semibold">{bill.invoiceNo}</span>
                              {bill.hasReversed && !bill.hasActive && (
                                <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                  Reversed
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-xs text-gray-600">
                            {formatDateDisplay(bill.date)}
                          </td>
                          <td className="px-5 py-4 font-semibold text-black">
                            {bill.customerId ? (
                              <Link
                                href={`/admin/customers/${bill.customerId}`}
                                className="inline-flex items-center gap-1.5 text-black hover:underline group-hover:text-blue-600 transition-[color] duration-150"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span>{bill.customerName || 'View Customer'}</span>
                                <ExternalLink size={12} className="text-gray-400" />
                              </Link>
                            ) : (
                              bill.customerName || <span className="text-gray-400 font-normal italic">Walk-in Customer</span>
                            )}
                            {bill.paymentModes && bill.paymentModes.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {bill.paymentModes.map((mode) => (
                                  <span
                                    key={mode}
                                    className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-gray-100 text-gray-700 border border-gray-200"
                                  >
                                    {mode === 'old_metal' ? 'Metal' : mode}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4 text-xs text-gray-700">
                            {bill.locationName}
                          </td>
                          <td className="px-5 py-4 text-right tabular-nums text-xs font-medium text-gray-700">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-800">
                              {bill.items.length} {bill.items.length === 1 ? 'item' : 'items'} • {bill.totalQuantity} {bill.totalQuantity === 1 ? 'unit' : 'units'}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right tabular-nums font-bold text-black">
                            ₹{bill.totalAmount.toLocaleString('en-IN')}
                          </td>
                          <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              {bill.items.length === 1 && isSuperAdmin && !bill.items[0].isReversed && !bill.items[0].reversalOf && (
                                <button
                                  onClick={() => handleOpenEditSale(bill.items[0])}
                                  title="Edit sale (Super Admin)"
                                  className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                              {hasPermission('sales', 'delete') && bill.hasActive && (
                                <button
                                  onClick={() => {
                                    if (bill.orderId) {
                                      setReverseOrderTarget(bill)
                                    } else {
                                      const activeItem = bill.items.find((i) => !i.isReversed && !i.reversalOf)
                                      if (activeItem) setDeleteTxTarget(activeItem)
                                    }
                                  }}
                                  title="Post reversing entry (restores stock)"
                                  className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                                >
                                  <RotateCcw size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Line Items Table */}
                        {isExpanded && (
                          <tr className="bg-gray-50/50">
                            <td colSpan={7} className="px-6 py-3 border-t border-b border-gray-200/80">
                              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-2xs">
                                <div className="px-4 py-2 bg-gray-50/70 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between">
                                  <span>Bill Line Items ({bill.items.length})</span>
                                  <span className="font-mono text-gray-400">Invoice: {bill.invoiceNo}</span>
                                </div>
                                <table className="w-full text-left text-xs">
                                  <thead>
                                    <tr className="border-b border-gray-100 text-gray-400 font-medium">
                                      <th className="py-2.5 px-4 font-normal">Product</th>
                                      <th className="py-2.5 px-4 font-normal">Metal</th>
                                      <th className="py-2.5 px-4 font-normal">Category</th>
                                      <th className="py-2.5 px-4 text-right font-normal">Qty / Weight</th>
                                      <th className="py-2.5 px-4 text-right font-normal">Unit Price</th>
                                      <th className="py-2.5 px-4 text-right font-normal">Total</th>
                                      <th className="py-2.5 px-4 text-right font-normal">Item Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {bill.items.map((item) => {
                                      const lineTotal = (item.price || 0) * (item.quantity || 1)
                                      return (
                                        <tr key={item.id} className="hover:bg-gray-50/40">
                                          <td className="py-2.5 px-4 font-semibold text-black">
                                            {item.productName}
                                          </td>
                                          <td className="py-2.5 px-4">
                                            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium border border-gray-200 text-gray-700 bg-gray-50">
                                              {item.metal || 'Silver'}
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-4 text-gray-600">
                                            {item.category}
                                          </td>
                                          <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-black">
                                            {item.quantity}
                                            {item.pieceWeight && (
                                              <span className="text-[11px] font-mono text-gray-500 block">
                                                ({formatWeight(item.pieceWeight)})
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-2.5 px-4 text-right tabular-nums text-gray-600">
                                            {item.price ? `₹${item.price.toLocaleString('en-IN')}` : '—'}
                                          </td>
                                          <td className="py-2.5 px-4 text-right tabular-nums font-bold text-black">
                                            ₹{lineTotal.toLocaleString('en-IN')}
                                          </td>
                                          <td className="py-2.5 px-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                              {isSuperAdmin && !item.isReversed && !item.reversalOf && (
                                                <button
                                                  onClick={() => handleOpenEditSale(item)}
                                                  title="Edit item (Super Admin)"
                                                  className="w-7 h-7 inline-flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 rounded transition-[color,background-color] duration-150"
                                                >
                                                  <Pencil size={13} />
                                                </button>
                                              )}
                                              {hasPermission('sales', 'delete') && !item.isReversed && !item.reversalOf && (
                                                <button
                                                  onClick={() => setDeleteTxTarget(item)}
                                                  title="Reverse this item"
                                                  className="w-7 h-7 inline-flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 rounded transition-[color,background-color] duration-150"
                                                >
                                                  <RotateCcw size={13} />
                                                </button>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
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
            <div className="overflow-x-auto max-h-[720px] overflow-y-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="sticky top-0 bg-gray-50/95 backdrop-blur z-10 border-b border-gray-200 text-xs uppercase font-semibold text-gray-500 tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Date</th>
                    <th className="px-5 py-3.5">Customer</th>
                    <th className="px-5 py-3.5">Product</th>
                    <th className="px-5 py-3.5">Restocked At</th>
                    <th className="px-5 py-3.5 text-right">Quantity</th>
                    <th className="px-5 py-3.5 text-right">Total Refund (₹)</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredReturns.map((tx) => {
                    const totalVal = tx.price ? tx.price * tx.quantity : 0
                    return (
                      <tr key={tx.id} className="hover:bg-gray-50/70 transition-[background-color] duration-100">
                        <td className="px-5 py-4 text-xs text-gray-600">
                          {formatDateDisplay(tx.date)}
                        </td>
                        <td className="px-5 py-4 font-semibold text-black">
                          {tx.customerName || <span className="text-gray-400 font-normal italic">Walk-in Customer</span>}
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-semibold text-black">{tx.productName}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium border border-gray-200 text-gray-700 bg-gray-50">
                              {tx.metal || 'Silver'}
                            </span>
                            <span className="text-[11px] text-gray-500">{tx.category}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs text-gray-700">
                          {tx.locationName}
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums font-semibold text-black">
                          +{tx.quantity}
                          {tx.pieceWeight && (
                            <div className="text-[11px] font-mono text-gray-500">
                              ({formatWeight(tx.pieceWeight)})
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums font-bold text-black">
                          {totalVal > 0 ? `₹${totalVal.toLocaleString('en-IN')}` : '—'}
                          {tx.notes && (
                            <div className="text-[11px] text-gray-400 font-normal truncate max-w-xs ml-auto">
                              {tx.notes}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {hasPermission('returns', 'delete') && !tx.isReversed && !tx.reversalOf && (
                            <button
                              onClick={() => setDeleteTxTarget(tx)}
                              title="Post reversing entry (reverses restock)"
                              className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
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

      {/* Order Reversal Modal */}
      <ConfirmModal
        isOpen={!!reverseOrderTarget}
        title="Reverse Sale Bill"
        description={`Posting a reversing entry will reverse bill ${reverseOrderTarget?.invoiceNo || ''} and all ${reverseOrderTarget?.items.length || 0} line item(s), restore all sold stock back into the location, and recalculate customer statistics. This action cannot be undone. Continue?`}
        confirmText={reversingOrder ? 'Reversing...' : 'Reverse Bill'}
        disabled={reversingOrder}
        onConfirm={handleConfirmReverseOrder}
        onClose={() => setReverseOrderTarget(null)}
      />

      {/* Super Admin Edit Sale Modal */}
      <AnimatePresence>
        {editingSale && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.16, ease: EASE_OUT }}
              className="w-full max-w-lg bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-gray-100 overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-black">Edit Sale Entry</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-black text-white">
                      Super Admin
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Correct recorded sale details. Stock adjustments apply automatically.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingSale(null)}
                  className="p-1.5 text-gray-400 hover:text-black rounded-lg hover:bg-gray-100 transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                >
                  <X size={16} />
                </button>
              </div>

              {editSaleError && (
                <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{editSaleError}</span>
                </div>
              )}

              <form onSubmit={handleSaveEditSale} className="p-6 space-y-4">
                {/* Product Summary banner */}
                <div className="p-3 bg-gray-50 border border-gray-200/80 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-black block">{editingSale.productName}</span>
                    <span className="text-[11px] text-gray-500">
                      {editingSale.metal} · {editingSale.category} {editingSale.brand ? `· ${editingSale.brand}` : ''}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-gray-400">ID: {editingSale.id.slice(-6)}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                      Sale Date <span className="text-red-500">*</span>
                    </label>
                    <CustomDatePicker
                      value={editSaleDate}
                      onChange={setEditSaleDate}
                      placeholder="Select sale date"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                      Store Location <span className="text-red-500">*</span>
                    </label>
                    <CustomSelect
                      value={editSaleLocationId}
                      onValueChange={setEditSaleLocationId}
                      options={saleLocationOptions}
                      placeholder="Select location..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                      Quantity Sold <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={editSaleQuantity}
                      onChange={(e) => setEditSaleQuantity(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                      Unit Price (₹) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={editSalePrice}
                      onChange={(e) => setEditSalePrice(e.target.value)}
                      placeholder="e.g. 15000"
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                    />
                  </div>
                </div>

                {/* Live total display */}
                <div className="p-2.5 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between text-xs">
                  <span className="text-gray-500">Total Sale Amount:</span>
                  <span className="font-bold text-black text-sm">
                    ₹{((Number(editSaleQuantity) || 0) * (Number(editSalePrice) || 0)).toLocaleString('en-IN')}
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Customer Name / Entity
                  </label>
                  <input
                    type="text"
                    value={editSaleCustomerName}
                    onChange={(e) => setEditSaleCustomerName(e.target.value)}
                    placeholder="e.g. Rajesh Kumar"
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Invoice / Notes
                  </label>
                  <input
                    type="text"
                    value={editSaleNotes}
                    onChange={(e) => setEditSaleNotes(e.target.value)}
                    placeholder="e.g. Tax Invoice #INV-001"
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setEditingSale(null)}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editSaleSubmitting || !isEditSaleValid}
                    className="px-5 py-2 text-xs font-semibold text-white bg-black hover:bg-black/85 rounded-lg shadow-xs transition-[background-color,opacity,transform] duration-150 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none inline-flex items-center gap-2"
                  >
                    {editSaleSubmitting ? 'Saving Changes...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
