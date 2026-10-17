"use client"

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Plus,
  Trash2,
  Edit2,
  AlertCircle,
  X,
  Check,
  ArrowRightLeft,
  Wrench,
  Flame,
  SlidersHorizontal,
  Package,
  Layers,
  ShoppingBag,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Upload,
  Archive,
  Download
} from 'lucide-react'
import { Product, Location, Transaction, ProductCategory, TransactionType, MetalType } from '@/lib/types'
import {
  getProducts,
  getLocations,
  getTransactions,
  addProduct,
  updateProduct,
  deleteProduct,
  recordTransaction,
  deleteTransaction,
  clearTransactionHistory
} from '@/lib/services/inventory.service'
import { ConfirmModal } from '@/components/confirm-modal'
import { EmptyState } from '@/components/empty-state'
import CustomSelect, { SelectOption } from '@/components/custom-select'
import CustomDatePicker from '@/components/custom-date-picker'

const CATEGORIES: ProductCategory[] = ['MMTC PAMP', 'Idols', 'Bullions']
const METALS: MetalType[] = ['Gold', 'Silver']

const PURITY_OPTIONS_BY_CATEGORY: Record<ProductCategory, string[]> = {
  'MMTC PAMP': ['999.9', '999', '916'],
  Idols: ['925'],
  Bullions: ['916', '995', '999', '999.9']
}

type InventoryTab = 'products' | 'purchases' | 'movements'
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
  const [activeTab, setActiveTab] = useState<InventoryTab>('products')
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'All'>('All')
  const [selectedMetal, setSelectedMetal] = useState<MetalType | 'All'>('All')
  const [sortBy, setSortBy] = useState<SortField>('last_modified')

  // Data state
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Product modal / form state
  const [isProductFormOpen, setIsProductFormOpen] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [prodName, setProdName] = useState('')
  const [prodCategory, setProdCategory] = useState<ProductCategory>('MMTC PAMP')
  const [prodMetal, setProdMetal] = useState<MetalType>('Gold')
  const [prodSku, setProdSku] = useState('')
  const [prodWeight, setProdWeight] = useState('')
  const [prodPurity, setProdPurity] = useState('999.9')
  const [prodInitialStock, setProdInitialStock] = useState('')
  const [prodInitialLocationId, setProdInitialLocationId] = useState('')
  const [productFormSubmitting, setProductFormSubmitting] = useState(false)
  const [productFormError, setProductFormError] = useState<string | null>(null)

  // Purchase modal / form state
  const [isPurchaseFormOpen, setIsPurchaseFormOpen] = useState(false)
  const [purchaseProductId, setPurchaseProductId] = useState('')
  const [purchaseLocationId, setPurchaseLocationId] = useState('')
  const [purchaseQty, setPurchaseQty] = useState('1')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0])
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)

  // Movement modal / form state
  const [isMovementFormOpen, setIsMovementFormOpen] = useState(false)
  const [movementType, setMovementType] = useState<MovementSubtype>('transfer')
  const [movementProductId, setMovementProductId] = useState('')
  const [movementLocationId, setMovementLocationId] = useState('')
  const [movementToLocationId, setMovementToLocationId] = useState('')
  const [movementQty, setMovementQty] = useState('1')
  const [movementDate, setMovementDate] = useState(() => new Date().toISOString().split('T')[0])
  const [movementNotes, setMovementNotes] = useState('')
  // Repair-specific fields
  const [movementNewWeight, setMovementNewWeight] = useState('')
  const [movementRepairCharge, setMovementRepairCharge] = useState('')
  // Melt-specific fields
  const [movementRecoveredWeight, setMovementRecoveredWeight] = useState('')
  const [movementSubmitting, setMovementSubmitting] = useState(false)
  const [movementError, setMovementError] = useState<string | null>(null)

  // Delete modal state
  const [deleteProductTarget, setDeleteProductTarget] = useState<Product | null>(null)
  const [deleteTxTarget, setDeleteTxTarget] = useState<Transaction | null>(null)

  // Zero Balance & Offline Archive Export/Upload
  const [isZeroBalanceModalOpen, setIsZeroBalanceModalOpen] = useState(false)
  const [zeroBalanceSubmitting, setZeroBalanceSubmitting] = useState(false)
  const [zeroBalanceSuccess, setZeroBalanceSuccess] = useState<string | null>(null)

  // Offline archive viewing state
  const [archivedSession, setArchivedSession] = useState<{
    filename: string
    exportedAt: string
    transactions: Transaction[]
  } | null>(null)
  const archiveInputRef = useRef<HTMLInputElement | null>(null)

  const handleArchiveFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string
        const parsed = JSON.parse(text)
        let loadedTxs: Transaction[] = []
        let exportDate = new Date().toISOString()

        if (Array.isArray(parsed)) {
          loadedTxs = parsed
        } else if (parsed && Array.isArray(parsed.transactions)) {
          loadedTxs = parsed.transactions
          if (parsed.exportedAt) exportDate = parsed.exportedAt
        } else {
          throw new Error('Unrecognized archive format. Expected an exported transaction archive.')
        }

        loadedTxs = loadedTxs.map((t) => ({
          ...t,
          category: ((t.category as string) === 'Silver Idols' ? 'Idols' : t.category) as ProductCategory
        }))

        setArchivedSession({
          filename: file.name,
          exportedAt: exportDate,
          transactions: loadedTxs
        })
        setActiveTab('movements')
        setZeroBalanceSuccess(
          `Loaded archive "${file.name}" with ${loadedTxs.length} historical transactions for offline inspection.`
        )
      } catch (err: unknown) {
        console.error('Failed to parse archive file', err)
        setError('Failed to read archive file. Please ensure it is a valid JSON export.')
      } finally {
        if (e.target) e.target.value = ''
      }
    }
    reader.readAsText(file)
  }

  const handleZeroBalance = async () => {
    try {
      setZeroBalanceSubmitting(true)

      // 1. Export archive JSON to user's computer before erasing from cloud
      if (transactions.length > 0) {
        const archivePayload = {
          system: 'A96 Ventures Inventory System',
          type: 'Transaction History Audit Archive',
          version: '1.0',
          exportedAt: new Date().toISOString(),
          totalTransactions: transactions.length,
          productsSnapshot: products.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            metal: p.metal,
            sku: p.sku,
            stock: p.stock,
            weight: p.weight,
            purity: p.purity,
            stockByLocation: p.stockByLocation || {}
          })),
          transactions: transactions
        }
        const blob = new Blob([JSON.stringify(archivePayload, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        a.download = `a96-audit-archive-${dateStr}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }

      // 2. Erase transaction documents from cloud database
      const count = await clearTransactionHistory()
      setIsZeroBalanceModalOpen(false)
      setZeroBalanceSuccess(
        `Transaction history successfully exported to JSON file and erased from cloud (${count} transactions cleared). All product stock and location balances remain untouched.`
      )
      setArchivedSession(null)
      await loadAll()
    } catch (err: unknown) {
      console.error('Failed to zero balance history', err)
      setError('Failed to clear transaction history. Please try again.')
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
        getTransactions()
      ])
      setProducts(prods)
      setLocations(locs)
      setTransactions(txs)
    } catch (err: unknown) {
      console.error('Failed to load inventory data', err)
      setError('Unable to load inventory data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

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

  const isIdolCategory = prodCategory === 'Idols'

  const purityOptions: SelectOption[] = useMemo(() => {
    const list = PURITY_OPTIONS_BY_CATEGORY[prodCategory] || ['999.9', '999', '916']
    return list.map((p) => ({ value: p, label: p }))
  }, [prodCategory])

  const handleCategoryChange = (newCat: ProductCategory) => {
    setProdCategory(newCat)
    const validPurities = PURITY_OPTIONS_BY_CATEGORY[newCat] || ['999.9']
    if (!validPurities.includes(prodPurity)) {
      setProdPurity(validPurities[0])
    }
    if (newCat === 'Idols') {
      setProdWeight('')
      setProdMetal('Silver')
    }
  }

  const locationOptions: SelectOption[] = useMemo(() => {
    return locations.map((l) => ({ value: l.id, label: l.name }))
  }, [locations])

  const productOptions: SelectOption[] = useMemo(() => {
    return products.map((p) => ({
      value: p.id,
      label: p.name,
      sublabel: `${p.metal} · ${p.category} · ${p.weight}g · ${p.sku}`,
      badge: `${p.stock} in stock`
    }))
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
    if (selectedCategory !== 'All') {
      list = list.filter((p) => p.category === selectedCategory)
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
  }, [products, selectedCategory, selectedMetal, sortBy])

  // Effective transactions (switches to offline archive when uploaded)
  const displayTransactions = archivedSession ? archivedSession.transactions : transactions

  // Filtered purchases
  const filteredPurchases = useMemo(() => {
    return displayTransactions.filter((tx) => {
      const catMatch = selectedCategory === 'All' || tx.category === selectedCategory
      const metalMatch = selectedMetal === 'All' || tx.metal === selectedMetal
      return tx.type === 'purchase' && catMatch && metalMatch
    })
  }, [displayTransactions, selectedCategory, selectedMetal])

  // Filtered movements
  const filteredMovements = useMemo(() => {
    const movementTypes: TransactionType[] = ['transfer', 'adjustment', 'repair', 'melt']
    return displayTransactions.filter((tx) => {
      const catMatch = selectedCategory === 'All' || tx.category === selectedCategory
      const metalMatch = selectedMetal === 'All' || tx.metal === selectedMetal
      return movementTypes.includes(tx.type) && catMatch && metalMatch
    })
  }, [displayTransactions, selectedCategory, selectedMetal])

  // Selected product in purchase modal
  const selectedPurchaseProduct = useMemo(() => {
    return products.find((p) => p.id === purchaseProductId)
  }, [products, purchaseProductId])

  // Check if purchase product is an Idol (locks purchase qty to 1)
  const isPurchaseProductAnIdol = useMemo(() => {
    if (!selectedPurchaseProduct) return false
    return selectedPurchaseProduct.category === 'Idols'
  }, [selectedPurchaseProduct])

  // Auto-lock purchase qty to 1 if product is an Idol
  useEffect(() => {
    if (isPurchaseProductAnIdol) {
      setPurchaseQty('1')
    }
  }, [isPurchaseProductAnIdol])

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
        badge: `${stock} units`
      }
    })
  }, [locations, selectedMovementProduct])

  // Auto-set current weight when selecting a product for repair
  useEffect(() => {
    if (movementType === 'repair' && selectedMovementProduct) {
      setMovementNewWeight(String(selectedMovementProduct.weight || ''))
    }
  }, [movementType, selectedMovementProduct])

  // Handlers for Products
  const handleOpenAddProduct = () => {
    setEditingProductId(null)
    setProdName('')
    setProdCategory('MMTC PAMP')
    setProdMetal('Gold')
    setProdSku('')
    setProdWeight('')
    setProdPurity('999.9')
    setProdInitialStock('')
    setProdInitialLocationId(locations[0]?.id || '')
    setProductFormError(null)
    setIsProductFormOpen(true)
  }

  const handleEditProduct = (p: Product) => {
    setEditingProductId(p.id)
    setProdName(p.name)
    setProdCategory(p.category)
    setProdMetal(p.metal || 'Gold')
    setProdSku(p.sku)
    setProdWeight(String(p.weight || ''))
    setProdPurity(p.purity || '999.9')
    setProdInitialStock('')
    setProdInitialLocationId('')
    setProductFormError(null)
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
    const isIdol = prodCategory === 'Idols'
    let weightNum = Number(prodWeight)
    if (!isIdol) {
      if (isNaN(weightNum) || weightNum <= 0) {
        setProductFormError('Product weight is mandatory and must be greater than 0 grams.')
        return
      }
    } else {
      if (isNaN(weightNum) || weightNum < 0) {
        weightNum = 0
      }
    }

    setProductFormSubmitting(true)
    setProductFormError(null)

    try {
      if (editingProductId) {
        await updateProduct(editingProductId, {
          name: prodName,
          category: prodCategory,
          metal: prodMetal,
          sku: prodSku,
          weight: weightNum,
          purity: prodPurity
        })
      } else {
        const initLocName = locationMap.get(prodInitialLocationId) || ''
        await addProduct({
          name: prodName,
          category: prodCategory,
          metal: prodMetal,
          sku: prodSku,
          weight: weightNum,
          purity: prodPurity,
          initialStock: Number(prodInitialStock) || 0,
          initialLocationId: prodInitialLocationId || undefined,
          initialLocationName: initLocName || undefined
        })
      }
      setIsProductFormOpen(false)
      await loadAll()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save product'
      setProductFormError(msg)
    } finally {
      setProductFormSubmitting(false)
    }
  }

  const executeDeleteProduct = async () => {
    if (!deleteProductTarget) return
    try {
      await deleteProduct(deleteProductTarget.id)
      setDeleteProductTarget(null)
      await loadAll()
    } catch (err: unknown) {
      console.error(err)
    }
  }

  // Handlers for Purchases
  const handleOpenAddPurchase = () => {
    const firstP = products[0]
    setPurchaseProductId(firstP?.id || '')
    setPurchaseLocationId(locations[0]?.id || '')
    setPurchaseQty('1')
    setPurchasePrice('')
    setPurchaseDate(new Date().toISOString().split('T')[0])
    setPurchaseNotes('')
    setPurchaseError(null)
    setIsPurchaseFormOpen(true)
  }

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault()
    const prod = products.find((p) => p.id === purchaseProductId)
    if (!prod) {
      setPurchaseError('Please select a valid product')
      return
    }
    if (!purchaseLocationId) {
      setPurchaseError('Please select a location')
      return
    }

    const isIdol = prod.category === 'Idols'
    const qty = isIdol ? 1 : Number(purchaseQty)

    if (isNaN(qty) || qty <= 0) {
      setPurchaseError('Quantity must be at least 1')
      return
    }

    setPurchaseSubmitting(true)
    setPurchaseError(null)
    try {
      const locName = locationMap.get(purchaseLocationId) || ''
      await recordTransaction({
        type: 'purchase',
        productId: prod.id,
        productName: prod.name,
        category: prod.category,
        metal: prod.metal,
        quantity: qty,
        price: purchasePrice ? Number(purchasePrice) : undefined,
        locationId: purchaseLocationId,
        locationName: locName,
        date: purchaseDate,
        notes: purchaseNotes
      })
      setIsPurchaseFormOpen(false)
      await loadAll()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record purchase'
      setPurchaseError(msg)
    } finally {
      setPurchaseSubmitting(false)
    }
  }

  // Handlers for Movements
  const handleOpenMovement = (type: MovementSubtype) => {
    setMovementType(type)
    setMovementProductId(products[0]?.id || '')
    setMovementLocationId(locations[0]?.id || '')
    setMovementToLocationId(locations[1]?.id || '')
    setMovementQty('1')
    setMovementDate(new Date().toISOString().split('T')[0])
    setMovementNotes('')
    setMovementRepairCharge('')
    setMovementRecoveredWeight('')
    const firstP = products[0]
    setMovementNewWeight(firstP ? String(firstP.weight || '') : '')
    setMovementError(null)
    setIsMovementFormOpen(true)
  }

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault()
    const prod = products.find((p) => p.id === movementProductId)
    if (!prod) {
      setMovementError('Please select a product')
      return
    }
    if (!movementLocationId) {
      setMovementError('Please select a location')
      return
    }

    setMovementSubmitting(true)
    setMovementError(null)

    try {
      const locName = locationMap.get(movementLocationId) || ''
      const toLocName = movementToLocationId ? locationMap.get(movementToLocationId) : undefined

      if (movementType === 'repair') {
        const oldW = Number(prod.weight || 0)
        const newW = Number(movementNewWeight)
        if (isNaN(newW) || newW <= 0) {
          throw new Error('Please enter a valid new weight in grams')
        }
        await recordTransaction({
          type: 'repair',
          productId: prod.id,
          productName: prod.name,
          category: prod.category,
          metal: prod.metal,
          locationId: movementLocationId,
          locationName: locName,
          previousWeight: oldW,
          newWeight: newW,
          price: movementRepairCharge ? Number(movementRepairCharge) : undefined,
          date: movementDate,
          notes: movementNotes
        })
      } else if (movementType === 'melt') {
        const qty = Number(movementQty)
        if (isNaN(qty) || qty <= 0) throw new Error('Quantity to melt must be > 0')
        await recordTransaction({
          type: 'melt',
          productId: prod.id,
          productName: prod.name,
          category: prod.category,
          metal: prod.metal,
          quantity: qty,
          locationId: movementLocationId,
          locationName: locName,
          recoveredWeight: movementRecoveredWeight ? Number(movementRecoveredWeight) : undefined,
          date: movementDate,
          notes: movementNotes
        })
      } else if (movementType === 'transfer') {
        const qty = Number(movementQty)
        if (isNaN(qty) || qty <= 0) throw new Error('Transfer quantity must be > 0')
        if (movementLocationId === movementToLocationId) {
          throw new Error('Source and destination locations cannot be identical')
        }
        await recordTransaction({
          type: 'transfer',
          productId: prod.id,
          productName: prod.name,
          category: prod.category,
          metal: prod.metal,
          quantity: qty,
          locationId: movementLocationId,
          locationName: locName,
          toLocationId: movementToLocationId,
          toLocationName: toLocName,
          date: movementDate,
          notes: movementNotes
        })
      } else if (movementType === 'adjustment') {
        const qty = Number(movementQty)
        if (isNaN(qty) || qty === 0) throw new Error('Adjustment quantity cannot be 0')
        await recordTransaction({
          type: 'adjustment',
          productId: prod.id,
          productName: prod.name,
          category: prod.category,
          metal: prod.metal,
          quantity: qty,
          locationId: movementLocationId,
          locationName: locName,
          date: movementDate,
          notes: movementNotes
        })
      }

      setIsMovementFormOpen(false)
      await loadAll()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record movement'
      setMovementError(msg)
    } finally {
      setMovementSubmitting(false)
    }
  }

  const executeDeleteTransaction = async () => {
    if (!deleteTxTarget) return
    try {
      await deleteTransaction(deleteTxTarget)
      setDeleteTxTarget(null)
      await loadAll()
    } catch (err: unknown) {
      console.error('Failed to delete transaction', err)
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
          <h1 className="text-3xl font-bold tracking-tight text-black mb-1">Inventory Management</h1>
          <p className="text-gray-500 text-sm">
            Track catalog items, Gold & Silver metals, purchases, transfers, idol repairs, melts, and complete stock reports.
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

          <button
            onClick={() => archiveInputRef.current?.click()}
            title="Upload an offline archive JSON file to inspect historical transactions"
            className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 hover:text-black hover:bg-gray-50 rounded-lg text-xs font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]"
          >
            <Upload size={14} />
            Upload Archive
          </button>

          <button
            onClick={() => setIsZeroBalanceModalOpen(true)}
            title="Export archive to JSON and erase online transactions while preserving stock"
            className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 hover:text-black hover:bg-gray-50 rounded-lg text-xs font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]"
          >
            <RotateCcw size={14} />
            Zero Balance
          </button>

          {activeTab === 'products' && (
            <button
              onClick={handleOpenAddProduct}
              className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-black text-white hover:bg-gray-800 rounded-lg text-xs font-semibold transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              <Plus size={14} />
              Add Product
            </button>
          )}

          {activeTab === 'purchases' && (
            <button
              onClick={handleOpenAddPurchase}
              disabled={products.length === 0 || locations.length === 0}
              className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-black text-white hover:bg-gray-800 disabled:opacity-40 rounded-lg text-xs font-semibold transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              <Plus size={14} />
              Record Purchase
            </button>
          )}

          {activeTab === 'movements' && (
            <>
              <div className="h-5 w-px bg-gray-200 hidden sm:block mx-1" />
              <button
                onClick={() => handleOpenMovement('transfer')}
                disabled={products.length === 0 || locations.length < 2}
                className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-white border border-gray-200 text-black hover:bg-gray-50 disabled:opacity-40 rounded-lg text-xs font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]"
              >
                <ArrowRightLeft size={14} />
                Transfer
              </button>
              <button
                onClick={() => handleOpenMovement('repair')}
                disabled={products.length === 0 || locations.length === 0}
                className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-white border border-gray-200 text-black hover:bg-gray-50 disabled:opacity-40 rounded-lg text-xs font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]"
              >
                <Wrench size={14} />
                Repair
              </button>
              <button
                onClick={() => handleOpenMovement('melt')}
                disabled={products.length === 0 || locations.length === 0}
                className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-white border border-gray-200 text-black hover:bg-gray-50 disabled:opacity-40 rounded-lg text-xs font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]"
              >
                <Flame size={14} />
                Melt
              </button>
              <button
                onClick={() => handleOpenMovement('adjustment')}
                disabled={products.length === 0 || locations.length === 0}
                className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-white border border-gray-200 text-black hover:bg-gray-50 disabled:opacity-40 rounded-lg text-xs font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]"
              >
                <SlidersHorizontal size={14} />
                Adjust Stock
              </button>
            </>
          )}
        </div>
      </div>

      {zeroBalanceSuccess && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl text-black text-sm flex items-center justify-between">
          <span>{zeroBalanceSuccess}</span>
          <button
            onClick={() => setZeroBalanceSuccess(null)}
            className="text-gray-400 hover:text-black transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Offline Archive Viewer Active Notification */}
      {archivedSession && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-300 rounded-xl flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-black text-white flex items-center justify-center shrink-0">
              <Archive size={16} />
            </div>
            <div>
              <div className="text-sm font-bold text-black flex items-center gap-2">
                Viewing Offline Archive: {archivedSession.filename}
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-black text-white">
                  Offline Mode
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {archivedSession.transactions.length} historical transactions from {new Date(archivedSession.exportedAt).toLocaleDateString()} · Loaded locally in browser memory (zero cloud sync)
              </div>
            </div>
          </div>
          <button
            onClick={() => setArchivedSession(null)}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:text-black hover:bg-gray-100 transition-[background-color,transform] active:scale-[0.97]"
          >
            <X size={13} />
            Exit Archive View
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center border-b border-gray-200 mb-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('products')}
          className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'products'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
        >
          <Package size={16} />
          Products Catalog ({products.length})
        </button>
        <button
          onClick={() => setActiveTab('purchases')}
          className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'purchases'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
        >
          <ShoppingBag size={16} />
          Purchases ({displayTransactions.filter((t) => t.type === 'purchase').length})
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'movements'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
        >
          <Layers size={16} />
          Stock Movements ({filteredMovements.length})
        </button>
      </div>

      {/* Dual Filter Pills (Category + Metal) & Sort Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Category Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Category:</span>
              <button
                onClick={() => setSelectedCategory('All')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${
                  selectedCategory === 'All'
                    ? 'bg-black text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-black'
                }`}
              >
                All
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${
                    selectedCategory === cat
                      ? 'bg-black text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-black'
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
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${
                  selectedMetal === 'All'
                    ? 'bg-black text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-black'
                }`}
              >
                All
              </button>
              {METALS.map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMetal(m)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${
                    selectedMetal === m
                      ? 'bg-black text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-black'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
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

      {/* Product Form Drawer/Card */}
      {isProductFormOpen && (
        <div className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
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
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle size={14} />
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
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Category <span className="text-red-500">*</span>
                </label>
                <CustomSelect
                  value={prodCategory}
                  onValueChange={(val) => handleCategoryChange(val as ProductCategory)}
                  options={categoryOptions}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Metal <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setProdMetal('Gold')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-[background-color,border-color,color] duration-150 flex items-center justify-center ${
                      prodMetal === 'Gold'
                        ? 'bg-black text-white shadow-sm'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Gold
                  </button>
                  <button
                    type="button"
                    onClick={() => setProdMetal('Silver')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-[background-color,border-color,color] duration-150 flex items-center justify-center ${
                      prodMetal === 'Silver'
                        ? 'bg-black text-white shadow-sm'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Silver
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Weight (Grams) {isIdolCategory ? <span className="text-gray-400 font-normal lowercase">(variable)</span> : <span className="text-red-500">*</span>}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder={isIdolCategory ? "Disabled for idols" : "e.g. 10.00 (mandatory)"}
                  value={isIdolCategory ? '' : prodWeight}
                  disabled={isIdolCategory}
                  onChange={(e) => setProdWeight(e.target.value)}
                  className={`w-full px-3.5 py-2.5 border rounded-lg text-sm transition-[border-color] duration-150 ${
                    isIdolCategory
                      ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-white border-gray-200 text-black placeholder-gray-400 focus:outline-none focus:border-black'
                  }`}
                  required={!isIdolCategory}
                />
                {isIdolCategory && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Disabled for idols as each piece has a unique weight.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Purity <span className="text-red-500">*</span>
                </label>
                <CustomSelect
                  value={prodPurity}
                  onValueChange={setProdPurity}
                  options={purityOptions}
                  placeholder="Select purity..."
                />
              </div>
            </div>

            {/* Opening stock (Only on creation) */}
            {!editingProductId && (
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-700 mb-2">
                  Initial Stock Setup (Optional)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Initial Quantity {prodCategory === 'Idols' && '(Max 1 for Idols)'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={prodCategory === 'Idols' ? 1 : undefined}
                      placeholder="0"
                      value={prodInitialStock}
                      onChange={(e) => setProdInitialStock(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Assign to Location</label>
                    <CustomSelect
                      value={prodInitialLocationId}
                      onValueChange={setProdInitialLocationId}
                      options={[{ value: '', label: 'Select location...' }, ...locationOptions]}
                    />
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
        </div>
      )}

      {/* Record Purchase Modal / Card */}
      {isPurchaseFormOpen && (
        <div className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-black">Record Purchase (Restock)</h2>
            <button
              onClick={() => setIsPurchaseFormOpen(false)}
              className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97]"
            >
              <X size={18} />
            </button>
          </div>

          {purchaseError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle size={14} />
              {purchaseError}
            </div>
          )}

          <form onSubmit={handleSavePurchase} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Product <span className="text-red-500">*</span>
                </label>
                <CustomSelect
                  value={purchaseProductId}
                  onValueChange={setPurchaseProductId}
                  options={productOptions}
                  placeholder="Select product to restock..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Receiving Location <span className="text-red-500">*</span>
                </label>
                <CustomSelect
                  value={purchaseLocationId}
                  onValueChange={setPurchaseLocationId}
                  options={locationOptions}
                  placeholder="Select receiving location..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Quantity <span className="text-red-500">*</span>
                  </label>
                  {isPurchaseProductAnIdol && (
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                      Idols locked to 1
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min="1"
                  max={isPurchaseProductAnIdol ? 1 : undefined}
                  disabled={isPurchaseProductAnIdol}
                  value={isPurchaseProductAnIdol ? '1' : purchaseQty}
                  onChange={(e) => setPurchaseQty(e.target.value)}
                  className={`w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150 ${
                    isPurchaseProductAnIdol ? 'bg-gray-100 cursor-not-allowed font-semibold' : ''
                  }`}
                  required
                />
                {isPurchaseProductAnIdol && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    Idols are unique pieces and purchased 1 unit at a time.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Unit Purchase Price (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 75000"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Purchase Date <span className="text-red-500">*</span>
                </label>
                <CustomDatePicker
                  value={purchaseDate}
                  onChange={setPurchaseDate}
                  placeholder="Select purchase date"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                Notes / Supplier Ref (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Supplier Invoice #9821, MMTC lot 44"
                value={purchaseNotes}
                onChange={(e) => setPurchaseNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsPurchaseFormOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={purchaseSubmitting}
                className="inline-flex items-center gap-2 px-5 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-[background-color,transform] duration-150 active:scale-[0.97]"
              >
                <Check size={16} />
                {purchaseSubmitting ? 'Recording...' : 'Add Stock'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Movement Modal / Card */}
      {isMovementFormOpen && (
        <div className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-black capitalize">Record {movementType}</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-gray-100 text-gray-700">
                {movementType}
              </span>
            </div>
            <button
              onClick={() => setIsMovementFormOpen(false)}
              className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97]"
            >
              <X size={18} />
            </button>
          </div>

          {movementError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle size={14} />
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
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  {movementType === 'transfer' ? 'Source Location *' : 'Location *'}
                </label>
                <CustomSelect
                  value={movementLocationId}
                  onValueChange={setMovementLocationId}
                  options={movementLocationOptions}
                  placeholder="Select location..."
                />
              </div>
            </div>

            {/* Type-Specific Fields */}
            {movementType === 'transfer' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Destination Location <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect
                    value={movementToLocationId}
                    onValueChange={setMovementToLocationId}
                    options={locationOptions}
                    placeholder="Select destination location..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Transfer Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={movementQty}
                    onChange={(e) => setMovementQty(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                    required
                  />
                </div>
              </div>
            )}

            {movementType === 'adjustment' && (
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
                    Enter positive number for surplus found, or negative for shortage/damaged items.
                  </p>
                </div>
              </div>
            )}

            {movementType === 'repair' && (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Current Weight: <strong>{selectedMovementProduct?.weight || 0} grams</strong></span>
                  {movementNewWeight && (
                    <span className="font-semibold text-black">
                      Difference:{' '}
                      {(Number(movementNewWeight) - (selectedMovementProduct?.weight || 0)).toFixed(2)}g
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
                      step="0.01"
                      min="0.01"
                      placeholder="e.g. 102.50"
                      value={movementNewWeight}
                      onChange={(e) => setMovementNewWeight(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                      required
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      This will update the idol product weight in the system.
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
              <div className="p-4 bg-red-50/50 border border-red-200/60 rounded-xl space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                      Quantity to Melt <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={movementQty}
                      onChange={(e) => setMovementQty(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Destructive: This will decrement inventory stock at {locationMap.get(movementLocationId) || 'selected location'}.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                      Recovered Raw Weight (Grams)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 98.40"
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
                  placeholder="e.g. Broken pedestal repaired, sent to refinery"
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
                {movementSubmitting ? 'Recording...' : `Confirm ${movementType}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Content Areas */}
      {loading ? (
        <div className="flex justify-center items-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
        </div>
      ) : activeTab === 'products' ? (
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
                          {p.name}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            {p.category}
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
                          {p.category === 'Idols' && (!p.weight || p.weight === 0) ? (
                            <span className="text-gray-400 italic">Variable</span>
                          ) : (
                            <strong>{p.weight}g</strong>
                          )}{' '}
                          · {p.purity || '—'}
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
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            p.stock > 0 ? 'bg-black text-white' : 'bg-red-50 text-red-700 border border-red-200'
                          }`}>
                            {p.stock} units
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleEditProduct(p)}
                              title="Edit"
                              className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={() => setDeleteProductTarget(p)}
                              title="Delete"
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                            >
                              <Trash2 size={15} />
                            </button>
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
      ) : activeTab === 'purchases' ? (
        filteredPurchases.length === 0 ? (
          <EmptyState
            title="No purchases recorded"
            description="Purchases record incoming stock inventory and automatically increase product counts at designated locations."
            action={
              <button
                onClick={handleOpenAddPurchase}
                disabled={products.length === 0 || locations.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-[background-color,transform] duration-150 active:scale-[0.97]"
              >
                <Plus size={16} />
                Record First Purchase
              </button>
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
                  {filteredPurchases.map((tx) => {
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
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums text-gray-600">
                          {tx.price ? `₹${tx.price.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums font-semibold text-black">
                          {totalVal > 0 ? `₹${totalVal.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500 max-w-xs truncate">
                          {tx.notes || '—'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => setDeleteTxTarget(tx)}
                            title="Delete and reverse stock"
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        filteredMovements.length === 0 ? (
          <EmptyState
            title="No stock movements recorded"
            description="Stock movements include location transfers, idol weight repairs, destructive melts, and manual stock audits."
            action={
              <button
                onClick={() => handleOpenMovement('transfer')}
                disabled={products.length === 0 || locations.length < 2}
                className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-[background-color,transform] duration-150 active:scale-[0.97]"
              >
                <ArrowRightLeft size={16} />
                Record Transfer
              </button>
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
                    <th className="px-6 py-3.5">Location / Flow</th>
                    <th className="px-6 py-3.5 text-right">Qty / Effect</th>
                    <th className="px-6 py-3.5">Details</th>
                    <th className="px-6 py-3.5">Notes</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMovements.map((tx) => {
                    let typeBadgeClass = 'bg-gray-100 text-gray-800'
                    if (tx.type === 'transfer') typeBadgeClass = 'bg-amber-50 text-amber-900 border border-amber-200'
                    if (tx.type === 'repair') typeBadgeClass = 'bg-blue-50 text-blue-900 border border-blue-200'
                    if (tx.type === 'melt') typeBadgeClass = 'bg-red-50 text-red-900 border border-red-200'
                    if (tx.type === 'adjustment') typeBadgeClass = 'bg-purple-50 text-purple-900 border border-purple-200'

                    return (
                      <tr key={tx.id} className="hover:bg-gray-50/70 transition-[background-color] duration-100">
                        <td className="px-6 py-4 text-xs font-mono text-gray-500">
                          {tx.date}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2.5 py-0.5 rounded text-xs font-semibold capitalize ${typeBadgeClass}`}>
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
                            <span className="flex items-center gap-1.5">
                              <span>{tx.locationName}</span>
                              <span className="text-gray-400">→</span>
                              <strong className="text-black">{tx.toLocationName}</strong>
                            </span>
                          ) : (
                            tx.locationName
                          )}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums font-semibold">
                          {tx.type === 'transfer' && `±${tx.quantity}`}
                          {tx.type === 'adjustment' && (tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity)}
                          {tx.type === 'melt' && `−${tx.quantity}`}
                          {tx.type === 'repair' && (
                            <span className="text-xs font-normal text-gray-500">Weight updated</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-600">
                          {tx.type === 'repair' && (
                            <span>
                              {tx.previousWeight}g → <strong>{tx.newWeight}g</strong> ({tx.weightChange && tx.weightChange > 0 ? `+${tx.weightChange}` : tx.weightChange}g)
                              {tx.price ? ` · ₹${tx.price.toLocaleString('en-IN')}` : ''}
                            </span>
                          )}
                          {tx.type === 'melt' && tx.recoveredWeight && (
                            <span>Recovered: {tx.recoveredWeight}g pure metal</span>
                          )}
                          {tx.type !== 'repair' && tx.type !== 'melt' && '—'}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500 max-w-xs truncate">
                          {tx.notes || '—'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {!archivedSession && (
                            <button
                              onClick={() => setDeleteTxTarget(tx)}
                              title="Delete and reverse stock"
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Product Delete Modal */}
      <ConfirmModal
        isOpen={!!deleteProductTarget}
        title="Delete Product"
        description={`Are you sure you want to delete ${deleteProductTarget?.name}? This action cannot be undone.`}
        confirmText="Delete Product"
        onConfirm={executeDeleteProduct}
        onClose={() => setDeleteProductTarget(null)}
      />

      {/* Transaction Delete Modal */}
      <ConfirmModal
        isOpen={!!deleteTxTarget}
        title="Delete & Reverse Movement"
        description={`Deleting this ${deleteTxTarget?.type} record will automatically reverse its stock/weight changes. Continue?`}
        confirmText="Reverse & Delete"
        onConfirm={executeDeleteTransaction}
        onClose={() => setDeleteTxTarget(null)}
      />

      {/* Zero Balance Modal (Export Archive & Clear Cloud History) */}
      <ConfirmModal
        isOpen={isZeroBalanceModalOpen}
        title="Export Archive & Zero Balance History"
        description="Sensitive transaction history should not reside permanently online. This will automatically compile and download your entire transaction records into a secure offline JSON archive file on your computer, and then permanently delete them from the cloud database. Live product stock quantities and location balances will NOT change."
        confirmText={zeroBalanceSubmitting ? "Exporting & Erasing..." : "Download Archive & Zero Balance"}
        onConfirm={handleZeroBalance}
        onClose={() => setIsZeroBalanceModalOpen(false)}
      />
    </div>
  )
}
