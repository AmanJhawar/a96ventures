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
  Trash2,
  ShieldCheck,
  AlertTriangle,
  Pencil
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
  updateTransaction,
  clearTransactionHistory,
  getTransactionsPage,
  downloadArchiveById
} from '@/lib/services/inventory.service'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { SkeletonTable } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ProductFormModal } from './components/ProductFormModal'
import { RecordPurchaseModal } from './components/RecordPurchaseModal'
import { RecordMovementModal } from './components/RecordMovementModal'
import { ProductsTable } from './components/ProductsTable'
import { PurchasesTable } from './components/PurchasesTable'
import { MovementsTable } from './components/MovementsTable'
import { ArchivedAuditTab } from './components/ArchivedAuditTab'
import { ZeroBalanceModal } from './components/ZeroBalanceModal'
import { EditPurchaseModal } from './components/EditPurchaseModal'
import { LocationStockModal } from '@/components/location-stock-modal'

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

  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') as InventoryTab | null

  const [requestedTab, setRequestedTab] = useState<InventoryTab>(() => {
    if (tabParam && ['products', 'purchases', 'movements', 'archived-audit'].includes(tabParam)) {
      return tabParam
    }
    return 'products'
  })

  useEffect(() => {
    if (tabParam && ['products', 'purchases', 'movements', 'archived-audit'].includes(tabParam)) {
      setRequestedTab(tabParam)
    }
  }, [tabParam])

  // Automatically keep activeTab on an allowed tab without cascading effect renders
  const activeTab: InventoryTab = useMemo(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(requestedTab)) {
      return allowedTabs[0]
    }
    return requestedTab
  }, [allowedTabs, requestedTab])

  const setActiveTab = (tab: InventoryTab) => {
    setRequestedTab(tab)
    router.replace(`/admin/inventory?tab=${tab}`, { scroll: false })
  }

  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'All'>('All')
  const [selectedBrand, setSelectedBrand] = useState<string>('All')
  const [selectedMetal, setSelectedMetal] = useState<MetalType | 'All'>('All')
  const [productStatusFilter, setProductStatusFilter] = useState<'active' | 'archived' | 'all'>('active')
  const [sortBy, setSortBy] = useState<SortField>('last_modified')

  // Data state
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedStockLocation, setSelectedStockLocation] = useState<Location | null>(null)
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

  // Edit Purchase modal state (Super Admin only)
  const [editingPurchase, setEditingPurchase] = useState<Transaction | null>(null)
  const [editPurchaseDate, setEditPurchaseDate] = useState('')
  const [editPurchaseLocationId, setEditPurchaseLocationId] = useState('')
  const [editPurchaseQuantity, setEditPurchaseQuantity] = useState('1')
  const [editPurchasePrice, setEditPurchasePrice] = useState('')
  const [editPurchaseVendorName, setEditPurchaseVendorName] = useState('')
  const [editPurchaseNotes, setEditPurchaseNotes] = useState('')
  const [editPurchaseSubmitting, setEditPurchaseSubmitting] = useState(false)
  const [editPurchaseError, setEditPurchaseError] = useState<string | null>(null)

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

  const isPurchaseFormValid = useMemo(() => {
    if (!purchaseLocationId.trim() || !purchaseDate.trim() || purchaseItems.length === 0) {
      return false
    }
    return purchaseItems.every((item) => {
      if (!item.productId.trim()) return false
      const prod = products.find((p) => p.id === item.productId)
      if (prod?.category === 'Idols') {
        return item.pieceWeights.length > 0
      }
      const q = Number(item.quantity)
      return !isNaN(q) && q > 0
    })
  }, [purchaseLocationId, purchaseDate, purchaseItems, products])

  const isMovementFormValid = useMemo(() => {
    if (!movementProductId.trim() || !movementLocationId.trim() || !movementDate.trim()) {
      return false
    }
    const q = Number(movementQty)
    if (isNaN(q) || q <= 0) return false

    const prod = products.find((p) => p.id === movementProductId)
    if (prod?.category === 'Idols' && !movementPieceWeight) {
      return false
    }

    if (movementType === 'transfer') {
      if (!movementToLocationId.trim() || movementToLocationId === movementLocationId) return false
    } else if (movementType === 'repair') {
      const nw = Number(movementNewWeight)
      if (isNaN(nw) || nw <= 0) return false
    } else if (movementType === 'melt') {
      const rw = Number(movementRecoveredWeight)
      if (isNaN(rw) || rw <= 0) return false
    }
    return true
  }, [
    movementProductId,
    movementLocationId,
    movementDate,
    movementQty,
    movementType,
    movementToLocationId,
    movementNewWeight,
    movementRecoveredWeight,
    movementPieceWeight,
    products
  ])

  const isProductFormValid = useMemo(() => {
    if (!prodName.trim() || !prodSku.trim() || !prodPurity.trim()) return false
    const w = Number(prodWeight)
    if (isNaN(w) || w <= 0) return false
    return true
  }, [prodName, prodSku, prodPurity, prodWeight])

  const isEditPurchaseValid = useMemo(() => {
    if (!editPurchaseDate.trim() || !editPurchaseLocationId.trim()) return false
    const q = Number(editPurchaseQuantity)
    if (isNaN(q) || q <= 0) return false
    const p = Number(editPurchasePrice)
    if (isNaN(p) || p < 0) return false
    return true
  }, [editPurchaseDate, editPurchaseLocationId, editPurchaseQuantity, editPurchasePrice])

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

  const broadcastTxUpdate = () => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const bc = new BroadcastChannel('a96-tx-updates')
      bc.postMessage({ type: 'transaction-updated' })
      bc.close()
    }
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
      broadcastTxUpdate()
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
      broadcastTxUpdate()
    } catch (err: unknown) {
      console.error('Failed to reverse transaction', err)
      const msg = err instanceof Error ? err.message : 'Failed to reverse transaction'
      toast.error(msg)
    }
  }

  const handleOpenEditPurchase = (tx: Transaction) => {
    setEditingPurchase(tx)
    setEditPurchaseDate(tx.date || getTodayIST())
    setEditPurchaseLocationId(tx.locationId || '')
    setEditPurchaseQuantity(String(tx.quantity || 1))
    setEditPurchasePrice(tx.price !== undefined ? String(tx.price) : '')
    setEditPurchaseVendorName(tx.vendorName || '')
    setEditPurchaseNotes(tx.notes || '')
    setEditPurchaseError(null)
  }

  const handleSaveEditPurchase = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPurchase) return

    const qty = Number(editPurchaseQuantity)
    if (isNaN(qty) || qty < 1) {
      setEditPurchaseError('Quantity must be at least 1')
      return
    }

    const priceNum = Number(editPurchasePrice)
    if (isNaN(priceNum) || priceNum < 0) {
      setEditPurchaseError('Unit cost must be a valid non-negative number')
      return
    }

    setEditPurchaseSubmitting(true)
    setEditPurchaseError(null)

    try {
      const res = await updateTransaction(editingPurchase.id, {
        quantity: qty,
        price: priceNum,
        locationId: editPurchaseLocationId,
        locationName: locationMap.get(editPurchaseLocationId) || editingPurchase.locationName,
        date: editPurchaseDate,
        vendorName: editPurchaseVendorName,
        notes: editPurchaseNotes
      })

      const updated = res.transaction
      setTransactions((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)))

      const oldQty = Number(editingPurchase.quantity || 1)
      const oldLoc = editingPurchase.locationId
      const newLoc = editPurchaseLocationId
      const qtyDiff = qty - oldQty

      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== editingPurchase.productId) return p
          const locStock = { ...(p.stockByLocation || {}) }
          let totalStock = p.stock || 0
          if (oldLoc === newLoc) {
            locStock[oldLoc] = (locStock[oldLoc] || 0) + qtyDiff
            totalStock += qtyDiff
          } else {
            locStock[oldLoc] = Math.max(0, (locStock[oldLoc] || 0) - oldQty)
            locStock[newLoc] = (locStock[newLoc] || 0) + qty
            totalStock += qtyDiff
          }
          return {
            ...p,
            stock: Math.max(0, totalStock),
            stockByLocation: locStock
          }
        })
      )

      toast.success('Purchase entry updated successfully')
      setEditingPurchase(null)
      broadcastTxUpdate()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update purchase'
      setEditPurchaseError(msg)
      toast.error(msg)
    } finally {
      setEditPurchaseSubmitting(false)
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
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
                    title={archivedSession.verification.message}
                  >
                    <ShieldCheck size={12} className="shrink-0 text-emerald-700" />
                    Cryptographically Verified
                  </span>
                )}
                {archivedSession.verification.status === 'tampered' && (
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-50 text-red-800 border border-red-200 animate-pulse"
                    title={archivedSession.verification.message}
                  >
                    <AlertTriangle size={12} className="shrink-0 text-red-700" />
                    Tamper Warning: Altered Archive
                  </span>
                )}
                {archivedSession.verification.status === 'unverified' && (
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200"
                    title={archivedSession.verification.message}
                  >
                    <AlertCircle size={12} className="shrink-0 text-amber-700" />
                    Unverified Archive (Unsigned)
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
            className={`pb-3 px-3.5 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap ${activeTab === 'products'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
              }`}
          >
            <Package size={15} className="shrink-0" />
            <span>Products</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-medium ${
              activeTab === 'products' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'
            }`}>
              {products.length}
            </span>
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
            className={`pb-3 px-3.5 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap ${activeTab === 'purchases'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
              }`}
          >
            <ShoppingBag size={15} className="shrink-0" />
            <span>Purchases</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-medium ${
              activeTab === 'purchases' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'
            }`}>
              {displayTransactions.filter((t) => t.type === 'purchase').length}
            </span>
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
            className={`pb-3 px-3.5 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap ${activeTab === 'movements'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
              }`}
          >
            <Layers size={15} className="shrink-0" />
            <span>Movements</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-medium ${
              activeTab === 'movements' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'
            }`}>
              {filteredMovements.length}
            </span>
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
            className={`pb-3 px-3.5 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap ${activeTab === 'archived-audit'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
              }`}
          >
            <History size={15} className="shrink-0" />
            <span>Archived Audit Trail</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-medium ${
              activeTab === 'archived-audit' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'
            }`}>
              {archivedSession.auditLogs.length}
            </span>
          </button>
        )}
      </div>

      {/* Date Range Filter Bar for Purchases and Movements */}
      {(activeTab === 'purchases' || activeTab === 'movements') && (
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
                    setDateRangePreset(preset.id)
                    setPurchasesPage(1)
                    setMovementsPage(1)
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
                    setCustomStartDate(d)
                    setPurchasesPage(1)
                    setMovementsPage(1)
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
          <div className="flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl w-fit">
            <span className="text-xs font-medium text-gray-500 px-2 select-none">Movement</span>
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
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${isActive
                    ? 'bg-white text-black font-semibold shadow-xs'
                    : 'text-gray-600 hover:text-black'
                    }`}
                >
                  {labelMap[mType]}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Category Filter */}
            <div className="inline-flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl">
              <span className="text-xs font-medium text-gray-500 px-2 select-none">Category</span>
              <button
                onClick={() => setSelectedCategory('All')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${selectedCategory === 'All'
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
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${selectedCategory === cat
                    ? 'bg-white text-black font-semibold shadow-xs'
                    : 'text-gray-600 hover:text-black'
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Metal Filter (Gold / Silver) */}
            <div className="inline-flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl">
              <span className="text-xs font-medium text-gray-500 px-2 select-none">Metal</span>
              <button
                onClick={() => setSelectedMetal('All')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${selectedMetal === 'All'
                  ? 'bg-white text-black font-semibold shadow-xs'
                  : 'text-gray-600 hover:text-black'
                  }`}
              >
                All
              </button>
              {METALS.map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMetal(m)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${selectedMetal === m
                    ? 'bg-white text-black font-semibold shadow-xs'
                    : 'text-gray-600 hover:text-black'
                    }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Brand Filter */}
            <div className="inline-flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl">
              <span className="text-xs font-medium text-gray-500 px-2 select-none">Brand</span>
              <button
                onClick={() => setSelectedBrand('All')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${selectedBrand === 'All'
                  ? 'bg-white text-black font-semibold shadow-xs'
                  : 'text-gray-600 hover:text-black'
                  }`}
              >
                All
              </button>
              {BULLION_BRANDS.map((b) => (
                <button
                  key={b}
                  onClick={() => setSelectedBrand(b)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${selectedBrand === b
                    ? 'bg-white text-black font-semibold shadow-xs'
                    : 'text-gray-600 hover:text-black'
                    }`}
                >
                  {b}
                </button>
              ))}
            </div>

            {/* Product Status (Active / Archived) */}
            {activeTab === 'products' && (
              <div className="inline-flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl">
                <span className="text-xs font-medium text-gray-500 px-2 select-none">Status</span>
                {(['active', 'archived', 'all'] as const).map((st) => {
                  const labelMap = { active: 'Active', archived: 'Archived', all: 'All' }
                  const isActive = productStatusFilter === st
                  return (
                    <button
                      key={st}
                      onClick={() => setProductStatusFilter(st)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${isActive
                        ? 'bg-white text-black font-semibold shadow-xs'
                        : 'text-gray-600 hover:text-black'
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
              <span className="text-xs font-medium text-gray-500 select-none">Sort:</span>
              <div className="w-52">
                <CustomSelect
                  size="sm"
                  value={sortBy}
                  onValueChange={(val) => setSortBy(val as SortField)}
                  options={sortOptions}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Product Form Drawer/Card */}
      <ProductFormModal
        isOpen={isProductFormOpen}
        onClose={() => setIsProductFormOpen(false)}
        editingProductId={editingProductId}
        productFormError={productFormError}
        productFormSubmitting={productFormSubmitting}
        isProductFormValid={isProductFormValid}
        handleSaveProduct={handleSaveProduct}
        prodName={prodName}
        setProdName={setProdName}
        prodCategory={prodCategory}
        handleCategoryChange={handleCategoryChange}
        categoryOptions={categoryOptions}
        isProductCategoryMetalLocked={isProductCategoryMetalLocked}
        prodBrand={prodBrand}
        setProdBrand={setProdBrand}
        brandOptions={brandOptions}
        prodMetal={prodMetal}
        handleMetalChange={handleMetalChange}
        prodSku={prodSku}
        setProdSku={setProdSku}
        isIdolCategory={isIdolCategory}
        prodWeight={prodWeight}
        setProdWeight={setProdWeight}
        prodPurity={prodPurity}
        setProdPurity={setProdPurity}
        purityOptions={purityOptions}
        prodPieceWeights={prodPieceWeights}
        prodPieceInput={prodPieceInput}
        setProdPieceInput={setProdPieceInput}
        handleAddProdPieceWeight={handleAddProdPieceWeight}
        handleRemoveProdPieceWeight={handleRemoveProdPieceWeight}
        prodInitialStock={prodInitialStock}
        setProdInitialStock={setProdInitialStock}
        prodInitialLocationId={prodInitialLocationId}
        setProdInitialLocationId={setProdInitialLocationId}
        isLocationLocked={isLocationLocked}
        locationOptions={locationOptions}
        locationMap={locationMap}
        adminUser={adminUser}
        formatWeight={formatWeight}
      />

      {/* Record Purchase Modal / Card */}
      <RecordPurchaseModal
        isOpen={isPurchaseFormOpen}
        onClose={() => setIsPurchaseFormOpen(false)}
        onSubmit={handleSavePurchase}
        isLocationLocked={isLocationLocked}
        purchaseLocationId={purchaseLocationId}
        setPurchaseLocationId={setPurchaseLocationId}
        locationMap={locationMap}
        adminUser={adminUser}
        locationOptions={locationOptions}
        purchaseDate={purchaseDate}
        setPurchaseDate={setPurchaseDate}
        purchaseNotes={purchaseNotes}
        setPurchaseNotes={setPurchaseNotes}
        purchaseItems={purchaseItems}
        products={products}
        productOptions={productOptions}
        onAddPurchaseItem={handleAddPurchaseItem}
        onRemovePurchaseItem={handleRemovePurchaseItem}
        onUpdatePurchaseItem={handleUpdatePurchaseItem}
        onAddPieceWeight={handleAddPurchasePieceWeight}
        onRemovePieceWeight={handleRemovePurchasePieceWeight}
        purchaseTotals={purchaseTotals}
        submitting={purchaseSubmitting}
        isValid={isPurchaseFormValid}
        error={purchaseError}
      />

      {/* Record Stock Movement Drawer/Card */}
      <RecordMovementModal
        isOpen={isMovementFormOpen}
        onClose={() => setIsMovementFormOpen(false)}
        allowedMovementTypes={allowedMovementTypes}
        movementType={movementType}
        setMovementType={setMovementType}
        movementError={movementError}
        setMovementError={setMovementError}
        handleSaveMovement={handleSaveMovement}
        movementProductId={movementProductId}
        setMovementProductId={setMovementProductId}
        productOptions={productOptions}
        movementLocationId={movementLocationId}
        setMovementLocationId={setMovementLocationId}
        isLocationLocked={isLocationLocked}
        locationMap={locationMap}
        adminUser={adminUser}
        movementLocationOptions={movementLocationOptions}
        isMovementProductAnIdol={isMovementProductAnIdol}
        availableMovementPieces={availableMovementPieces}
        movementPieceWeight={movementPieceWeight}
        setMovementPieceWeight={setMovementPieceWeight}
        movementToLocationId={movementToLocationId}
        setMovementToLocationId={setMovementToLocationId}
        destinationLocationOptions={destinationLocationOptions}
        locationsLength={locations.length}
        movementQty={movementQty}
        setMovementQty={setMovementQty}
        currentSourceStock={currentSourceStock}
        currentDestStock={currentDestStock}
        movementAdjustmentMode={movementAdjustmentMode}
        setMovementAdjustmentMode={setMovementAdjustmentMode}
        selectedMovementProduct={selectedMovementProduct}
        movementNewWeight={movementNewWeight}
        setMovementNewWeight={setMovementNewWeight}
        movementRepairCharge={movementRepairCharge}
        setMovementRepairCharge={setMovementRepairCharge}
        movementRecoveredWeight={movementRecoveredWeight}
        setMovementRecoveredWeight={setMovementRecoveredWeight}
        movementDate={movementDate}
        setMovementDate={setMovementDate}
        movementNotes={movementNotes}
        setMovementNotes={setMovementNotes}
        movementSubmitting={movementSubmitting}
        isMovementFormValid={isMovementFormValid}
        formatWeight={formatWeight}
      />

      {/* Main Content Areas */}
      {loading ? (
        <SkeletonTable rows={8} columns={7} />
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
        <ProductsTable
          products={processedProducts}
          sortBy={sortBy}
          toggleSort={toggleSort}
          locationMap={locationMap}
          formatWeight={formatWeight}
          hasPermission={hasPermission}
          archivedSession={!!archivedSession}
          handleOpenAddProduct={handleOpenAddProduct}
          handleEditProduct={handleEditProduct}
          setDeleteProductTarget={setDeleteProductTarget}
          onSelectLocationId={(locId) => {
            const found = locations.find((l) => l.id === locId)
            if (found) setSelectedStockLocation(found)
          }}
        />
      ) : activeTab === 'purchases' && allowedTabs.includes('purchases') ? (
        <PurchasesTable
          filteredPurchases={filteredPurchases}
          paginatedPurchases={paginatedPurchases}
          purchasesPage={purchasesPage}
          totalPurchasesPages={totalPurchasesPages}
          pageSize={pageSize}
          setPurchasesPage={setPurchasesPage}
          formatWeight={formatWeight}
          archivedSession={!!archivedSession}
          isSuperAdmin={isSuperAdmin}
          hasPermission={hasPermission}
          handleOpenAddPurchase={handleOpenAddPurchase}
          handleOpenEditPurchase={handleOpenEditPurchase}
          setDeleteTxTarget={setDeleteTxTarget}
          canAddPurchase={!archivedSession && hasPermission('purchases', 'add')}
        />
      ) : activeTab === 'movements' && allowedTabs.includes('movements') ? (
        <MovementsTable
          filteredMovements={filteredMovements}
          paginatedMovements={paginatedMovements}
          movementsPage={movementsPage}
          totalMovementsPages={totalMovementsPages}
          pageSize={pageSize}
          setMovementsPage={setMovementsPage}
          movementTypeFilter={movementTypeFilter}
          allowedMovementTypes={allowedMovementTypes}
          handleOpenMovement={handleOpenMovement}
          canRecordMovement={!archivedSession && allowedMovementTypes.length > 0}
          formatWeight={formatWeight}
          archivedSession={!!archivedSession}
          hasPermission={hasPermission}
          setDeleteTxTarget={setDeleteTxTarget}
        />
      ) : activeTab === 'archived-audit' && !!archivedSession ? (
        <ArchivedAuditTab
          archivedAuditSearch={archivedAuditSearch}
          setArchivedAuditSearch={setArchivedAuditSearch}
          archivedAuditEntityFilter={archivedAuditEntityFilter}
          setArchivedAuditEntityFilter={setArchivedAuditEntityFilter}
          filteredArchivedAuditLogs={filteredArchivedAuditLogs}
          paginatedArchivedAuditLogs={paginatedArchivedAuditLogs}
          totalArchivedAuditPages={totalArchivedAuditPages}
          archivedAuditPage={archivedAuditPage}
          setArchivedAuditPage={setArchivedAuditPage}
          archivedAuditPageSize={archivedAuditPageSize}
        />
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

      {/* Single Master Zero Balance Modal */}
      <ZeroBalanceModal
        isOpen={isZeroBalanceModalOpen}
        onClose={() => {
          if (!zeroBalanceSubmitting) {
            setIsZeroBalanceModalOpen(false)
            setZeroBalanceConfirmText('')
            setZeroBalancePassword('')
          }
        }}
        zeroBalanceSubmitting={zeroBalanceSubmitting}
        zeroBalanceConfirmText={zeroBalanceConfirmText}
        setZeroBalanceConfirmText={setZeroBalanceConfirmText}
        zeroBalancePassword={zeroBalancePassword}
        setZeroBalancePassword={setZeroBalancePassword}
        zeroBalanceCutoffDate={zeroBalanceCutoffDate}
        setZeroBalanceCutoffDate={setZeroBalanceCutoffDate}
        zeroBalanceOpeningDate={zeroBalanceOpeningDate}
        handleZeroBalance={handleZeroBalance}
        getTodayIST={getTodayIST}
        formatDisplayDateIST={formatDisplayDateIST}
      />

      {/* Super Admin Edit Purchase Modal */}
      <EditPurchaseModal
        editingPurchase={editingPurchase}
        onClose={() => setEditingPurchase(null)}
        onSave={handleSaveEditPurchase}
        locationOptions={locations.map((l) => ({ value: l.id, label: l.name }))}
        date={editPurchaseDate}
        setDate={setEditPurchaseDate}
        locationId={editPurchaseLocationId}
        setLocationId={setEditPurchaseLocationId}
        quantity={editPurchaseQuantity}
        setQuantity={setEditPurchaseQuantity}
        price={editPurchasePrice}
        setPrice={setEditPurchasePrice}
        vendorName={editPurchaseVendorName}
        setVendorName={setEditPurchaseVendorName}
        notes={editPurchaseNotes}
        setNotes={setEditPurchaseNotes}
        submitting={editPurchaseSubmitting}
        isValid={isEditPurchaseValid}
        error={editPurchaseError}
      />

      {/* Location Stock Summary Modal */}
      <LocationStockModal
        isOpen={!!selectedStockLocation}
        onClose={() => setSelectedStockLocation(null)}
        location={selectedStockLocation}
        products={products}
      />
    </div>
  )
}