"use client"

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Plus,
  Edit2,
  AlertCircle,
  X,
  Check,
  Package,
  Layers,
  ShoppingBag,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Upload,
  Archive,
  Lock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  History,
  Trash2
} from 'lucide-react'

export interface PurchaseLineItem {
  id: string
  productId: string
  quantity: string
  price: string
  pieceWeights: number[]
  pieceInput: string
}
import { auth } from '@/lib/firebase/auth'
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { useArchive } from '@/lib/context/ArchiveContext'
import { Product, Location, Transaction, ProductCategory, ProductBrand, TransactionType, MetalType } from '@/lib/types'
import {
  getProducts,
  getLocations,
  getTransactions,
  addProduct,
  updateProduct,
  deleteProduct,
  recordTransaction,
  deleteTransaction,
  clearTransactionHistory,
  getTransactionsPage,
  downloadArchiveById
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
import { getTodayIST, getDaysAgoIST, getDefaultFiscalCutoffIST, getNextDayIST, formatDisplayDateIST, isValidDateStringIST } from '@/lib/utils/date'

const CATEGORIES: ProductCategory[] = ['Bullions', 'Idols']
const BULLION_BRANDS: ProductBrand[] = ['MMTC PAMP', 'Local']
const METALS: MetalType[] = ['Gold', 'Silver']

const PURITY_OPTIONS_BY_METAL: Record<MetalType, string[]> = {
  Gold: ['999.9', '999', '995', '916', '750'],
  Silver: ['999.9', '999', '925']
}

type InventoryTab = 'products' | 'purchases' | 'movements' | 'archived-audit'
type MovementSubtype = 'transfer' | 'adjustment' | 'repair' | 'melt'
type SortField =
  | 'last_modified'
  | 'name_asc'
  | 'name_desc'
  | 'sku_asc'
  | 'weight_desc'
  | 'weight_asc'
  | 'stock_desc'
  | 'stock_asc'
  | 'category'

function getTimestampMs(ts: unknown): number {
  if (!ts) return 0
  if (typeof ts === 'object' && ts !== null) {
    if ('toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
      return (ts as { toMillis: () => number }).toMillis()
    }
    if ('seconds' in ts && typeof (ts as { seconds: number }).seconds === 'number') {
      return (ts as { seconds: number }).seconds * 1000
    }
  }
  if (typeof ts === 'string' || typeof ts === 'number') {
    const d = new Date(ts).getTime()
    return isNaN(d) ? 0 : d
  }
  return 0
}

export default function AdminInventory() {
  const { hasPermission, adminUser, isSuperAdmin } = usePermissions()
  const userAssignedLocationId = adminUser?.assignedLocationId
  const isLocationLocked = Boolean(!isSuperAdmin && userAssignedLocationId)

  // Shared Offline archive viewing state
  const { archivedSession, loadArchiveFromFile, exitArchive } = useArchive()

  // Granular view permissions for inventory tabs
  const allowedTabs = useMemo<InventoryTab[]>(() => {
    const tabs: InventoryTab[] = []
    if (hasPermission('products', 'view')) tabs.push('products')
    if (hasPermission('purchases', 'view')) tabs.push('purchases')
    if (hasPermission('movements', 'view')) tabs.push('movements')
    if (archivedSession) tabs.push('archived-audit')
    return tabs
  }, [hasPermission, archivedSession])

  // Movement types the user has permission to record
  const allowedMovementTypes = useMemo<MovementSubtype[]>(() => {
    const types: MovementSubtype[] = []
    if (hasPermission('movements', 'transfer')) types.push('transfer')
    if (hasPermission('movements', 'adjustment')) types.push('adjustment')
    if (hasPermission('movements', 'repair')) types.push('repair')
    if (hasPermission('movements', 'melt')) types.push('melt')
    return types
  }, [hasPermission])

  const [requestedTab, setRequestedTab] = useState<InventoryTab>('products')

  // Automatically keep activeTab on an allowed tab without cascading effect renders
  const activeTab: InventoryTab = useMemo(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(requestedTab)) {
      return allowedTabs[0]
    }
    return requestedTab
  }, [allowedTabs, requestedTab])

  const setActiveTab = (tab: InventoryTab) => {
    setRequestedTab(tab)
  }

  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'All'>('All')
  const [selectedBrand, setSelectedBrand] = useState<string>('All')
  const [selectedMetal, setSelectedMetal] = useState<MetalType | 'All'>('All')
  const [productStatusFilter, setProductStatusFilter] = useState<'active' | 'archived' | 'all'>('active')
  const [sortBy, setSortBy] = useState<SortField>('last_modified')

  // Data state
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  // Date range filter state for transactions (Purchases & Movements)
  const [dateRangePreset, setDateRangePreset] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  const effectiveStartDate = useMemo(() => {
    if (dateRangePreset === 'today') return getTodayIST()
    if (dateRangePreset === 'week') return getDaysAgoIST(7)
    if (dateRangePreset === 'month') return getDaysAgoIST(30)
    if (dateRangePreset === 'custom') return customStartDate || undefined
    return undefined
  }, [dateRangePreset, customStartDate])

  const effectiveEndDate = useMemo(() => {
    if (dateRangePreset === 'today') return getTodayIST()
    if (dateRangePreset === 'custom') return customEndDate || undefined
    return undefined
  }, [dateRangePreset, customEndDate])

  // Pagination state
  const [purchasesPage, setPurchasesPage] = useState(1)
  const [movementsPage, setMovementsPage] = useState(1)
  const pageSize = 15

  // Product modal / form state
  const [isProductFormOpen, setIsProductFormOpen] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [prodName, setProdName] = useState('')
  const [prodCategory, setProdCategory] = useState<ProductCategory>('Bullions')
  const [prodBrand, setProdBrand] = useState<ProductBrand>('MMTC PAMP')
  const [prodMetal, setProdMetal] = useState<MetalType>('Gold')
  const [prodSku, setProdSku] = useState('')
  const [prodWeight, setProdWeight] = useState('')
  const [prodPurity, setProdPurity] = useState('999.9')
  const [prodInitialStock, setProdInitialStock] = useState('')
  const [prodInitialLocationId, setProdInitialLocationId] = useState('')
  const [prodPieceWeights, setProdPieceWeights] = useState<number[]>([])
  const [prodPieceInput, setProdPieceInput] = useState('')
  const [productFormSubmitting, setProductFormSubmitting] = useState(false)
  const [productFormError, setProductFormError] = useState<string | null>(null)
  const [isProductCategoryMetalLocked, setIsProductCategoryMetalLocked] = useState(false)

  // Purchase modal / form state (multi-item)
  const [isPurchaseFormOpen, setIsPurchaseFormOpen] = useState(false)
  const [purchaseLocationId, setPurchaseLocationId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(() => getTodayIST())
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [purchaseItems, setPurchaseItems] = useState<PurchaseLineItem[]>([
    { id: '1', productId: '', quantity: '1', price: '', pieceWeights: [], pieceInput: '' }
  ])
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)

  // Movement modal / form state
  const [isMovementFormOpen, setIsMovementFormOpen] = useState(false)
  const [movementType, setMovementType] = useState<MovementSubtype>('transfer')
  const [movementTypeFilter, setMovementTypeFilter] = useState<'All' | MovementSubtype>('All')
  const [movementProductId, setMovementProductId] = useState('')
  const [movementLocationId, setMovementLocationId] = useState('')
  const [movementToLocationId, setMovementToLocationId] = useState('')
  const [movementQty, setMovementQty] = useState('1')
  const [movementDate, setMovementDate] = useState(() => getTodayIST())
  const [movementNotes, setMovementNotes] = useState('')
  // Repair-specific fields
  const [movementNewWeight, setMovementNewWeight] = useState('')
  const [movementRepairCharge, setMovementRepairCharge] = useState('')
  // Melt-specific fields
  const [movementRecoveredWeight, setMovementRecoveredWeight] = useState('')
  const [movementPieceWeight, setMovementPieceWeight] = useState('')
  const [movementAdjustmentMode, setMovementAdjustmentMode] = useState<'surplus' | 'deficit'>('deficit')
  const [movementSubmitting, setMovementSubmitting] = useState(false)
  const [movementError, setMovementError] = useState<string | null>(null)

  // Delete modal state
  const [deleteProductTarget, setDeleteProductTarget] = useState<Product | null>(null)
  const [deleteTxTarget, setDeleteTxTarget] = useState<Transaction | null>(null)

  // Zero Balance & Offline Archive Export/Upload
  const [isZeroBalanceModalOpen, setIsZeroBalanceModalOpen] = useState(false)
  const [zeroBalanceSubmitting, setZeroBalanceSubmitting] = useState(false)
  const [zeroBalanceCutoffDate, setZeroBalanceCutoffDate] = useState<string>(() => getDefaultFiscalCutoffIST())
  const [zeroBalanceConfirmText, setZeroBalanceConfirmText] = useState('')
  const [zeroBalancePassword, setZeroBalancePassword] = useState('')
  const zeroBalanceOpeningDate = useMemo(() => getNextDayIST(zeroBalanceCutoffDate), [zeroBalanceCutoffDate])

  // Archive input ref
  const archiveInputRef = useRef<HTMLInputElement | null>(null)

  // Archived Audit Log Filter & Pagination states (when viewing offline archive in Inventory)
  const [archivedAuditSearch, setArchivedAuditSearch] = useState('')
  const [archivedAuditEntityFilter, setArchivedAuditEntityFilter] = useState<string>('all')
  const archivedAuditActionFilter = 'all'
  const [archivedAuditPage, setArchivedAuditPage] = useState(1)
  const archivedAuditPageSize = 25

  const filteredArchivedAuditLogs = useMemo(() => {
    if (!archivedSession?.auditLogs) return []
    return archivedSession.auditLogs.filter((entry) => {
      const matchSearch =
        archivedAuditSearch === '' ||
        entry.description.toLowerCase().includes(archivedAuditSearch.toLowerCase()) ||
        entry.userName.toLowerCase().includes(archivedAuditSearch.toLowerCase()) ||
        (entry.entityName && entry.entityName.toLowerCase().includes(archivedAuditSearch.toLowerCase()))

      const matchEntity = archivedAuditEntityFilter === 'all' || entry.entityType === archivedAuditEntityFilter
      const matchAction = archivedAuditActionFilter === 'all' || entry.action === archivedAuditActionFilter

      return matchSearch && matchEntity && matchAction
    })
  }, [archivedSession, archivedAuditSearch, archivedAuditEntityFilter, archivedAuditActionFilter])

  const totalArchivedAuditPages = Math.ceil(filteredArchivedAuditLogs.length / archivedAuditPageSize) || 1
  const paginatedArchivedAuditLogs = useMemo(() => {
    const start = (archivedAuditPage - 1) * archivedAuditPageSize
    return filteredArchivedAuditLogs.slice(start, start + archivedAuditPageSize)
  }, [filteredArchivedAuditLogs, archivedAuditPage, archivedAuditPageSize])

  const handleArchiveFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const success = await loadArchiveFromFile(file)
      if (success) {
        setActiveTab('movements')
      }
    } finally {
      if (e.target) e.target.value = ''
    }
  }

  const handleZeroBalance = async () => {
    if (archivedSession) {
      toast.error('Master Zero Balance cannot be executed while viewing an offline archive')
      return
    }
    if (!zeroBalanceCutoffDate || !isValidDateStringIST(zeroBalanceCutoffDate)) {
      toast.error('Please specify a valid closing fiscal cutoff date (YYYY-MM-DD)')
      return
    }
    const today = getTodayIST()
    if (zeroBalanceCutoffDate > today) {
      toast.error(`Cutoff date cannot be in the future (today is ${today})`)
      return
    }
    if (zeroBalanceConfirmText.trim() !== 'CONFIRM ZERO BALANCE') {
      toast.error('Please type "CONFIRM ZERO BALANCE" exactly to proceed')
      return
    }
    if (!zeroBalancePassword) {
      toast.error('Please enter your account password to verify recent sign-in')
      return
    }

    try {
      setZeroBalanceSubmitting(true)

      // 1. Fresh Authentication (re-authenticate with password)
      toast.loading('Verifying administrator credentials...', { id: 'zero-balance' })
      const currentUser = auth.currentUser
      if (!currentUser || !currentUser.email) {
        throw new Error('No active administrator session found. Please refresh and log in.')
      }

      const cred = EmailAuthProvider.credential(currentUser.email, zeroBalancePassword)
      await reauthenticateWithCredential(currentUser, cred)
      await currentUser.getIdToken(true) // Force fresh token with recent auth_time claim

      // 2. Execute Zero-Balance on Server:
      // Server takes lock, builds complete archive up to cutoff, computes SHA-256 checksum,
      // saves archive server-side in system_archives, scrubs records, sets opening balances & cutoff lock
      toast.loading(`Executing Master Zero-Balance up to ${zeroBalanceCutoffDate} on server...`, { id: 'zero-balance' })
      const res = await clearTransactionHistory({
        cutoffDate: zeroBalanceCutoffDate,
        confirmationPhrase: 'CONFIRM ZERO BALANCE'
      })

      // 3. Automatically download the server-verified archive with embedded checksum
      if (res.archiveId) {
        toast.loading('Downloading verified server archive...', { id: 'zero-balance' })
        const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const filename = `a96-audit-archive-cutoff-${zeroBalanceCutoffDate}-${dateStr}.json`
        try {
          await downloadArchiveById(res.archiveId, filename)
        } catch (downloadErr) {
          console.error('Failed to automatically download archive:', downloadErr)
          toast.warning('Archive saved on server, but auto-download failed. You can download it from System Archives.', {
            duration: 8000
          })
        }
      }

      setIsZeroBalanceModalOpen(false)
      setZeroBalanceConfirmText('')
      setZeroBalancePassword('')

      toast.success('Zero balance complete', {
        id: 'zero-balance',
        description: `Archive saved on server (ID: ${res.archiveId || 'N/A'}, Checksum: ${res.checksum?.slice(0, 10) || 'N/A'}). Wiped ${res.count} transactions and ${res.auditCount} audit logs. Opening entries established on ${res.openingDate || zeroBalanceOpeningDate}.`,
        duration: 9000
      })

      exitArchive()
      setTransactions([])
      await loadAll()
    } catch (err: unknown) {
      console.error('Failed to zero balance history', err)
      let msg = err instanceof Error ? err.message : 'Failed to clear transaction history. Please try again.'
      if ((err as { code?: string }).code === 'auth/wrong-password' || (err as { code?: string }).code === 'auth/invalid-credential') {
        msg = 'Incorrect password. Re-authentication failed.'
      }
      toast.error(msg, { id: 'zero-balance' })
    } finally {
      setZeroBalanceSubmitting(false)
    }
  }

  const loadAll = async () => {
    try {
      setLoading(true)
      const [prods, locs, txs] = await Promise.all([
        getProducts(),
        getLocations(),
        getTransactions({ startDate: effectiveStartDate, endDate: effectiveEndDate })
      ])
      setProducts(prods)
      setLocations(locs)
      setTransactions(txs)
    } catch (err: unknown) {
      console.error('Failed to load inventory data', err)
      const msg = err instanceof Error ? err.message : 'Unable to load inventory data. Please try again.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false
    Promise.all([
      getProducts(),
      getLocations(),
      getTransactions({ startDate: effectiveStartDate, endDate: effectiveEndDate })
    ])
      .then(([prods, locs, txs]) => {
        if (!ignore) {
          setProducts(prods)
          setLocations(locs)
          setTransactions(txs)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          console.error('Failed to load inventory data', err)
          const msg = err instanceof Error ? err.message : 'Unable to load inventory data. Please try again.'
          toast.error(msg)
          setLoading(false)
        }
      })
    return () => {
      ignore = true
    }
  }, [effectiveStartDate, effectiveEndDate])

  // Helper map for locations
  const locationMap = useMemo(() => {
    const map = new Map<string, string>()
    locations.forEach((l) => map.set(l.id, l.name))
    return map
  }, [locations])

  // Options for Dropdowns
  const categoryOptions: SelectOption[] = useMemo(() => {
    return CATEGORIES.map((c) => ({ value: c, label: c }))
  }, [])

  const brandOptions: SelectOption[] = useMemo(() => {
    return BULLION_BRANDS.map((b) => ({ value: b, label: b }))
  }, [])

  const isIdolCategory = prodCategory === 'Idols'

  // Tie purity strictly to Metal
  const purityOptions: SelectOption[] = useMemo(() => {
    const list = PURITY_OPTIONS_BY_METAL[prodMetal] || ['999.9', '999']
    return list.map((p) => ({ value: p, label: p }))
  }, [prodMetal])

  const handleCategoryChange = (newCat: ProductCategory) => {
    setProdCategory(newCat)
    if (newCat === 'Bullions') {
      if (!prodBrand || (prodBrand !== 'MMTC PAMP' && prodBrand !== 'Local')) {
        setProdBrand('MMTC PAMP')
      }
      // If switching from idols, default to Gold 999.9 if currently silver 925
      if (prodMetal === 'Silver' && prodPurity === '925') {
        setProdMetal('Gold')
        setProdPurity('999.9')
      }
    } else if (newCat === 'Idols') {
      setProdWeight('')
      setProdBrand('Local')
      // Idols default to Silver and 925 purity
      setProdMetal('Silver')
      setProdPurity('925')
    }
  }

  const handleMetalChange = (newMetal: MetalType) => {
    setProdMetal(newMetal)
    const validPurities = PURITY_OPTIONS_BY_METAL[newMetal] || ['999.9']
    if (prodCategory === 'Idols' && newMetal === 'Silver') {
      setProdPurity('925')
    } else if (!validPurities.includes(prodPurity)) {
      setProdPurity(validPurities[0])
    }
  }

  const locationOptions: SelectOption[] = useMemo(() => {
    return locations
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
      .map((l) => ({ value: l.id, label: l.name }))
  }, [locations])

  const productOptions: SelectOption[] = useMemo(() => {
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
          sublabel: `${p.metal} · ${p.category}${brandLabel} · ${weightLabel} · ${p.sku}`,
          badge: `${p.stock} in stock`,
          group: p.metal || 'Silver'
        }
      })
  }, [products])

  const sortOptions: SelectOption[] = [
    { value: 'last_modified', label: 'Last Added / Modified (Default)' },
    { value: 'name_asc', label: 'Product Name (A → Z)' },
    { value: 'name_desc', label: 'Product Name (Z → A)' },
    { value: 'sku_asc', label: 'SKU Code (A → Z)' },
    { value: 'stock_desc', label: 'Stock (Highest First)' },
    { value: 'stock_asc', label: 'Stock (Lowest First)' },
    { value: 'weight_desc', label: 'Weight (Heaviest First)' },
    { value: 'weight_asc', label: 'Weight (Lightest First)' },
    { value: 'category', label: 'Category' }
  ]

  // Filtered & Sorted products
  const processedProducts = useMemo(() => {
    let list = products
    if (productStatusFilter === 'active') {
      list = list.filter((p) => !p.isArchived)
    } else if (productStatusFilter === 'archived') {
      list = list.filter((p) => p.isArchived)
    }

    if (selectedCategory !== 'All') {
      list = list.filter((p) => p.category === selectedCategory)
    }
    if (selectedBrand !== 'All') {
      list = list.filter((p) => p.brand === selectedBrand)
    }
    if (selectedMetal !== 'All') {
      list = list.filter((p) => p.metal === selectedMetal)
    }

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'last_modified': {
          const timeA = getTimestampMs(a.updatedAt || a.createdAt)
          const timeB = getTimestampMs(b.updatedAt || b.createdAt)
          if (timeB !== timeA) return timeB - timeA
          return a.name.localeCompare(b.name)
        }
        case 'name_asc':
          return a.name.localeCompare(b.name)
        case 'name_desc':
          return b.name.localeCompare(a.name)
        case 'sku_asc':
          return a.sku.localeCompare(b.sku)
        case 'stock_desc':
          return b.stock - a.stock
        case 'stock_asc':
          return a.stock - b.stock
        case 'weight_desc':
          return (b.weight || 0) - (a.weight || 0)
        case 'weight_asc':
          return (a.weight || 0) - (b.weight || 0)
        case 'category':
          return a.category.localeCompare(b.category)
        default:
          return 0
      }
    })
  }, [products, selectedCategory, selectedBrand, selectedMetal, productStatusFilter, sortBy])

  // Effective transactions (switches to offline archive when uploaded)
  const displayTransactions = archivedSession ? archivedSession.transactions : transactions

  // Filtered purchases
  const filteredPurchases = useMemo(() => {
    return displayTransactions.filter((tx) => {
      const catMatch = selectedCategory === 'All' || tx.category === selectedCategory
      const metalMatch = selectedMetal === 'All' || tx.metal === selectedMetal
      const dateMatch =
        (!effectiveStartDate || tx.date >= effectiveStartDate) &&
        (!effectiveEndDate || tx.date <= effectiveEndDate)
      return tx.type === 'purchase' && catMatch && metalMatch && dateMatch
    })
  }, [displayTransactions, selectedCategory, selectedMetal, effectiveStartDate, effectiveEndDate])

  const paginatedPurchases = useMemo(() => {
    const start = (purchasesPage - 1) * pageSize
    return filteredPurchases.slice(start, start + pageSize)
  }, [filteredPurchases, purchasesPage, pageSize])
  const totalPurchasesPages = Math.max(1, Math.ceil(filteredPurchases.length / pageSize))

  // Filtered movements with subtype support
  const filteredMovements = useMemo(() => {
    const movementTypes: TransactionType[] = ['transfer', 'adjustment', 'repair', 'melt', 'opening']
    return displayTransactions.filter((tx) => {
      // Reversals have their own type and must not mix into Movements with stock-take corrections
      if (tx.isReversal || Boolean(tx.reversalOf) || tx.isReversed || (tx.type as string) === 'reversal') {
        return false
      }
      const typeMatch = movementTypeFilter === 'All' || tx.type === movementTypeFilter
      const catMatch = selectedCategory === 'All' || tx.category === selectedCategory
      const metalMatch = selectedMetal === 'All' || tx.metal === selectedMetal
      const dateMatch =
        (!effectiveStartDate || tx.date >= effectiveStartDate) &&
        (!effectiveEndDate || tx.date <= effectiveEndDate)
      return movementTypes.includes(tx.type) && typeMatch && catMatch && metalMatch && dateMatch
    })
  }, [displayTransactions, movementTypeFilter, selectedCategory, selectedMetal, effectiveStartDate, effectiveEndDate])

  const paginatedMovements = useMemo(() => {
    const start = (movementsPage - 1) * pageSize
    return filteredMovements.slice(start, start + pageSize)
  }, [filteredMovements, movementsPage, pageSize])
  const totalMovementsPages = Math.max(1, Math.ceil(filteredMovements.length / pageSize))

  const purchaseTotals = useMemo(() => {
    let totalUnits = 0
    let totalWeightGrams = 0
    let grandTotal = 0

    purchaseItems.forEach((item) => {
      const prod = products.find((p) => p.id === item.productId)
      const isIdol = prod?.category === 'Idols'
      const qty = isIdol && item.pieceWeights.length > 0 ? item.pieceWeights.length : (Number(item.quantity) || 0)
      const price = Number(item.price) || 0
      totalUnits += qty
      grandTotal += qty * price

      if (prod) {
        if (isIdol && item.pieceWeights.length > 0) {
          totalWeightGrams += item.pieceWeights.reduce((a, b) => a + b, 0)
        } else if (prod.weight) {
          totalWeightGrams += prod.weight * qty
        }
      }
    })

    return { totalUnits, totalWeightGrams, grandTotal }
  }, [purchaseItems, products])

  // Selected product in movement modal
  const selectedMovementProduct = useMemo(() => {
    return products.find((p) => p.id === movementProductId)
  }, [products, movementProductId])

  // Movement location options with available stock annotations
  const movementLocationOptions: SelectOption[] = useMemo(() => {
    return locations.map((l) => {
      const stock = selectedMovementProduct?.stockByLocation?.[l.id] || 0
      return {
        value: l.id,
        label: l.name,
        badge: `${stock} in stock`
      }
    })
  }, [locations, selectedMovementProduct])

  // Destination options for transfers (filters out source location)
  const destinationLocationOptions: SelectOption[] = useMemo(() => {
    return locations
      .filter((l) => l.id !== movementLocationId)
      .map((l) => {
        const stock = selectedMovementProduct?.stockByLocation?.[l.id] || 0
        return {
          value: l.id,
          label: l.name,
          badge: `${stock} currently`
        }
      })
  }, [locations, movementLocationId, selectedMovementProduct])

  // Current stock counts at selected movement locations
  const currentSourceStock = useMemo(() => {
    if (!selectedMovementProduct || !movementLocationId) return 0
    return selectedMovementProduct.stockByLocation?.[movementLocationId] || 0
  }, [selectedMovementProduct, movementLocationId])

  const currentDestStock = useMemo(() => {
    if (!selectedMovementProduct || !movementToLocationId) return 0
    return selectedMovementProduct.stockByLocation?.[movementToLocationId] || 0
  }, [selectedMovementProduct, movementToLocationId])

  // Auto-select valid destination if source matches or is unselected
  const [prevTransferKey, setPrevTransferKey] = useState('')
  const transferKey = `${movementType}_${movementLocationId}_${destinationLocationOptions.map((d) => d.value).join(',')}`
  if (transferKey !== prevTransferKey) {
    setPrevTransferKey(transferKey)
    if (movementType === 'transfer' && movementLocationId) {
      if (movementToLocationId === movementLocationId || !destinationLocationOptions.some((d) => d.value === movementToLocationId)) {
        const firstAlt = destinationLocationOptions[0]
        if (firstAlt) {
          setMovementToLocationId(firstAlt.value)
        }
      }
    }
  }

  // Auto-set current weight when selecting a product for repair
  const [prevRepairKey, setPrevRepairKey] = useState('')
  const repairKey = `${movementType}_${movementProductId}`
  if (repairKey !== prevRepairKey) {
    setPrevRepairKey(repairKey)
    if (movementType === 'repair' && selectedMovementProduct) {
      setMovementNewWeight(String(selectedMovementProduct.weight || ''))
    }
  }

  // Piece Weight Handlers for Product Catalog
  const handleAddProdPieceWeight = (rawInput?: string) => {
    const text = rawInput !== undefined ? rawInput : prodPieceInput
    if (!text.trim()) return
    const nums = text
      .split(/[\s,]+/)
      .map((s) => {
        const val = parseFloat(s.trim())
        return isNaN(val) ? NaN : Number(val.toFixed(3))
      })
      .filter((n) => !isNaN(n) && n > 0)
    if (nums.length === 0) return
    const updated = [...prodPieceWeights, ...nums]
    setProdPieceWeights(updated)
    setProdPieceInput('')
    if (!editingProductId) {
      setProdInitialStock(String(updated.length))
    }
  }

  const handleRemoveProdPieceWeight = (index: number) => {
    const updated = prodPieceWeights.filter((_, i) => i !== index)
    setProdPieceWeights(updated)
    if (!editingProductId) {
      setProdInitialStock(String(updated.length))
    }
  }

  // Piece Weight Handlers for Multi-Item Purchases
  const handleAddPurchasePieceWeight = (itemId: string, rawInput?: string) => {
    const item = purchaseItems.find((it) => it.id === itemId)
    if (!item) return
    const text = rawInput !== undefined ? rawInput : item.pieceInput
    if (!text.trim()) return
    const nums = text
      .split(/[\s,]+/)
      .map((s) => {
        const val = parseFloat(s.trim())
        return isNaN(val) ? NaN : Number(val.toFixed(3))
      })
      .filter((n) => !isNaN(n) && n > 0)
    if (nums.length === 0) return
    const combined = [...item.pieceWeights, ...nums]
    setPurchaseItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it
        return {
          ...it,
          pieceWeights: combined,
          quantity: String(combined.length),
          pieceInput: ''
        }
      })
    )
  }

  const handleRemovePurchasePieceWeight = (itemId: string, index: number) => {
    setPurchaseItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it
        const updated = it.pieceWeights.filter((_, i) => i !== index)
        return {
          ...it,
          pieceWeights: updated,
          quantity: updated.length > 0 ? String(updated.length) : '1'
        }
      })
    )
  }

  // Movement Idol Piece Selection
  const isMovementProductAnIdol = useMemo(() => {
    return selectedMovementProduct?.category === 'Idols'
  }, [selectedMovementProduct])

  const availableMovementPieces = useMemo(() => {
    if (!selectedMovementProduct || !movementLocationId) return []
    return selectedMovementProduct.pieceWeightsByLocation?.[movementLocationId] || []
  }, [selectedMovementProduct, movementLocationId])

  const [prevMovementPieceKey, setPrevMovementPieceKey] = useState('')
  const movementPieceKey = `${movementProductId}_${movementLocationId}_${availableMovementPieces.join(',')}`
  if (movementPieceKey !== prevMovementPieceKey) {
    setPrevMovementPieceKey(movementPieceKey)
    if (isMovementProductAnIdol && availableMovementPieces.length > 0) {
      if (!movementPieceWeight || !availableMovementPieces.includes(Number(movementPieceWeight))) {
        setMovementPieceWeight(String(availableMovementPieces[0]))
      }
    } else if (isMovementProductAnIdol && availableMovementPieces.length === 0) {
      setMovementPieceWeight('')
    }
  }

  // Handlers for Products
  const handleOpenAddProduct = () => {
    setEditingProductId(null)
    setIsProductCategoryMetalLocked(false)
    setProdName('')
    const isIdolsDefault = selectedCategory === 'Idols'
    const initialCategory: ProductCategory = isIdolsDefault ? 'Idols' : 'Bullions'
    setProdCategory(initialCategory)
    if (isIdolsDefault) {
      setProdBrand('Local')
      setProdMetal('Silver')
      setProdPurity('925')
    } else {
      setProdBrand('MMTC PAMP')
      setProdMetal('Gold')
      setProdPurity('999.9')
    }
    setProdSku('')
    setProdWeight('')
    setProdInitialStock('')
    setProdInitialLocationId(userAssignedLocationId || locations[0]?.id || '')
    setProdPieceWeights([])
    setProdPieceInput('')
    setProductFormError(null)
    setIsProductFormOpen(true)
  }

  const handleEditProduct = (p: Product) => {
    setEditingProductId(p.id)
    setProdName(p.name)
    const cat = (p.category === 'MMTC PAMP' ? 'Bullions' : p.category) as ProductCategory
    setProdCategory(cat)
    setProdBrand((p.brand as ProductBrand) || (p.category === 'MMTC PAMP' ? 'MMTC PAMP' : 'Local'))
    setProdMetal(p.metal || 'Gold')
    setProdSku(p.sku)
    setProdWeight(String(p.weight || ''))
    setProdPurity(p.purity || (p.metal === 'Silver' ? '925' : '999.9'))
    setProdInitialStock('')
    setProdInitialLocationId('')
    setProdPieceWeights(p.pieceWeights || [])
    setProdPieceInput('')
    setProductFormError(null)

    // Check if category and metal should be locked (has stock or transaction history entries)
    const hasStock = Number(p.stock || 0) > 0 || Object.values(p.stockByLocation || {}).some((s) => Number(s) > 0)
    const hasEntriesLocal = transactions.some((t) => t.productId === p.id)
    const isLocked = Boolean(hasStock || hasEntriesLocal)
    setIsProductCategoryMetalLocked(isLocked)
    if (!isLocked) {
      getTransactionsPage({ productId: p.id, limitCount: 1 }).then((res) => {
        if (res.transactions && res.transactions.length > 0) {
          setIsProductCategoryMetalLocked(true)
        }
      }).catch(() => {})
    }

    setIsProductFormOpen(true)
  }

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prodName.trim()) {
      setProductFormError('Product name is required')
      return
    }
    if (!prodSku.trim()) {
      setProductFormError('SKU code is required')
      return
    }

    // Enforce unique SKU (case-insensitive across active products)
    const cleanSku = prodSku.trim().toUpperCase()
    const duplicateSku = products.find(
      (p) => p.id !== editingProductId && !p.isArchived && p.sku.trim().toUpperCase() === cleanSku
    )
    if (duplicateSku) {
      setProductFormError(`A product with SKU "${cleanSku}" already exists (${duplicateSku.name}). SKUs must be unique.`)
      return
    }

    const isIdol = prodCategory === 'Idols'
    let weightNum = Number(prodWeight)
    if (!isIdol) {
      if (isNaN(weightNum) || weightNum <= 0) {
        setProductFormError('Product weight is mandatory and must be greater than 0 grams.')
        return
      }
    } else {
      if (editingProductId) {
        const existingP = products.find((p) => p.id === editingProductId)
        weightNum = Number(existingP?.weight || 0)
      } else {
        if (prodPieceWeights.length > 0) {
          weightNum = Number((prodPieceWeights.reduce((a, b) => a + b, 0) / prodPieceWeights.length).toFixed(3))
        } else {
          weightNum = 0
        }
      }
    }

    setProductFormSubmitting(true)
    setProductFormError(null)

    try {
      const effectiveBrand = prodCategory === 'Bullions' ? prodBrand : 'Local'
      if (editingProductId) {
        await updateProduct(editingProductId, {
          name: prodName,
          category: prodCategory,
          brand: effectiveBrand,
          metal: prodMetal,
          sku: cleanSku,
          weight: weightNum,
          purity: prodPurity
        })
        setProducts((prev) =>
          prev.map((p) =>
            p.id === editingProductId
              ? {
                  ...p,
                  name: prodName,
                  category: prodCategory,
                  brand: effectiveBrand,
                  metal: prodMetal,
                  sku: cleanSku,
                  weight: isIdol ? (p.weight || 0) : weightNum,
                  purity: prodPurity,
                  updatedAt: new Date().toISOString()
                }
              : p
          )
        )
      } else {
        const effectiveInitLocId = isLocationLocked && userAssignedLocationId ? userAssignedLocationId : prodInitialLocationId
        const initLocName = locationMap.get(effectiveInitLocId) || adminUser?.assignedLocationName || ''
        const initStock = isIdol ? prodPieceWeights.length : (Number(prodInitialStock) || 0)
        const newId = await addProduct({
          name: prodName,
          category: prodCategory,
          brand: effectiveBrand,
          metal: prodMetal,
          sku: cleanSku,
          weight: weightNum,
          purity: prodPurity,
          pieceWeights: isIdol ? prodPieceWeights : undefined,
          initialStock: initStock,
          initialLocationId: effectiveInitLocId || undefined,
          initialLocationName: initLocName || undefined
        })
        const newProductItem: Product = {
          id: newId,
          name: prodName,
          category: prodCategory,
          brand: effectiveBrand,
          metal: prodMetal,
          sku: cleanSku,
          weight: weightNum,
          purity: prodPurity,
          stock: initStock,
          stockByLocation: effectiveInitLocId ? { [effectiveInitLocId]: initStock } : {},
          isArchived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...(isIdol && prodPieceWeights.length > 0 ? {
            pieceWeights: prodPieceWeights,
            pieceWeightsByLocation: effectiveInitLocId ? { [effectiveInitLocId]: prodPieceWeights } : {}
          } : {})
        }
        setProducts((prev) => [newProductItem, ...prev])
        if (initStock > 0 && effectiveInitLocId) {
          const initTx: Transaction = {
            id: `tx-${Date.now()}`,
            type: 'purchase',
            productId: newId,
            productName: prodName,
            category: prodCategory,
            metal: prodMetal,
            quantity: initStock,
            locationId: effectiveInitLocId,
            locationName: initLocName,
            date: getTodayIST(),
            notes: 'Opening stock upon product creation',
            createdAt: new Date().toISOString(),
            ...(isIdol ? { pieceWeights: prodPieceWeights } : {})
          }
          setTransactions((prev) => [initTx, ...prev])
        }
      }
      setIsProductFormOpen(false)
      toast.success(editingProductId ? 'Product updated successfully' : 'Product added to catalog')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save product'
      setProductFormError(msg)
      toast.error(msg)
    } finally {
      setProductFormSubmitting(false)
    }
  }

  const executeDeleteProduct = async () => {
    if (archivedSession) {
      toast.error('Destructive actions are disabled in offline archive view')
      return
    }
    if (!deleteProductTarget) return
    try {
      await deleteProduct(deleteProductTarget.id)
      setProducts((prev) =>
        prev.map((p) => (p.id === deleteProductTarget.id ? { ...p, isArchived: true } : p))
      )
      toast.success(`Product "${deleteProductTarget.name}" archived`, {
        description: 'Product hidden from active sales and stock movements. Ledger history preserved.'
      })
      setDeleteProductTarget(null)
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Failed to archive product'
      toast.error(msg)
    }
  }

  // Handlers for Purchases
  const handleOpenAddPurchase = () => {
    setPurchaseLocationId(isLocationLocked && userAssignedLocationId ? userAssignedLocationId : '')
    setPurchaseDate('')
    setPurchaseNotes('')
    setPurchaseError(null)
    setPurchaseItems([
      {
        id: String(Date.now()),
        productId: '',
        quantity: '',
        price: '',
        pieceWeights: [],
        pieceInput: ''
      }
    ])
    setIsPurchaseFormOpen(true)
  }

  const handleAddPurchaseItem = () => {
    setPurchaseItems((prev) => [
      ...prev,
      {
        id: String(Date.now() + Math.random()),
        productId: '',
        quantity: '',
        price: '',
        pieceWeights: [],
        pieceInput: ''
      }
    ])
  }

  const handleRemovePurchaseItem = (id: string) => {
    setPurchaseItems((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((it) => it.id !== id)
    })
  }

  const handleUpdatePurchaseItem = (id: string, updates: Partial<PurchaseLineItem>) => {
    setPurchaseItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        const next = { ...it, ...updates }
        if (updates.productId && updates.productId !== it.productId) {
          next.pieceWeights = []
          next.pieceInput = ''
          const newP = products.find((p) => p.id === updates.productId)
          next.quantity = newP?.category === 'Idols' ? '0' : ''
        }
        return next
      })
    )
  }

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault()
    const effectiveLocId = isLocationLocked && userAssignedLocationId ? userAssignedLocationId : purchaseLocationId
    if (!effectiveLocId) {
      setPurchaseError('Please select a receiving location')
      return
    }

    if (!purchaseDate) {
      setPurchaseError('Please select a purchase date')
      return
    }

    if (purchaseItems.length === 0) {
      setPurchaseError('Please add at least one item')
      return
    }

    const validatedItems: Array<{
      prod: Product
      qty: number
      price?: number
      pieceWeights?: number[]
    }> = []

    for (let i = 0; i < purchaseItems.length; i++) {
      const item = purchaseItems[i]
      const itemNum = i + 1
      const prod = products.find((p) => p.id === item.productId)
      if (!prod) {
        setPurchaseError(`Item #${itemNum}: Please select a valid product`)
        return
      }

      const isIdol = prod.category === 'Idols'
      const qty = isIdol ? item.pieceWeights.length : Number(item.quantity)

      if (isIdol && item.pieceWeights.length === 0) {
        setPurchaseError(`Item #${itemNum} (${prod.name}): Please enter at least one piece weight for this Idol purchase batch`)
        return
      }

      if (isNaN(qty) || qty <= 0) {
        setPurchaseError(`Item #${itemNum} (${prod.name}): Quantity must be at least 1`)
        return
      }

      const unitPrice = item.price ? Number(item.price) : undefined
      if (unitPrice !== undefined && (isNaN(unitPrice) || unitPrice < 0)) {
        setPurchaseError(`Item #${itemNum} (${prod.name}): Please enter a valid purchase price`)
        return
      }

      validatedItems.push({
        prod,
        qty,
        price: unitPrice,
        pieceWeights: isIdol ? item.pieceWeights : undefined
      })
    }

    setPurchaseSubmitting(true)
    setPurchaseError(null)
    try {
      const locName = locationMap.get(effectiveLocId) || adminUser?.assignedLocationName || ''
      const invoiceRef = purchaseNotes.trim() || `PUR-${Date.now().toString(36).toUpperCase()}`

      const createdTransactions: Transaction[] = []
      for (const it of validatedItems) {
        const res = await recordTransaction({
          type: 'purchase',
          productId: it.prod.id,
          productName: it.prod.name,
          category: it.prod.category,
          metal: it.prod.metal,
          quantity: it.qty,
          pieceWeights: it.pieceWeights,
          price: it.price,
          locationId: effectiveLocId,
          locationName: locName,
          date: purchaseDate,
          notes: invoiceRef
        })

        if (res?.transaction) {
          createdTransactions.push(res.transaction)
        }
      }

      setTransactions((prev) => [...createdTransactions, ...prev])

      setProducts((prev) => {
        let updated = [...prev]
        for (const it of validatedItems) {
          updated = updated.map((p) => {
            if (p.id !== it.prod.id) return p
            const newStock = (p.stock || 0) + it.qty
            const newStockByLoc = {
              ...(p.stockByLocation || {}),
              [effectiveLocId]: (p.stockByLocation?.[effectiveLocId] || 0) + it.qty
            }
            let newPieces = p.pieceWeights ? [...p.pieceWeights] : []
            const newPiecesByLoc = p.pieceWeightsByLocation ? { ...p.pieceWeightsByLocation } : {}
            if (it.pieceWeights && it.pieceWeights.length > 0) {
              newPieces = [...newPieces, ...it.pieceWeights]
              const locPieces = newPiecesByLoc[effectiveLocId] ? [...newPiecesByLoc[effectiveLocId]] : []
              newPiecesByLoc[effectiveLocId] = [...locPieces, ...it.pieceWeights]
            }
            return {
              ...p,
              stock: newStock,
              stockByLocation: newStockByLoc,
              ...(it.pieceWeights ? {
                pieceWeights: newPieces,
                pieceWeightsByLocation: newPiecesByLoc,
                weight: newPieces.length > 0 ? Number((newPieces.reduce((a, b) => a + b, 0) / newPieces.length).toFixed(3)) : p.weight
              } : {})
            }
          })
        }
        return updated
      })

      setIsPurchaseFormOpen(false)
      toast.success(
        validatedItems.length === 1
          ? 'Purchase recorded successfully'
          : `Recorded purchase with ${validatedItems.length} items successfully`
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record purchase'
      setPurchaseError(msg)
      toast.error(msg)
    } finally {
      setPurchaseSubmitting(false)
    }
  }

  // Handlers for Movements
  const handleOpenMovement = (type?: MovementSubtype) => {
    const targetType = type && allowedMovementTypes.includes(type)
      ? type
      : (allowedMovementTypes[0] || 'transfer')
    setMovementType(targetType)
    setMovementProductId('')
    setMovementLocationId(isLocationLocked && userAssignedLocationId ? userAssignedLocationId : '')
    setMovementToLocationId('')
    setMovementQty('')
    setMovementDate('')
    setMovementNotes('')
    setMovementRepairCharge('')
    setMovementRecoveredWeight('')
    setMovementPieceWeight('')
    setMovementAdjustmentMode('deficit')
    setMovementNewWeight('')
    setMovementError(null)
    setIsMovementFormOpen(true)
  }

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!allowedMovementTypes.includes(movementType)) {
      setMovementError('You do not have permission to record this movement type')
      return
    }
    const prod = products.find((p) => p.id === movementProductId)
    if (!prod) {
      setMovementError('Please select a product')
      return
    }
    const effectiveLocId = isLocationLocked && userAssignedLocationId ? userAssignedLocationId : movementLocationId
    if (!effectiveLocId) {
      setMovementError('Please select a source location')
      return
    }
    if (!movementDate) {
      setMovementError('Please select a movement date')
      return
    }

    setMovementSubmitting(true)
    setMovementError(null)

    try {
      const locName = locationMap.get(effectiveLocId) || adminUser?.assignedLocationName || ''
      const toLocName = movementToLocationId ? locationMap.get(movementToLocationId) : undefined
      let res: { id: string; transaction: Transaction } | undefined

      if (movementType === 'repair') {
        const oldW = Number(prod.weight || 0)
        const newW = Number(movementNewWeight)
        if (isNaN(newW) || newW <= 0) {
          throw new Error('Please enter a valid new weight in grams')
        }
        res = await recordTransaction({
          type: 'repair',
          productId: prod.id,
          productName: prod.name,
          category: prod.category,
          metal: prod.metal,
          locationId: effectiveLocId,
          locationName: locName,
          previousWeight: oldW,
          newWeight: newW,
          price: movementRepairCharge ? Number(movementRepairCharge) : undefined,
          date: movementDate,
          notes: movementNotes
        })
        setProducts((prev) =>
          prev.map((p) => (p.id === prod.id ? { ...p, weight: newW } : p))
        )
      } else if (movementType === 'melt') {
        const isIdol = prod.category === 'Idols'
        if (isIdol && !movementPieceWeight) {
          throw new Error('Please select which specific piece weight to melt')
        }
        const qty = isIdol ? 1 : Number(movementQty)
        if (isNaN(qty) || qty <= 0) throw new Error('Quantity to melt must be > 0')
        res = await recordTransaction({
          type: 'melt',
          productId: prod.id,
          productName: prod.name,
          category: prod.category,
          metal: prod.metal,
          quantity: qty,
          pieceWeight: isIdol ? Number(movementPieceWeight) : undefined,
          locationId: effectiveLocId,
          locationName: locName,
          recoveredWeight: movementRecoveredWeight ? Number(movementRecoveredWeight) : undefined,
          date: movementDate,
          notes: movementNotes
        })
        setProducts((prev) =>
          prev.map((p) => {
            if (p.id !== prod.id) return p
            const newStock = Math.max(0, (p.stock || 0) - qty)
            const newStockByLoc = {
              ...(p.stockByLocation || {}),
              [effectiveLocId]: Math.max(0, (p.stockByLocation?.[effectiveLocId] || 0) - qty)
            }
            const newPieces = p.pieceWeights ? [...p.pieceWeights] : []
            const newPiecesByLoc = p.pieceWeightsByLocation ? { ...p.pieceWeightsByLocation } : {}
            if (isIdol && movementPieceWeight) {
              const numPW = Number(movementPieceWeight)
              const idx = newPieces.indexOf(numPW)
              if (idx !== -1) newPieces.splice(idx, 1)
              const locPieces = newPiecesByLoc[effectiveLocId] ? [...newPiecesByLoc[effectiveLocId]] : []
              const lIdx = locPieces.indexOf(numPW)
              if (lIdx !== -1) locPieces.splice(lIdx, 1)
              newPiecesByLoc[effectiveLocId] = locPieces
            }
            return {
              ...p,
              stock: newStock,
              stockByLocation: newStockByLoc,
              ...(isIdol ? {
                pieceWeights: newPieces,
                pieceWeightsByLocation: newPiecesByLoc,
                weight: newPieces.length > 0 ? Number((newPieces.reduce((a, b) => a + b, 0) / newPieces.length).toFixed(3)) : 0
              } : {})
            }
          })
        )
      } else if (movementType === 'transfer') {
        const isIdol = prod.category === 'Idols'
        if (isIdol && !movementPieceWeight) {
          throw new Error('Please select which specific piece weight to transfer')
        }
        const qty = isIdol ? 1 : Number(movementQty)
        if (isNaN(qty) || qty <= 0) throw new Error('Transfer quantity must be > 0')
        if (effectiveLocId === movementToLocationId) {
          throw new Error('Source and destination locations cannot be identical')
        }
        res = await recordTransaction({
          type: 'transfer',
          productId: prod.id,
          productName: prod.name,
          category: prod.category,
          metal: prod.metal,
          quantity: qty,
          pieceWeight: isIdol ? Number(movementPieceWeight) : undefined,
          locationId: effectiveLocId,
          locationName: locName,
          toLocationId: movementToLocationId,
          toLocationName: toLocName,
          date: movementDate,
          notes: movementNotes
        })
        setProducts((prev) =>
          prev.map((p) => {
            if (p.id !== prod.id) return p
            const newStockByLoc = {
              ...(p.stockByLocation || {}),
              [effectiveLocId]: Math.max(0, (p.stockByLocation?.[effectiveLocId] || 0) - qty),
              [movementToLocationId]: (p.stockByLocation?.[movementToLocationId] || 0) + qty
            }
            const newPiecesByLoc = p.pieceWeightsByLocation ? { ...p.pieceWeightsByLocation } : {}
            if (isIdol && movementPieceWeight) {
              const numPW = Number(movementPieceWeight)
              const srcPieces = newPiecesByLoc[effectiveLocId] ? [...newPiecesByLoc[effectiveLocId]] : []
              const sIdx = srcPieces.indexOf(numPW)
              if (sIdx !== -1) srcPieces.splice(sIdx, 1)
              newPiecesByLoc[effectiveLocId] = srcPieces
              const destPieces = newPiecesByLoc[movementToLocationId] ? [...newPiecesByLoc[movementToLocationId]] : []
              newPiecesByLoc[movementToLocationId] = [...destPieces, numPW]
            }
            return {
              ...p,
              stockByLocation: newStockByLoc,
              ...(isIdol ? { pieceWeightsByLocation: newPiecesByLoc } : {})
            }
          })
        )
      } else if (movementType === 'adjustment') {
        const isIdol = prod.category === 'Idols'
        let qty = Number(movementQty)
        if (isIdol) {
          qty = movementAdjustmentMode === 'deficit' ? -1 : 1
          if (!movementPieceWeight || isNaN(Number(movementPieceWeight)) || Number(movementPieceWeight) <= 0) {
            throw new Error(movementAdjustmentMode === 'deficit'
              ? 'Please select which specific piece to write off'
              : 'Please enter a valid piece weight in grams')
          }
        }
        if (isNaN(qty) || qty === 0) throw new Error('Adjustment quantity cannot be 0')
        res = await recordTransaction({
          type: 'adjustment',
          productId: prod.id,
          productName: prod.name,
          category: prod.category,
          metal: prod.metal,
          quantity: qty,
          pieceWeight: isIdol ? Number(movementPieceWeight) : undefined,
          locationId: effectiveLocId,
          locationName: locName,
          date: movementDate,
          notes: movementNotes
        })
        setProducts((prev) =>
          prev.map((p) => {
            if (p.id !== prod.id) return p
            const newStock = Math.max(0, (p.stock || 0) + qty)
            const newStockByLoc = {
              ...(p.stockByLocation || {}),
              [effectiveLocId]: Math.max(0, (p.stockByLocation?.[effectiveLocId] || 0) + qty)
            }
            const newPieces = p.pieceWeights ? [...p.pieceWeights] : []
            const newPiecesByLoc = p.pieceWeightsByLocation ? { ...p.pieceWeightsByLocation } : {}
            if (isIdol && movementPieceWeight) {
              const numPW = Number(movementPieceWeight)
              if (qty < 0) {
                const idx = newPieces.indexOf(numPW)
                if (idx !== -1) newPieces.splice(idx, 1)
                const locPieces = newPiecesByLoc[effectiveLocId] ? [...newPiecesByLoc[effectiveLocId]] : []
                const lIdx = locPieces.indexOf(numPW)
                if (lIdx !== -1) locPieces.splice(lIdx, 1)
                newPiecesByLoc[effectiveLocId] = locPieces
              } else {
                newPieces.push(numPW)
                const locPieces = newPiecesByLoc[effectiveLocId] ? [...newPiecesByLoc[effectiveLocId]] : []
                locPieces.push(numPW)
                newPiecesByLoc[effectiveLocId] = locPieces
              }
            }
            return {
              ...p,
              stock: newStock,
              stockByLocation: newStockByLoc,
              ...(isIdol ? {
                pieceWeights: newPieces,
                pieceWeightsByLocation: newPiecesByLoc,
                weight: newPieces.length > 0 ? Number((newPieces.reduce((a, b) => a + b, 0) / newPieces.length).toFixed(3)) : 0
              } : {})
            }
          })
        )
      }

      if (res?.transaction) {
        setTransactions((prev) => [res.transaction, ...prev])
      }
      setIsMovementFormOpen(false)
      toast.success(`${movementType.charAt(0).toUpperCase() + movementType.slice(1)} recorded successfully`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record movement'
      setMovementError(msg)
      toast.error(msg)
    } finally {
      setMovementSubmitting(false)
    }
  }

  const executeDeleteTransaction = async () => {
    if (archivedSession) {
      toast.error('Destructive actions are disabled in offline archive view')
      return
    }
    if (!deleteTxTarget) return
    try {
      const res = await deleteTransaction(deleteTxTarget)
      setTransactions((prev) => {
        const updated = prev.map((t) => (t.id === deleteTxTarget.id ? { ...t, isReversed: true } : t))
        if (res.reversingEntry) {
          return [res.reversingEntry, ...updated]
        }
        return updated
      })

      // Invert stock effect in products
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== deleteTxTarget.productId) return p
          const qty = Number(deleteTxTarget.quantity || 0)
          const locId = deleteTxTarget.locationId
          const toLocId = deleteTxTarget.toLocationId

          if (deleteTxTarget.type === 'purchase') {
            const newStock = Math.max(0, (p.stock || 0) - qty)
            const newStockByLoc = {
              ...(p.stockByLocation || {}),
              [locId]: Math.max(0, (p.stockByLocation?.[locId] || 0) - qty)
            }
            return { ...p, stock: newStock, stockByLocation: newStockByLoc }
          } else if (deleteTxTarget.type === 'transfer' && toLocId) {
            const newStockByLoc = {
              ...(p.stockByLocation || {}),
              [locId]: (p.stockByLocation?.[locId] || 0) + qty,
              [toLocId]: Math.max(0, (p.stockByLocation?.[toLocId] || 0) - qty)
            }
            return { ...p, stockByLocation: newStockByLoc }
          } else if (deleteTxTarget.type === 'adjustment') {
            const newStock = Math.max(0, (p.stock || 0) - qty)
            const newStockByLoc = {
              ...(p.stockByLocation || {}),
              [locId]: Math.max(0, (p.stockByLocation?.[locId] || 0) - qty)
            }
            return { ...p, stock: newStock, stockByLocation: newStockByLoc }
          } else if (deleteTxTarget.type === 'melt') {
            const newStock = (p.stock || 0) + qty
            const newStockByLoc = {
              ...(p.stockByLocation || {}),
              [locId]: (p.stockByLocation?.[locId] || 0) + qty
            }
            return { ...p, stock: newStock, stockByLocation: newStockByLoc }
          }
          return p
        })
      )

      toast.success('Reversing entry posted successfully')
      setDeleteTxTarget(null)
    } catch (err: unknown) {
      console.error('Failed to reverse transaction', err)
      const msg = err instanceof Error ? err.message : 'Failed to reverse transaction'
      toast.error(msg)
    }
  }

  // Quick header sort toggle
  const toggleSort = (field: 'name' | 'sku' | 'weight' | 'stock' | 'date') => {
    if (field === 'date') {
      setSortBy('last_modified')
    } else if (field === 'name') {
      setSortBy((prev) => (prev === 'name_asc' ? 'name_desc' : 'name_asc'))
    } else if (field === 'sku') {
      setSortBy('sku_asc')
    } else if (field === 'weight') {
      setSortBy((prev) => (prev === 'weight_desc' ? 'weight_asc' : 'weight_desc'))
    } else if (field === 'stock') {
      setSortBy((prev) => (prev === 'stock_desc' ? 'stock_asc' : 'stock_desc'))
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-black mb-1">Inventory</h1>
          <p className="text-gray-500 text-sm">
            Catalog, stock levels, and movements.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="file"
            ref={archiveInputRef}
            accept=".json,application/json"
            onChange={handleArchiveFileUpload}
            className="hidden"
          />

          {hasPermission('archive', 'uploadArchive') && (
            <button
              onClick={() => archiveInputRef.current?.click()}
              title="Upload an offline archive JSON file to inspect historical transactions"
              className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 hover:text-black hover:bg-gray-50 rounded-lg text-xs font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]"
            >
              <Upload size={14} />
              Upload Archive
            </button>
          )}

          {!archivedSession && hasPermission('archive', 'zeroBalance') && (
            <button
              onClick={() => setIsZeroBalanceModalOpen(true)}
              title="Master Zero Balance: Export archive, clear all history and scrub audit trail while keeping live stock"
              className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 hover:text-black hover:bg-gray-50 rounded-lg text-xs font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]"
            >
              <RotateCcw size={14} />
              Zero Balance
            </button>
          )}

          {!archivedSession && activeTab === 'products' && hasPermission('products', 'add') && (
            <button
              onClick={handleOpenAddProduct}
              className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-black text-white hover:bg-gray-800 rounded-lg text-xs font-semibold transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              <Plus size={14} />
              Add Product
            </button>
          )}

          {!archivedSession && activeTab === 'purchases' && hasPermission('purchases', 'add') && (
            <button
              onClick={handleOpenAddPurchase}
              disabled={products.length === 0 || locations.length === 0}
              className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-black text-white hover:bg-gray-800 disabled:opacity-40 rounded-lg text-xs font-semibold transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              <Plus size={14} />
              Record Purchase
            </button>
          )}

          {!archivedSession &&
            activeTab === 'movements' &&
            allowedMovementTypes.length > 0 && (
              <button
                onClick={() => handleOpenMovement(allowedMovementTypes[0])}
                disabled={products.length === 0 || locations.length === 0}
                className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-black text-white hover:bg-gray-800 disabled:opacity-40 rounded-lg text-xs font-semibold transition-[background-color,transform] duration-150 active:scale-[0.97]"
              >
                <Plus size={14} />
                Record Movement
              </button>
            )}
        </div>
      </div>

      {/* Offline Archive Viewer Active Notification */}
      {archivedSession && (
        <div className={`mb-6 p-4 rounded-xl flex items-center justify-between flex-wrap gap-3 border ${
          archivedSession.verification.status === 'tampered'
            ? 'bg-red-50/70 border-red-300'
            : archivedSession.verification.status === 'verified'
              ? 'bg-emerald-50/60 border-emerald-300'
              : 'bg-gray-50 border-gray-300'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              archivedSession.verification.status === 'tampered'
                ? 'bg-red-600 text-white'
                : archivedSession.verification.status === 'verified'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-black text-white'
            }`}>
              <Archive size={16} />
            </div>
            <div>
              <div className="text-sm font-bold text-black flex items-center gap-2 flex-wrap">
                Viewing Offline Archive: {archivedSession.filename}
                {archivedSession.verification.status === 'verified' && (
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300"
                    title={archivedSession.verification.message}
                  >
                    ✓ Cryptographically Verified (Server Sealed)
                  </span>
                )}
                {archivedSession.verification.status === 'tampered' && (
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-300 animate-pulse"
                    title={archivedSession.verification.message}
                  >
                    ⚠️ TAMPER WARNING: Altered Archive (Invalid Signature / Hash)
                  </span>
                )}
                {archivedSession.verification.status === 'unverified' && (
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300"
                    title={archivedSession.verification.message}
                  >
                    ⚠️ Unverified Archive (Unsigned / Not in System Registry)
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-600 mt-0.5">
                {archivedSession.transactions.length} historical transactions · {archivedSession.auditLogs.length} audit logs · Exported {new Date(archivedSession.exportedAt).toLocaleDateString()}
              </div>
            </div>
          </div>
          <button
            onClick={exitArchive}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:text-black hover:bg-gray-100 transition-[background-color,transform] active:scale-[0.97]"
          >
            <X size={13} />
            Exit Archive View
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center border-b border-gray-200 mb-6 overflow-x-auto">
        {allowedTabs.includes('products') && (
          <button
            onClick={() => {
              setActiveTab('products')
              setIsProductFormOpen(false)
              setIsPurchaseFormOpen(false)
              setIsMovementFormOpen(false)
            }}
            className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap ${activeTab === 'products'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
              }`}
          >
            <Package size={16} />
            Products ({products.length})
          </button>
        )}
        {allowedTabs.includes('purchases') && (
          <button
            onClick={() => {
              setActiveTab('purchases')
              setIsProductFormOpen(false)
              setIsPurchaseFormOpen(false)
              setIsMovementFormOpen(false)
            }}
            className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap ${activeTab === 'purchases'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
              }`}
          >
            <ShoppingBag size={16} />
            Purchases ({displayTransactions.filter((t) => t.type === 'purchase').length})
          </button>
        )}
        {allowedTabs.includes('movements') && (
          <button
            onClick={() => {
              setActiveTab('movements')
              setIsProductFormOpen(false)
              setIsPurchaseFormOpen(false)
              setIsMovementFormOpen(false)
            }}
            className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap ${activeTab === 'movements'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
              }`}
          >
            <Layers size={16} />
            Movements ({filteredMovements.length})
          </button>
        )}
        {archivedSession && (
          <button
            onClick={() => {
              setActiveTab('archived-audit')
              setIsProductFormOpen(false)
              setIsPurchaseFormOpen(false)
              setIsMovementFormOpen(false)
            }}
            className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap ${activeTab === 'archived-audit'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
              }`}
          >
            <History size={16} />
            Archived Audit Trail ({archivedSession.auditLogs.length})
          </button>
        )}
      </div>

      {/* Date Range Filter Bar for Purchases and Movements */}
      {(activeTab === 'purchases' || activeTab === 'movements') && (
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
                  setDateRangePreset(preset.id)
                  setPurchasesPage(1)
                  setMovementsPage(1)
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
                    setCustomStartDate(d)
                    setPurchasesPage(1)
                    setMovementsPage(1)
                  }}
                  placeholder="Start Date"
                />
              </div>
              <span className="text-xs text-gray-400">to</span>
              <div className="w-36">
                <CustomDatePicker
                  value={customEndDate}
                  onChange={(d) => {
                    setCustomEndDate(d)
                    setPurchasesPage(1)
                    setMovementsPage(1)
                  }}
                  placeholder="End Date"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dual Filter Pills (Category + Metal) & Sort Controls */}
      <div className="flex flex-col gap-3 mb-6">
        {/* Movements Subtype Filter */}
        {activeTab === 'movements' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Movement:</span>
            {(['All', 'transfer', 'adjustment', 'repair', 'melt'] as const).map((mType) => {
              const labelMap: Record<string, string> = {
                All: 'All',
                transfer: 'Transfers',
                adjustment: 'Stock Adjustments',
                repair: 'Repairs',
                melt: 'Melts'
              }
              const isActive = movementTypeFilter === mType
              return (
                <button
                  key={mType}
                  onClick={() => setMovementTypeFilter(mType)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${isActive
                    ? 'bg-black text-white border border-black shadow-xs'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                    }`}
                >
                  {labelMap[mType]}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Category Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Category:</span>
              <button
                onClick={() => setSelectedCategory('All')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${selectedCategory === 'All'
                  ? 'bg-black text-white border border-black shadow-xs'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                  }`}
              >
                All
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

            {/* Metal Filter (Gold / Silver) */}
            <div className="flex items-center gap-1.5 border-l border-gray-200 pl-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Metal:</span>
              <button
                onClick={() => setSelectedMetal('All')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${selectedMetal === 'All'
                  ? 'bg-black text-white border border-black shadow-xs'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                  }`}
              >
                All
              </button>
              {METALS.map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMetal(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${selectedMetal === m
                    ? 'bg-black text-white border border-black shadow-xs'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                    }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Brand Filter */}
            <div className="flex items-center gap-1.5 border-l border-gray-200 pl-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Brand:</span>
              <button
                onClick={() => setSelectedBrand('All')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${selectedBrand === 'All'
                  ? 'bg-black text-white border border-black shadow-xs'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                  }`}
              >
                All
              </button>
              {BULLION_BRANDS.map((b) => (
                <button
                  key={b}
                  onClick={() => setSelectedBrand(b)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${selectedBrand === b
                    ? 'bg-black text-white border border-black shadow-xs'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                    }`}
                >
                  {b}
                </button>
              ))}
            </div>

            {/* Product Status (Active / Archived) */}
            {activeTab === 'products' && (
              <div className="flex items-center gap-1.5 border-l border-gray-200 pl-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Status:</span>
                {(['active', 'archived', 'all'] as const).map((st) => {
                  const labelMap = { active: 'Active Catalog', archived: 'Archived', all: 'All Products' }
                  const isActive = productStatusFilter === st
                  return (
                    <button
                      key={st}
                      onClick={() => setProductStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${isActive
                        ? 'bg-black text-white border border-black shadow-xs'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                        }`}
                    >
                      {labelMap[st]}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Sort Control on Products Tab */}
          {activeTab === 'products' && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Sort by:</span>
              <div className="w-56">
                <CustomSelect
                  value={sortBy}
                  onValueChange={(val) => setSortBy(val as SortField)}
                  options={sortOptions}
                  buttonClassName="py-1.5 px-3 text-xs rounded-lg"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Product Form Drawer/Card */}
      <AnimatePresence>
        {isProductFormOpen && (
          <motion.div
            initial={{ opacity: 0, transform: "scale(0.97) translateY(8px)" }}
            animate={{ opacity: 1, transform: "scale(1) translateY(0px)" }}
            exit={{ opacity: 0, transform: "scale(0.97) translateY(8px)" }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm"
          >
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-black">
                {editingProductId ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button
                onClick={() => setIsProductFormOpen(false)}
                className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97]"
              >
                <X size={18} />
              </button>
            </div>

            {productFormError && (
              <div className="mb-4 p-3 bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle size={14} className="text-gray-600" />
                {productFormError}
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. MMTC Gold Bar 10g / Silver Lakshmi Idol"
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                      Category <span className="text-red-500">*</span>
                    </label>
                    {isProductCategoryMetalLocked && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                        <Lock className="w-3 h-3 text-gray-500" />
                        Locked
                      </span>
                    )}
                  </div>
                  {isProductCategoryMetalLocked ? (
                    <div className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 flex items-center justify-between">
                      <span>{prodCategory}</span>
                      <span className="text-xs font-normal text-gray-400">Has entries / stock</span>
                    </div>
                  ) : (
                    <CustomSelect
                      value={prodCategory}
                      onValueChange={(val) => handleCategoryChange(val as ProductCategory)}
                      options={categoryOptions}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Brand <span className="text-red-500">*</span>
                  </label>
                  {prodCategory === 'Bullions' ? (
                    <CustomSelect
                      value={prodBrand}
                      onValueChange={(val) => setProdBrand(val as ProductBrand)}
                      options={brandOptions}
                    />
                  ) : (
                    <div className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 flex items-center justify-between">
                      <span>Local</span>
                      <span className="text-xs font-normal text-gray-400">Default</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                      Metal <span className="text-red-500">*</span>
                    </label>
                    {isProductCategoryMetalLocked && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                        <Lock className="w-3 h-3 text-gray-500" />
                        Locked
                      </span>
                    )}
                  </div>
                  {isProductCategoryMetalLocked ? (
                    <div className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 flex items-center justify-between">
                      <span>{prodMetal}</span>
                      <span className="text-xs font-normal text-gray-400">Has entries / stock</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleMetalChange('Gold')}
                        className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 flex items-center justify-center active:scale-[0.97] ${prodMetal === 'Gold'
                          ? 'bg-black text-white shadow-sm'
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                      >
                        Gold
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMetalChange('Silver')}
                        className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 flex items-center justify-center active:scale-[0.97] ${prodMetal === 'Silver'
                          ? 'bg-black text-white shadow-sm'
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                      >
                        Silver
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    SKU Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GP-10G / IDOL-SLV-100"
                    value={prodSku}
                    onChange={(e) => setProdSku(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black uppercase transition-[border-color] duration-150"
                    required
                  />
                </div>

                <div>
                  {isIdolCategory ? (
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                        Average Weight
                      </label>
                      <div className="px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-black flex items-center justify-between">
                        <span>
                          {prodPieceWeights.length > 0
                            ? `~${formatWeight(prodPieceWeights.reduce((a, b) => a + b, 0) / prodPieceWeights.length)} avg`
                            : 'Variable'}
                        </span>
                        <span className="text-xs font-normal text-gray-500">
                          {prodPieceWeights.length} pcs
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                        Weight (Grams) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        placeholder="e.g. 10.000 (mandatory)"
                        value={prodWeight}
                        onChange={(e) => setProdWeight(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 text-black placeholder-gray-400 focus:outline-none focus:border-black rounded-lg text-sm transition-[border-color] duration-150"
                        required
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Purity ({prodMetal}) <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect
                    value={prodPurity}
                    onValueChange={setProdPurity}
                    options={purityOptions}
                    placeholder="Select purity..."
                  />
                </div>
              </div>

              {/* Idol Piece-Level Weight Registry */}
              {isIdolCategory && (
                <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
                        {editingProductId && <Lock className="w-3.5 h-3.5 text-gray-500" />}
                        Piece-Level Weight Registry {editingProductId ? '(Locked)' : ''}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {editingProductId
                          ? 'Pieces are managed through inventory movements. Change pieces only through purchases and adjustments.'
                          : 'Each idol piece has a distinct weight. Enter individual piece weights (press Enter or Add).'}
                      </p>
                    </div>
                    {prodPieceWeights.length > 0 && (
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-black text-white">
                        {prodPieceWeights.length} piece{prodPieceWeights.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>

                  {!editingProductId && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="e.g. 48.250, 51.600, 49.825 (or comma-separated)"
                        value={prodPieceInput}
                        onChange={(e) => setProdPieceInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddProdPieceWeight()
                          }
                        }}
                        className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddProdPieceWeight()}
                        className="px-4 py-2 bg-black text-white text-xs font-semibold rounded-lg hover:bg-gray-800 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                      >
                        + Add Piece
                      </button>
                    </div>
                  )}

                  {prodPieceWeights.length > 0 ? (
                    <div className="space-y-2 pt-1">
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-white rounded-lg border border-gray-200">
                        {prodPieceWeights.map((w, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-800"
                          >
                            <span>#{idx + 1}: <strong>{formatWeight(w)}</strong></span>
                            {!editingProductId && (
                              <button
                                type="button"
                                onClick={() => handleRemoveProdPieceWeight(idx)}
                                className="text-gray-400 hover:text-red-600 transition-colors duration-100 ml-0.5"
                                title="Remove piece"
                              >
                                ✕
                              </button>
                            )}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-600 px-1 pt-1 border-t border-gray-200">
                        <span>Total: <strong>{formatWeight(prodPieceWeights.reduce((a, b) => a + b, 0))}</strong></span>
                        <span>Average: <strong>{formatWeight(prodPieceWeights.reduce((a, b) => a + b, 0) / prodPieceWeights.length)}</strong></span>
                        <span>Quantity: <strong>{prodPieceWeights.length} pcs</strong></span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-3 bg-white/60 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400">
                      {editingProductId
                        ? 'No individual pieces registered. Restock or adjust via Purchases or Adjustments.'
                        : 'No individual pieces registered yet. Add weights above or restock via Purchases.'}
                    </div>
                  )}
                </div>
              )}

              {/* Opening stock (Only on creation) */}
              {!editingProductId && (
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-700 mb-2">
                    Initial Stock Setup (Optional)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Initial Quantity {prodCategory === 'Idols' && '(Derived from pieces above)'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        disabled={prodCategory === 'Idols'}
                        placeholder="0"
                        value={prodCategory === 'Idols' ? String(prodPieceWeights.length) : prodInitialStock}
                        onChange={(e) => setProdInitialStock(e.target.value)}
                        className={`w-full px-3.5 py-2 border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150 ${prodCategory === 'Idols' ? 'bg-gray-100 cursor-not-allowed font-semibold' : 'bg-white'}`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs text-gray-500">Assign to Location</label>
                        {isLocationLocked && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                            <Lock className="w-2.5 h-2.5 text-gray-500" />
                            Assigned Store
                          </span>
                        )}
                      </div>
                      {isLocationLocked ? (
                        <div className="w-full px-3.5 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-black flex items-center justify-between">
                          <span className="font-semibold text-black">
                            {locationMap.get(prodInitialLocationId) || adminUser?.assignedLocationName || 'Assigned Location'}
                          </span>
                          <span className="text-xs text-gray-500">Default & Locked</span>
                        </div>
                      ) : (
                        <CustomSelect
                          value={prodInitialLocationId}
                          onValueChange={setProdInitialLocationId}
                          options={[{ value: '', label: 'Select location...' }, ...locationOptions]}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsProductFormOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={productFormSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                >
                  <Check size={16} />
                  {productFormSubmitting ? 'Saving...' : editingProductId ? 'Update Product' : 'Create Product'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Record Purchase Modal / Card */}
      <AnimatePresence>
        {isPurchaseFormOpen && (
          <motion.div
            initial={{ opacity: 0, transform: "scale(0.97) translateY(8px)" }}
            animate={{ opacity: 1, transform: "scale(1) translateY(0px)" }}
            exit={{ opacity: 0, transform: "scale(0.97) translateY(8px)" }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm"
          >
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-black">Record Purchase</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                  {purchaseItems.length} {purchaseItems.length === 1 ? 'item' : 'items'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsPurchaseFormOpen(false)}
                className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97]"
              >
                <X size={18} />
              </button>
            </div>

            {purchaseError && (
              <div className="mb-4 p-3 bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle size={14} className="text-gray-600 shrink-0" />
                <span>{purchaseError}</span>
              </div>
            )}

            <form onSubmit={handleSavePurchase} className="space-y-5">
              {/* Common Purchase Header */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50/70 border border-gray-200 rounded-xl">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700">
                      Receiving Location <span className="text-red-500">*</span>
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
                      {locationMap.get(purchaseLocationId) || adminUser?.assignedLocationName || 'Assigned Location'}
                    </div>
                  ) : (
                    <CustomSelect
                      value={purchaseLocationId}
                      onValueChange={setPurchaseLocationId}
                      options={locationOptions}
                      placeholder="Select receiving location..."
                    />
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Purchase Date <span className="text-red-500">*</span>
                  </label>
                  <CustomDatePicker
                    value={purchaseDate}
                    onChange={setPurchaseDate}
                    placeholder="Select purchase date"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Notes / Supplier Ref (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Supplier Invoice #9821, MMTC lot 44"
                    value={purchaseNotes}
                    onChange={(e) => setPurchaseNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                  />
                </div>
              </div>

              {/* Purchase Line Items List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Purchase Line Items ({purchaseItems.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddPurchaseItem}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-black bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                  >
                    <Plus size={13} />
                    Add Another Item
                  </button>
                </div>

                <div className="space-y-3">
                  {purchaseItems.map((item, idx) => {
                    const prod = products.find((p) => p.id === item.productId)
                    const isIdol = prod?.category === 'Idols'
                    const lineTotal = (Number(item.price) || 0) * (isIdol ? item.pieceWeights.length : Number(item.quantity) || 0)

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
                                ({prod.category} · {prod.metal})
                              </span>
                            )}
                          </div>

                          {purchaseItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemovePurchaseItem(item.id)}
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
                              value={item.productId}
                              onValueChange={(val) => handleUpdatePurchaseItem(item.id, { productId: val })}
                              options={productOptions}
                              placeholder="Select product to restock..."
                            />
                            {prod ? (
                              <div className="text-[11px] text-gray-500 mt-1">
                                Current stock at location: <strong>{prod.stockByLocation?.[purchaseLocationId] || 0} units</strong>
                              </div>
                            ) : (
                              <div className="text-[11px] text-gray-400 mt-1">
                                Select a product to view stock
                              </div>
                            )}
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-600 mb-1">
                              Qty <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              min="1"
                              disabled={isIdol}
                              placeholder={isIdol ? '0' : 'Qty'}
                              value={isIdol ? String(item.pieceWeights.length || 0) : item.quantity}
                              onChange={(e) => handleUpdatePurchaseItem(item.id, { quantity: e.target.value })}
                              className={`w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150 ${isIdol ? 'bg-gray-100 cursor-not-allowed font-semibold' : ''}`}
                              required
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-600 mb-1">
                              Unit Cost (₹)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="e.g. 75000"
                              value={item.price}
                              onChange={(e) => handleUpdatePurchaseItem(item.id, { price: e.target.value })}
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-600 mb-1">
                              Total
                            </label>
                            <div className="h-[34px] px-3 bg-gray-100 border border-gray-200 rounded-lg flex items-center justify-end font-bold text-xs text-black tabular-nums">
                              {lineTotal > 0 ? `₹${lineTotal.toLocaleString('en-IN')}` : '—'}
                            </div>
                          </div>
                        </div>

                        {/* Idol piece weight batch registration */}
                        {isIdol && (
                          <div className="pt-2 border-t border-gray-200/60 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-700">
                                Register Piece Weights for this Idol Batch
                              </span>
                              {item.pieceWeights.length > 0 && (
                                <span className="text-[11px] font-bold text-black bg-gray-200 px-2 py-0.5 rounded">
                                  {item.pieceWeights.length} pcs ({formatWeight(item.pieceWeights.reduce((a, b) => a + b, 0))})
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="e.g. 48.250, 51.600, 49.825"
                                value={item.pieceInput}
                                onChange={(e) => handleUpdatePurchaseItem(item.id, { pieceInput: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    handleAddPurchasePieceWeight(item.id)
                                  }
                                }}
                                className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddPurchasePieceWeight(item.id)}
                                className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded-lg hover:bg-gray-800 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                              >
                                + Add Piece
                              </button>
                            </div>

                            {item.pieceWeights.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-white rounded-lg border border-gray-200">
                                {item.pieceWeights.map((w, pieceIdx) => (
                                  <span
                                    key={pieceIdx}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 border border-gray-200 text-xs font-medium text-gray-800"
                                  >
                                    <span>#{pieceIdx + 1}: {formatWeight(w)}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemovePurchasePieceWeight(item.id, pieceIdx)}
                                      className="text-gray-400 hover:text-red-600 transition-colors ml-0.5"
                                      title="Remove piece"
                                    >
                                      ✕
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Purchase Summary Footer */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-6 divide-x divide-gray-200 text-xs">
                  <div>
                    <span className="text-gray-500 block">Total Items</span>
                    <span className="font-bold text-sm text-black tabular-nums">
                      {purchaseItems.length} {purchaseItems.length === 1 ? 'item' : 'items'} ({purchaseTotals.totalUnits} units)
                    </span>
                  </div>
                  {purchaseTotals.totalWeightGrams > 0 && (
                    <div className="pl-6">
                      <span className="text-gray-500 block">Total Weight</span>
                      <span className="font-bold text-sm text-black tabular-nums">
                        {formatWeight(purchaseTotals.totalWeightGrams)}
                      </span>
                    </div>
                  )}
                  {purchaseTotals.grandTotal > 0 && (
                    <div className="pl-6">
                      <span className="text-gray-500 block">Total Value</span>
                      <span className="font-extrabold text-base text-black tabular-nums">
                        ₹{purchaseTotals.grandTotal.toLocaleString('en-IN')}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPurchaseFormOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={purchaseSubmitting || purchaseTotals.totalUnits === 0}
                    className="px-5 py-2 text-xs font-semibold text-white bg-black hover:bg-black/85 rounded-lg shadow-xs transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    <Check size={14} />
                    {purchaseSubmitting ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </>
                    ) : (
                      `Record Purchase (${purchaseItems.length} ${purchaseItems.length === 1 ? 'item' : 'items'})`
                    )}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Movement Modal / Card */}
      <AnimatePresence>
        {isMovementFormOpen && (
          <motion.div
            initial={{ opacity: 0, transform: "scale(0.97) translateY(8px)" }}
            animate={{ opacity: 1, transform: "scale(1) translateY(0px)" }}
            exit={{ opacity: 0, transform: "scale(0.97) translateY(8px)" }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm"
          >
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-black">Record Stock Movement</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Transfer between locations, audit inventory counts, log repairs, or melt scrap metal.
                </p>
              </div>
              <button
                onClick={() => setIsMovementFormOpen(false)}
                className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Segmented Control for Movement Type - Only show movement types user may record */}
            <div className="flex items-center p-1 bg-gray-100 rounded-lg mb-5 max-w-md">
              {allowedMovementTypes.map((type) => {
                const labelMap: Record<MovementSubtype, string> = {
                  transfer: 'Transfer',
                  adjustment: 'Audit / Adjust',
                  repair: 'Repair',
                  melt: 'Melt'
                }
                const isActive = movementType === type
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setMovementType(type)
                      setMovementError(null)
                    }}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${isActive
                      ? 'bg-white text-black shadow-xs font-bold'
                      : 'text-gray-500 hover:text-black'
                      }`}
                  >
                    {labelMap[type]}
                  </button>
                )
              })}
            </div>

            {movementError && (
              <div className="mb-4 p-3 bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle size={14} className="text-gray-600" />
                {movementError}
              </div>
            )}

            <form onSubmit={handleSaveMovement} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Select Product <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect
                    value={movementProductId}
                    onValueChange={setMovementProductId}
                    options={productOptions}
                    placeholder="Select product..."
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                      {movementType === 'transfer' ? 'Source Location *' : 'Location *'}
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
                        {locationMap.get(movementLocationId) || adminUser?.assignedLocationName || 'Assigned Location'}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">Default & Locked</span>
                    </div>
                  ) : (
                    <CustomSelect
                      value={movementLocationId}
                      onValueChange={setMovementLocationId}
                      options={movementLocationOptions}
                      placeholder="Select location..."
                    />
                  )}
                </div>
              </div>

              {/* Type-Specific Fields */}
              {movementType === 'transfer' && (
                <div className="space-y-4">
                  {/* Idol Piece Selection for Transfer */}
                  {isMovementProductAnIdol && (
                    <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                          Select Idol Piece to Transfer <span className="text-red-500">*</span>
                        </label>
                        <span className="text-[11px] text-gray-500 font-medium">
                          {availableMovementPieces.length} available at source
                        </span>
                      </div>
                      {availableMovementPieces.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                          {availableMovementPieces.map((pw, i) => (
                            <button
                              key={`${pw}-${i}`}
                              type="button"
                              onClick={() => setMovementPieceWeight(String(pw))}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${String(movementPieceWeight) === String(pw)
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
                          No idol pieces in stock at {locationMap.get(movementLocationId) || 'selected source'}.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                        Destination Location <span className="text-red-500">*</span>
                      </label>
                      <CustomSelect
                        value={movementToLocationId}
                        onValueChange={setMovementToLocationId}
                        options={destinationLocationOptions}
                        placeholder={locations.length < 2 ? 'At least 2 locations required' : 'Select destination location...'}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                        Transfer Quantity <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={currentSourceStock > 0 ? currentSourceStock : undefined}
                        disabled={isMovementProductAnIdol}
                        value={isMovementProductAnIdol ? '1' : movementQty}
                        onChange={(e) => setMovementQty(e.target.value)}
                        className={`w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150 ${isMovementProductAnIdol ? 'bg-gray-100 cursor-not-allowed font-semibold' : ''
                          }`}
                        required
                      />
                      {isMovementProductAnIdol && (
                        <p className="text-[11px] text-gray-500 mt-1">
                          Idols are transferred 1 unique piece at a time.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Real-time Transfer Flow Preview */}
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-gray-700">
                      <span>Source: <strong>{locationMap.get(movementLocationId) || '—'}</strong> ({currentSourceStock} units)</span>
                      <span className="text-gray-400">→</span>
                      <span>Destination: <strong>{locationMap.get(movementToLocationId) || '—'}</strong> ({currentDestStock} units)</span>
                    </div>
                    {Number(movementQty) > 0 && (
                      <div className="pt-1.5 border-t border-gray-200/60 flex items-center justify-between text-[11px]">
                        <span className={Number(movementQty) > currentSourceStock ? 'text-black font-semibold' : 'text-gray-500'}>
                          {Number(movementQty) > currentSourceStock
                            ? `Insufficient stock: only ${currentSourceStock} units available at source`
                            : `After transfer: ${currentSourceStock - Number(movementQty)} remaining · ${currentDestStock + Number(movementQty)} at destination`}
                        </span>
                        <span className="font-semibold text-black">Moving {movementQty} unit{Number(movementQty) === 1 ? '' : 's'}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {movementType === 'adjustment' && (
                <div className="space-y-4">
                  {isMovementProductAnIdol ? (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-200">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-800">
                            Idol Piece Adjustment Mode <span className="text-red-500">*</span>
                          </label>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Adjust idol stock at {locationMap.get(movementLocationId) || 'selected store'} piece by piece.
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 self-start sm:self-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setMovementAdjustmentMode('deficit')
                              setMovementQty('-1')
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${
                              movementAdjustmentMode === 'deficit'
                                ? 'bg-black text-white shadow-xs'
                                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            Deficit / Write-off Piece (-1)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMovementAdjustmentMode('surplus')
                              setMovementQty('1')
                              setMovementPieceWeight('')
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${
                              movementAdjustmentMode === 'surplus'
                                ? 'bg-black text-white shadow-xs'
                                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            Surplus / Add Piece (+1)
                          </button>
                        </div>
                      </div>

                      {movementAdjustmentMode === 'deficit' ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-700 font-semibold uppercase tracking-wider">
                              Select Piece to Write Off <span className="text-red-500">*</span>
                            </span>
                            <span className="text-[11px] text-gray-500 font-medium">
                              {availableMovementPieces.length} available at location
                            </span>
                          </div>
                          {availableMovementPieces.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-white rounded-lg border border-gray-200">
                              {availableMovementPieces.map((pw, i) => (
                                <button
                                  key={`${pw}-${i}`}
                                  type="button"
                                  onClick={() => setMovementPieceWeight(String(pw))}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${
                                    String(movementPieceWeight) === String(pw)
                                      ? 'bg-black text-white shadow-xs'
                                      : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                                  }`}
                                >
                                  #{i + 1}: {formatWeight(pw)}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-red-600 font-medium p-2 bg-red-50 border border-red-200 rounded-lg">
                              No idol pieces available at {locationMap.get(movementLocationId) || 'selected store'} to write off.
                            </p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                            New Piece Weight (Grams) <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            min="0.001"
                            placeholder="e.g. 52.350"
                            value={movementPieceWeight}
                            onChange={(e) => setMovementPieceWeight(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                            required
                          />
                          <p className="text-xs text-gray-400 mt-1">
                            Adds an unrecorded or found idol piece directly to {locationMap.get(movementLocationId) || 'this location'}.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                          Quantity Adjustment (+ or -) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          placeholder="e.g. +2 or -1"
                          value={movementQty}
                          onChange={(e) => setMovementQty(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                          required
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          Positive number for surplus found, or negative for shrinkage / damaged units.
                        </p>
                      </div>

                      <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg text-xs flex flex-col justify-center">
                        <div className="text-gray-500">Current Stock: <strong className="text-black">{currentSourceStock} units</strong></div>
                        <div className="mt-1 pt-1 border-t border-gray-200/60 font-semibold text-black">
                          New Stock: {currentSourceStock + (Number(movementQty) || 0)} units
                          {Number(movementQty) !== 0 && (
                            <span className="ml-1.5 text-[11px] font-normal text-gray-500">
                              ({Number(movementQty) > 0 ? `+${movementQty} surplus` : `${movementQty} deficit`})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {movementType === 'repair' && (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>Original Weight: <strong>{formatWeight(selectedMovementProduct?.weight)}</strong></span>
                    {movementNewWeight && (
                      <span className="font-semibold text-black">
                        Net Change:{' '}
                        {(Number(movementNewWeight) - (selectedMovementProduct?.weight || 0)).toFixed(3)}g
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                        New Weight (Grams) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        placeholder="e.g. 102.500"
                        value={movementNewWeight}
                        onChange={(e) => setMovementNewWeight(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                        required
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Updates physical weight of the product in system inventory.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                        Repair / Labor Charge (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="e.g. 1500"
                        value={movementRepairCharge}
                        onChange={(e) => setMovementRepairCharge(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                      />
                    </div>
                  </div>
                </div>
              )}

              {movementType === 'melt' && (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
                  <div className="p-3 bg-zinc-100/70 border border-zinc-200 rounded-lg text-xs text-zinc-700 flex items-center gap-2">
                    <span className="font-semibold">Notice:</span>
                    <span>Melt decrements physical item count at {locationMap.get(movementLocationId) || 'selected location'} and records recovered pure metal weight.</span>
                  </div>

                  {/* Idol Piece Selection for Melt */}
                  {isMovementProductAnIdol && (
                    <div className="p-3.5 bg-white border border-gray-200 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                          Select Idol Piece to Melt <span className="text-red-500">*</span>
                        </label>
                        <span className="text-[11px] text-gray-500 font-medium">
                          {availableMovementPieces.length} available at location
                        </span>
                      </div>
                      {availableMovementPieces.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                          {availableMovementPieces.map((pw, i) => (
                            <button
                              key={`${pw}-${i}`}
                              type="button"
                              onClick={() => setMovementPieceWeight(String(pw))}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${String(movementPieceWeight) === String(pw)
                                ? 'bg-black text-white shadow-xs'
                                : 'bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100'
                                }`}
                            >
                              #{i + 1}: {formatWeight(pw)}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-black font-semibold">
                          No idol pieces in stock at {locationMap.get(movementLocationId) || 'selected location'}.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                        Quantity to Melt <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={currentSourceStock > 0 ? currentSourceStock : undefined}
                        disabled={isMovementProductAnIdol}
                        value={isMovementProductAnIdol ? '1' : movementQty}
                        onChange={(e) => setMovementQty(e.target.value)}
                        className={`w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150 ${isMovementProductAnIdol ? 'bg-gray-100 cursor-not-allowed font-semibold' : ''
                          }`}
                        required
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Available to melt at this location: {currentSourceStock} units
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                        Recovered Raw Weight (Grams)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="e.g. 98.400"
                        value={movementRecoveredWeight}
                        onChange={(e) => setMovementRecoveredWeight(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <CustomDatePicker
                    value={movementDate}
                    onChange={setMovementDate}
                    placeholder="Select movement date"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Reason / Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Physical count discrepancy, store stock replenishment"
                    value={movementNotes}
                    onChange={(e) => setMovementNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMovementFormOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={movementSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                >
                  <Check size={16} />
                  {movementSubmitting ? 'Recording...' : `Confirm ${movementType.charAt(0).toUpperCase() + movementType.slice(1)}`}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Areas */}
      {loading ? (
        <div className="flex justify-center items-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
        </div>
      ) : allowedTabs.length === 0 ? (
        <div className="w-full py-16 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-gray-500">
            <Lock size={24} />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-black mb-2">Access Restricted</h2>
          <p className="text-sm text-gray-500 max-w-md">
            You do not have permission to view products, purchases, or movements.
          </p>
        </div>
      ) : activeTab === 'products' && allowedTabs.includes('products') ? (
        processedProducts.length === 0 ? (
          <EmptyState
            title="No products in this filter"
            description="Add your first product to start tracking inventory across Gold & Silver."
            action={
              <button
                onClick={handleOpenAddProduct}
                className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-[background-color,transform] duration-150 active:scale-[0.97]"
              >
                <Plus size={16} />
                Add Product
              </button>
            }
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase font-semibold text-gray-500 tracking-wider">
                  <tr>
                    <th
                      onClick={() => toggleSort('name')}
                      className="px-6 py-3.5 cursor-pointer hover:text-black transition-colors select-none"
                    >
                      <div className="inline-flex items-center gap-1.5">
                        <span>Product</span>
                        {sortBy === 'name_asc' ? (
                          <ArrowUp size={13} className="text-black" />
                        ) : sortBy === 'name_desc' ? (
                          <ArrowDown size={13} className="text-black" />
                        ) : (
                          <ArrowUpDown size={13} className="text-gray-400" />
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3.5">Category</th>
                    <th className="px-6 py-3.5">Brand</th>
                    <th className="px-6 py-3.5">Metal</th>
                    <th
                      onClick={() => toggleSort('sku')}
                      className="px-6 py-3.5 cursor-pointer hover:text-black transition-colors select-none"
                    >
                      <div className="inline-flex items-center gap-1.5">
                        <span>SKU</span>
                        {sortBy === 'sku_asc' ? (
                          <ArrowUp size={13} className="text-black" />
                        ) : (
                          <ArrowUpDown size={13} className="text-gray-400" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => toggleSort('weight')}
                      className="px-6 py-3.5 cursor-pointer hover:text-black transition-colors select-none"
                    >
                      <div className="inline-flex items-center gap-1.5">
                        <span>Weight / Purity</span>
                        {sortBy === 'weight_desc' ? (
                          <ArrowDown size={13} className="text-black" />
                        ) : sortBy === 'weight_asc' ? (
                          <ArrowUp size={13} className="text-black" />
                        ) : (
                          <ArrowUpDown size={13} className="text-gray-400" />
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3.5">Stock by Location</th>
                    <th
                      onClick={() => toggleSort('stock')}
                      className="px-6 py-3.5 text-right cursor-pointer hover:text-black transition-colors select-none"
                    >
                      <div className="inline-flex items-center justify-end gap-1.5 w-full">
                        <span>Total Stock</span>
                        {sortBy === 'stock_desc' ? (
                          <ArrowDown size={13} className="text-black" />
                        ) : sortBy === 'stock_asc' ? (
                          <ArrowUp size={13} className="text-black" />
                        ) : (
                          <ArrowUpDown size={13} className="text-gray-400" />
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {processedProducts.map((p) => {
                    const locEntries = Object.entries(p.stockByLocation || {}).filter(
                      ([, qty]) => Number(qty) > 0
                    )
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/70 transition-[background-color] duration-100">
                        <td className="px-6 py-4 font-semibold text-black">
                          <div className="flex items-center gap-2">
                            <span>{p.name}</span>
                            {p.isArchived && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 border border-gray-300 rounded">
                                Archived
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            {p.category}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium border border-gray-200 text-gray-700 bg-white shadow-2xs">
                            {p.brand || (p.category === 'MMTC PAMP' ? 'MMTC PAMP' : 'Local')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium border border-gray-200 text-gray-700 bg-gray-50">
                            {p.metal}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-gray-600">
                          {p.sku}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {p.category === 'Idols' ? (
                            <div>
                              <span className="font-semibold text-black">
                                {p.weight && p.weight > 0 ? `~${formatWeight(p.weight)} avg` : 'Variable'}
                              </span>{' '}
                              · {p.purity || '—'}
                              {p.pieceWeights && p.pieceWeights.length > 0 && (
                                <div className="text-[11px] text-gray-500 font-mono flex items-center gap-1 mt-0.5" title={p.pieceWeights.map((w) => formatWeight(w)).join(', ')}>
                                  <span className="font-semibold text-gray-600">{p.pieceWeights.length} pcs:</span>
                                  <span className="text-gray-400 truncate max-w-[120px]">
                                    {p.pieceWeights.slice(0, 3).map((w) => formatWeight(w)).join(', ')}
                                    {p.pieceWeights.length > 3 && ` +${p.pieceWeights.length - 3}`}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <strong>{formatWeight(p.weight)}</strong> · {p.purity || '—'}
                            </>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {locEntries.length === 0 ? (
                            <span className="text-xs text-gray-400 italic">No location stock</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {locEntries.map(([locId, qty]) => (
                                <span
                                  key={locId}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-50 border border-gray-200 text-xs text-gray-700"
                                >
                                  <span className="text-gray-400">{locationMap.get(locId) || 'Loc'}:</span>
                                  <strong className="font-semibold text-black">{qty}</strong>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-md text-xs font-bold ${p.stock > 0 ? 'bg-black text-white' : 'bg-gray-100 text-gray-400 border border-gray-200'
                            }`}>
                            {p.stock} units
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            {!archivedSession && hasPermission('products', 'edit') && (
                              <button
                                onClick={() => handleEditProduct(p)}
                                title="Edit"
                                className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                              >
                                <Edit2 size={15} />
                              </button>
                            )}
                            {!archivedSession && hasPermission('products', 'delete') && (
                              <button
                                onClick={() => setDeleteProductTarget(p)}
                                title={p.isArchived ? "Product Archived" : "Archive Product"}
                                disabled={p.isArchived}
                                className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-100 disabled:opacity-30 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                              >
                                <Archive size={15} />
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
          </div>
        )
      ) : activeTab === 'purchases' && allowedTabs.includes('purchases') ? (
        filteredPurchases.length === 0 ? (
          <EmptyState
            title="No purchases recorded"
            description="Purchases record incoming stock inventory and automatically increase product counts at designated locations."
            action={
              hasPermission('purchases', 'add') ? (
                <button
                  onClick={handleOpenAddPurchase}
                  disabled={products.length === 0 || locations.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                >
                  <Plus size={16} />
                  Record First Purchase
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
                    <th className="px-6 py-3.5">Product</th>
                    <th className="px-6 py-3.5">Category</th>
                    <th className="px-6 py-3.5">Metal</th>
                    <th className="px-6 py-3.5">Location</th>
                    <th className="px-6 py-3.5 text-right">Quantity</th>
                    <th className="px-6 py-3.5 text-right">Unit Price</th>
                    <th className="px-6 py-3.5 text-right">Total (₹)</th>
                    <th className="px-6 py-3.5">Notes</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedPurchases.map((tx) => {
                    const totalVal = tx.price ? tx.price * tx.quantity : 0
                    return (
                      <tr key={tx.id} className="hover:bg-gray-50/70 transition-[background-color] duration-100">
                        <td className="px-6 py-4 text-xs font-mono text-gray-500">
                          {tx.date}
                        </td>
                        <td className="px-6 py-4 font-semibold text-black">
                          {tx.productName}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-600">
                          {tx.category}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium border border-gray-200 text-gray-700 bg-gray-50">
                            {tx.metal || '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          {tx.locationName}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums font-semibold text-black">
                          +{tx.quantity}
                          {tx.pieceWeights && tx.pieceWeights.length > 0 && (
                            <div className="text-[11px] font-mono text-gray-500 font-normal">
                              avg {formatWeight(tx.pieceWeights.reduce((a, b) => a + b, 0) / tx.pieceWeights.length)}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums text-gray-600">
                          {tx.price ? `₹${tx.price.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums font-semibold text-black">
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
                          {(tx.isOpeningBalance || tx.isOpeningEntry) && (
                            <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              Opening Balance
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {!archivedSession && hasPermission('purchases', 'delete') && !tx.isReversed && !tx.reversalOf && !tx.isOpeningBalance && !tx.isOpeningEntry && (
                            <button
                              onClick={() => setDeleteTxTarget(tx)}
                              title="Post reversing entry"
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

            {/* Pagination Controls */}
            {filteredPurchases.length > pageSize && (
              <div className="px-6 py-3.5 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>
                  Showing{' '}
                  <strong className="text-black font-semibold">
                    {(purchasesPage - 1) * pageSize + 1}
                  </strong>{' '}
                  to{' '}
                  <strong className="text-black font-semibold">
                    {Math.min(purchasesPage * pageSize, filteredPurchases.length)}
                  </strong>{' '}
                  of{' '}
                  <strong className="text-black font-semibold">
                    {filteredPurchases.length}
                  </strong>{' '}
                  purchases
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPurchasesPage((p) => Math.max(1, p - 1))}
                    disabled={purchasesPage <= 1}
                    className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-black hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97]"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="font-medium text-black">
                    Page {purchasesPage} of {totalPurchasesPages}
                  </span>
                  <button
                    onClick={() => setPurchasesPage((p) => Math.min(totalPurchasesPages, p + 1))}
                    disabled={purchasesPage >= totalPurchasesPages}
                    className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-black hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97]"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      ) : activeTab === 'movements' && allowedTabs.includes('movements') ? (
        filteredMovements.length === 0 ? (
          <EmptyState
            title="No stock movements recorded"
            description={
              movementTypeFilter !== 'All'
                ? `No ${movementTypeFilter} records found under the current filters.`
                : 'Stock movements track transfers between stores, physical count audits, idol weight repairs, and scrap melts.'
            }
            action={
              allowedMovementTypes.length > 0 ? (
                <button
                  onClick={() => handleOpenMovement(allowedMovementTypes[0])}
                  disabled={products.length === 0 || locations.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                >
                  <Plus size={16} />
                  Record Movement
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
                    <th className="px-6 py-3.5">Type</th>
                    <th className="px-6 py-3.5">Product</th>
                    <th className="px-6 py-3.5">Metal</th>
                    <th className="px-6 py-3.5">Location / Route</th>
                    <th className="px-6 py-3.5 text-right">Qty / Effect</th>
                    <th className="px-6 py-3.5">Details</th>
                    <th className="px-6 py-3.5">Notes</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedMovements.map((tx) => {
                    return (
                      <tr key={tx.id} className="hover:bg-gray-50/70 transition-[background-color] duration-100">
                        <td className="px-6 py-4 text-xs font-mono text-gray-500">
                          {tx.date}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex px-2.5 py-0.5 rounded-lg text-xs font-medium border border-gray-200 bg-gray-50 text-gray-800 capitalize">
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-semibold text-black">
                          {tx.productName}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium border border-gray-200 text-gray-700 bg-gray-50">
                            {tx.metal || '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-700">
                          {tx.type === 'transfer' ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-gray-600">{tx.locationName}</span>
                              <span className="text-gray-400">→</span>
                              <strong className="text-black">{tx.toLocationName}</strong>
                            </div>
                          ) : (
                            <span className="font-medium text-black">{tx.locationName}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums">
                          {tx.type === 'transfer' && (
                            <div>
                              <span className="font-semibold text-black">{tx.quantity} unit{tx.quantity === 1 ? '' : 's'}</span>
                              {tx.pieceWeight && (
                                <span className="text-[11px] font-mono text-gray-500 block font-normal">
                                  ({formatWeight(tx.pieceWeight)})
                                </span>
                              )}
                              <span className="text-[11px] text-gray-400 block font-normal">transferred</span>
                            </div>
                          )}
                          {tx.type === 'adjustment' && (
                            <div>
                              <span className={`font-semibold ${tx.quantity > 0 ? 'text-black' : 'text-gray-800'}`}>
                                {tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity} unit{Math.abs(tx.quantity) === 1 ? '' : 's'}
                              </span>
                              <span className={`text-[11px] block font-normal ${tx.quantity > 0 ? 'text-gray-500' : 'text-gray-400'}`}>
                                {tx.quantity > 0 ? 'surplus audit' : 'deficit audit'}
                              </span>
                            </div>
                          )}
                          {tx.type === 'melt' && (
                            <div>
                              <span className="font-semibold text-black">−{tx.quantity} unit{tx.quantity === 1 ? '' : 's'}</span>
                              {tx.pieceWeight && (
                                <span className="text-[11px] font-mono text-gray-500 block font-normal">
                                  ({formatWeight(tx.pieceWeight)})
                                </span>
                              )}
                              <span className="text-[11px] text-gray-400 block font-normal">melted</span>
                            </div>
                          )}
                          {tx.type === 'repair' && (
                            <div>
                              <span className="font-semibold text-black">{formatWeight(tx.newWeight)}</span>
                              <span className="text-[11px] text-gray-400 block font-normal">was {formatWeight(tx.previousWeight)}</span>
                            </div>
                          )}
                          {tx.type === 'opening' && (
                            <div>
                              <span className="font-semibold text-black">{tx.quantity} unit{tx.quantity === 1 ? '' : 's'}</span>
                              {tx.weight !== undefined && (
                                <span className="text-[11px] font-mono text-gray-600 block font-normal">
                                  {formatWeight(tx.weight)}
                                </span>
                              )}
                              {Array.isArray(tx.pieceWeights) && tx.pieceWeights.length > 0 && (
                                <span className="text-[10px] font-mono text-gray-500 block font-normal" title={tx.pieceWeights.map((w) => formatWeight(w)).join(', ')}>
                                  {tx.pieceWeights.length} pcs ({tx.pieceWeights.slice(0, 2).map((w) => formatWeight(w)).join(', ')}{tx.pieceWeights.length > 2 ? '…' : ''})
                                </span>
                              )}
                              <span className="text-[11px] text-blue-600 block font-normal">opening baseline</span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-600">
                          {tx.type === 'repair' && (
                            <div className="space-y-0.5">
                              <div>
                                {tx.weightChange !== undefined && (
                                  <span className="font-medium text-black">
                                    {tx.weightChange > 0 ? `+${formatWeight(tx.weightChange)}` : formatWeight(tx.weightChange)} change
                                  </span>
                                )}
                              </div>
                              {tx.price ? <div className="text-gray-500">Labor: ₹{tx.price.toLocaleString('en-IN')}</div> : null}
                            </div>
                          )}
                          {tx.type === 'melt' && tx.recoveredWeight && (
                            <span className="text-gray-700">
                              Recovered: <strong className="text-black">{formatWeight(tx.recoveredWeight)}</strong> pure
                            </span>
                          )}
                          {tx.type !== 'repair' && tx.type !== 'melt' && <span className="text-gray-300">—</span>}
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
                          {(tx.isOpeningBalance || tx.isOpeningEntry) && (
                            <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              Opening Balance
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {!archivedSession && hasPermission('movements', 'delete') && !tx.isReversed && !tx.reversalOf && !tx.isOpeningBalance && !tx.isOpeningEntry && (
                            <button
                              onClick={() => setDeleteTxTarget(tx)}
                              title="Post reversing entry"
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

            {/* Pagination Controls */}
            {filteredMovements.length > pageSize && (
              <div className="px-6 py-3.5 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>
                  Showing{' '}
                  <strong className="text-black font-semibold">
                    {(movementsPage - 1) * pageSize + 1}
                  </strong>{' '}
                  to{' '}
                  <strong className="text-black font-semibold">
                    {Math.min(movementsPage * pageSize, filteredMovements.length)}
                  </strong>{' '}
                  of{' '}
                  <strong className="text-black font-semibold">
                    {filteredMovements.length}
                  </strong>{' '}
                  movements
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMovementsPage((p) => Math.max(1, p - 1))}
                    disabled={movementsPage <= 1}
                    className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-black hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97]"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="font-medium text-black">
                    Page {movementsPage} of {totalMovementsPages}
                  </span>
                  <button
                    onClick={() => setMovementsPage((p) => Math.min(totalMovementsPages, p + 1))}
                    disabled={movementsPage >= totalMovementsPages}
                    className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-black hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97]"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      ) : activeTab === 'archived-audit' && archivedSession ? (
        <div className="space-y-6">
          {/* Archived Audit Search & Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search archived narrative, user, or entity..."
                value={archivedAuditSearch}
                onChange={(e) => setArchivedAuditSearch(e.target.value)}
                className="w-full pl-3.5 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Entity:</span>
              {(['all', 'product', 'sale', 'movement', 'purchase', 'user', 'archive'] as const).map((ent) => (
                <button
                  key={ent}
                  onClick={() => setArchivedAuditEntityFilter(ent)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${archivedAuditEntityFilter === ent
                    ? 'bg-black text-white border border-black shadow-xs'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                  }`}
                >
                  {ent}
                </button>
              ))}
            </div>
          </div>

          {/* Archived Audit Logs Table */}
          {filteredArchivedAuditLogs.length === 0 ? (
            <EmptyState
              title="No archived audit entries found"
              description="No audit trail events match the current search or entity filters in this archive."
            />
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="px-6 py-3.5">Timestamp</th>
                      <th className="px-6 py-3.5">Operator</th>
                      <th className="px-6 py-3.5">Action</th>
                      <th className="px-6 py-3.5">Entity</th>
                      <th className="px-6 py-3.5">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs">
                    {paginatedArchivedAuditLogs.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-6 py-4 text-gray-500 font-mono whitespace-nowrap">
                          {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-semibold text-black block">{entry.userName}</span>
                          <span className="text-[11px] text-gray-400">{entry.userEmail}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-gray-100 text-gray-700 border border-gray-200">
                            {entry.action}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="capitalize font-medium text-black">{entry.entityType}</span>
                          {entry.entityName && <span className="text-gray-500 block text-[11px] truncate max-w-xs">{entry.entityName}</span>}
                        </td>
                        <td className="px-6 py-4 text-gray-700 max-w-md">
                          <div>{entry.description}</div>
                          {Array.isArray(entry.diffs) && entry.diffs.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {entry.diffs.map((d, idx) => (
                                <span key={idx} className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
                                  {d.label || d.field}: {String(d.oldValue ?? 'None')} → {String(d.newValue ?? 'None')}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalArchivedAuditPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-100 text-xs text-gray-500">
                  <span>
                    Showing {(archivedAuditPage - 1) * archivedAuditPageSize + 1} to{' '}
                    {Math.min(archivedAuditPage * archivedAuditPageSize, filteredArchivedAuditLogs.length)} of{' '}
                    {filteredArchivedAuditLogs.length} archived entries
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setArchivedAuditPage((p) => Math.max(1, p - 1))}
                      disabled={archivedAuditPage <= 1}
                      className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-black hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97]"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="font-medium text-black">
                      Page {archivedAuditPage} of {totalArchivedAuditPages}
                    </span>
                    <button
                      onClick={() => setArchivedAuditPage((p) => Math.min(totalArchivedAuditPages, p + 1))}
                      disabled={archivedAuditPage >= totalArchivedAuditPages}
                      className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-black hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97]"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Product Archive Modal */}
      <ConfirmModal
        isOpen={!!deleteProductTarget}
        title="Archive Product"
        description={`Are you sure you want to archive "${deleteProductTarget?.name}" (${deleteProductTarget?.sku})? The product will be hidden from new sales and stock movements, while all historical transactions and stock audit ledgers remain fully preserved.`}
        confirmText="Archive Product"
        onConfirm={executeDeleteProduct}
        onClose={() => setDeleteProductTarget(null)}
      />

      {/* Transaction Reversal Modal */}
      <ConfirmModal
        isOpen={!!deleteTxTarget}
        title={`Reverse ${deleteTxTarget?.type === 'purchase' ? 'Purchase' : deleteTxTarget?.type === 'transfer' ? 'Transfer' : deleteTxTarget?.type === 'repair' ? 'Repair' : deleteTxTarget?.type === 'melt' ? 'Melt' : 'Adjustment'}`}
        description={`Posting a reversing entry will invert this ${deleteTxTarget?.type} record's stock and weight effects without deleting audit history. This action cannot be undone. Continue?`}
        confirmText="Post Reversing Entry"
        onConfirm={executeDeleteTransaction}
        onClose={() => setDeleteTxTarget(null)}
      />

      {/* Single Master Zero Balance Modal (Export Archive & Clear All History) */}
      <ConfirmModal
        isOpen={isZeroBalanceModalOpen}
        title="Zero Balance All History & Audit Log"
        description="Archives and clears transactions and audit logs up to the specified cutoff date. Consolidated opening balances will be dated the following day. All future entries on or before the cutoff date will be permanently blocked."
        confirmText={zeroBalanceSubmitting ? "Archiving & Erasing..." : "Purge & Zero Balance"}
        disabled={
          zeroBalanceSubmitting ||
          zeroBalanceConfirmText.trim() !== 'CONFIRM ZERO BALANCE' ||
          !zeroBalancePassword.trim()
        }
        onConfirm={handleZeroBalance}
        onClose={() => {
          if (!zeroBalanceSubmitting) {
            setIsZeroBalanceModalOpen(false)
            setZeroBalanceConfirmText('')
            setZeroBalancePassword('')
          }
        }}
      >
        <div className="space-y-4 pt-2">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Closing Fiscal Cutoff Date (inclusive)
              </label>
              <input
                type="date"
                value={zeroBalanceCutoffDate}
                max={getTodayIST()}
                disabled={zeroBalanceSubmitting}
                onChange={(e) => setZeroBalanceCutoffDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150 disabled:opacity-50"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Standard fiscal year closes on 31 March (e.g. 2026-03-31).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200 text-xs">
              <div>
                <span className="text-gray-500 block">Cutoff (Wiped):</span>
                <span className="font-semibold text-red-600">
                  ≤ {formatDisplayDateIST(zeroBalanceCutoffDate)}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block">Opening Entry Date:</span>
                <span className="font-semibold text-emerald-700">
                  {formatDisplayDateIST(zeroBalanceOpeningDate)}
                </span>
              </div>
            </div>
          </div>

          {/* Type to Confirm and Password Re-Auth */}
          <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-xl space-y-3">
            <div>
              <label className="block text-xs font-semibold text-red-900 mb-1">
                Type-to-Confirm: Type <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-red-300 select-all font-bold">CONFIRM ZERO BALANCE</span>
              </label>
              <input
                type="text"
                value={zeroBalanceConfirmText}
                disabled={zeroBalanceSubmitting}
                onChange={(e) => setZeroBalanceConfirmText(e.target.value)}
                placeholder="CONFIRM ZERO BALANCE"
                className="w-full px-3 py-2 bg-white border border-red-300 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-red-600 transition-[border-color] duration-150 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-red-900 mb-1">
                Account Password (Fresh Sign-in Verification)
              </label>
              <input
                type="password"
                value={zeroBalancePassword}
                disabled={zeroBalanceSubmitting}
                onChange={(e) => setZeroBalancePassword(e.target.value)}
                placeholder="Enter your current password"
                className="w-full px-3 py-2 bg-white border border-red-300 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-red-600 transition-[border-color] duration-150 disabled:opacity-50"
              />
              <p className="text-[11px] text-red-700/80 mt-1">
                Server mandates recent authentication within the last 5 minutes to authorize irreversible purges.
              </p>
            </div>
          </div>

          <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 leading-relaxed">
            <strong>Server Lock & Protection:</strong> A distributed lock pauses new entries during the run. The archive is saved server-side with count and SHA-256 checksum recorded before records are deleted. Opening balances cannot be reversed. Future entries on or before {formatDisplayDateIST(zeroBalanceCutoffDate)} will be blocked.
          </div>
        </div>
      </ConfirmModal>
    </div>
  )
}
