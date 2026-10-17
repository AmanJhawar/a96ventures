"use client"

import { useState, useEffect, useMemo } from 'react'
import {
  Warehouse,
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
  ShoppingBag
} from 'lucide-react'
import { Product, Location, Transaction, ProductCategory, TransactionType } from '@/lib/types'
import {
  getProducts,
  getLocations,
  getTransactions,
  addProduct,
  updateProduct,
  deleteProduct,
  recordTransaction,
  deleteTransaction
} from '@/lib/services/inventory.service'
import { ConfirmModal } from '@/components/confirm-modal'
import { EmptyState } from '@/components/empty-state'

const CATEGORIES: ProductCategory[] = ['MMTC PAMP', 'Silver Idols', 'Bullions']

type InventoryTab = 'products' | 'purchases' | 'movements'
type MovementSubtype = 'transfer' | 'adjustment' | 'repair' | 'melt'

export default function AdminInventory() {
  const [activeTab, setActiveTab] = useState<InventoryTab>('products')
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'All'>('All')

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

  // Filtered products
  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'All') return products
    return products.filter((p) => p.category === selectedCategory)
  }, [products, selectedCategory])

  // Filtered purchases
  const filteredPurchases = useMemo(() => {
    return transactions.filter(
      (tx) => tx.type === 'purchase' && (selectedCategory === 'All' || tx.category === selectedCategory)
    )
  }, [transactions, selectedCategory])

  // Filtered movements (transfer, adjustment, repair, melt)
  const filteredMovements = useMemo(() => {
    const movementTypes: TransactionType[] = ['transfer', 'adjustment', 'repair', 'melt']
    return transactions.filter(
      (tx) => movementTypes.includes(tx.type) && (selectedCategory === 'All' || tx.category === selectedCategory)
    )
  }, [transactions, selectedCategory])

  // Helper map for locations
  const locationMap = useMemo(() => {
    const map = new Map<string, string>()
    locations.forEach((l) => map.set(l.id, l.name))
    return map
  }, [locations])

  // Selected product in movement modal
  const selectedMovementProduct = useMemo(() => {
    return products.find((p) => p.id === movementProductId)
  }, [products, movementProductId])

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
    setProductFormSubmitting(true)
    setProductFormError(null)

    try {
      if (editingProductId) {
        await updateProduct(editingProductId, {
          name: prodName,
          category: prodCategory,
          sku: prodSku,
          weight: Number(prodWeight) || 0,
          purity: prodPurity
        })
      } else {
        const initLocName = locationMap.get(prodInitialLocationId) || ''
        await addProduct({
          name: prodName,
          category: prodCategory,
          sku: prodSku,
          weight: Number(prodWeight) || 0,
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
    setPurchaseProductId(products[0]?.id || '')
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
    const qty = Number(purchaseQty)
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

  // Handlers for Movements (transfer, adjustment, repair, melt)
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

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-black mb-1">Inventory Management</h1>
          <p className="text-gray-500 text-sm">
            Track product catalog, purchase restocking, location transfers, idol repairs, and melts.
          </p>
        </div>

        {/* Action Buttons based on Active Tab */}
        <div className="flex items-center gap-2 flex-wrap">
          {activeTab === 'products' && (
            <button
              onClick={handleOpenAddProduct}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              <Plus size={16} />
              Add Product
            </button>
          )}

          {activeTab === 'purchases' && (
            <button
              onClick={handleOpenAddPurchase}
              disabled={products.length === 0 || locations.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              <Plus size={16} />
              Record Purchase
            </button>
          )}

          {activeTab === 'movements' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenMovement('transfer')}
                disabled={products.length === 0 || locations.length < 2}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 text-black rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-40 transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]"
              >
                <ArrowRightLeft size={14} />
                Transfer
              </button>
              <button
                onClick={() => handleOpenMovement('repair')}
                disabled={products.length === 0 || locations.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 text-black rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-40 transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]"
              >
                <Wrench size={14} />
                Repair (Weight)
              </button>
              <button
                onClick={() => handleOpenMovement('melt')}
                disabled={products.length === 0 || locations.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 text-black rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-40 transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]"
              >
                <Flame size={14} />
                Melt
              </button>
              <button
                onClick={() => handleOpenMovement('adjustment')}
                disabled={products.length === 0 || locations.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-black text-white rounded-lg text-xs font-semibold hover:bg-gray-800 disabled:opacity-40 transition-[background-color,transform] duration-150 active:scale-[0.97]"
              >
                <SlidersHorizontal size={14} />
                Adjust Stock
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('products')}
          className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 ${
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
          className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'purchases'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
        >
          <ShoppingBag size={16} />
          Purchases ({transactions.filter((t) => t.type === 'purchase').length})
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'movements'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
        >
          <Layers size={16} />
          Stock Movements ({filteredMovements.length})
        </button>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Category:</span>
        <button
          onClick={() => setSelectedCategory('All')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${
            selectedCategory === 'All'
              ? 'bg-black text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-black'
          }`}
        >
          All Categories
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

      {/* Product Form Modal / Card */}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
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
                <select
                  value={prodCategory}
                  onChange={(e) => setProdCategory(e.target.value as ProductCategory)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Weight (Grams)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 10.00"
                  value={prodWeight}
                  onChange={(e) => setProdWeight(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Purity
                </label>
                <input
                  type="text"
                  placeholder="e.g. 999.9, 999, 925"
                  value={prodPurity}
                  onChange={(e) => setProdPurity(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
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
                    <label className="block text-xs text-gray-500 mb-1">Initial Quantity</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={prodInitialStock}
                      onChange={(e) => setProdInitialStock(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Assign to Location</label>
                    <select
                      value={prodInitialLocationId}
                      onChange={(e) => setProdInitialLocationId(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                    >
                      <option value="">Select location...</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
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
                <select
                  value={purchaseProductId}
                  onChange={(e) => setPurchaseProductId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                  required
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} [{p.category}] — Current Total Stock: {p.stock}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Receiving Location <span className="text-red-500">*</span>
                </label>
                <select
                  value={purchaseLocationId}
                  onChange={(e) => setPurchaseLocationId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                  required
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Quantity <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={purchaseQty}
                  onChange={(e) => setPurchaseQty(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                  required
                />
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
                  Purchase Date
                </label>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                  required
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
                <select
                  value={movementProductId}
                  onChange={(e) => setMovementProductId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                  required
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.category}) — {p.weight}g
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  {movementType === 'transfer' ? 'Source Location *' : 'Location *'}
                </label>
                <select
                  value={movementLocationId}
                  onChange={(e) => setMovementLocationId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                  required
                >
                  {locations.map((l) => {
                    const available = selectedMovementProduct?.stockByLocation?.[l.id] || 0
                    return (
                      <option key={l.id} value={l.id}>
                        {l.name} (Stock: {available})
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>

            {/* Type-Specific Fields */}
            {movementType === 'transfer' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Destination Location <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={movementToLocationId}
                    onChange={(e) => setMovementToLocationId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                    required
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
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
                  Date
                </label>
                <input
                  type="date"
                  value={movementDate}
                  onChange={(e) => setMovementDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                  required
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
        filteredProducts.length === 0 ? (
          <EmptyState
            title="No products in this category"
            description="Add your first product (MMTC PAMP bar/coin, Silver Idol, or Bullion) to start tracking inventory."
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
                    <th className="px-6 py-3.5">Product</th>
                    <th className="px-6 py-3.5">Category</th>
                    <th className="px-6 py-3.5">SKU</th>
                    <th className="px-6 py-3.5">Weight / Purity</th>
                    <th className="px-6 py-3.5">Stock by Location</th>
                    <th className="px-6 py-3.5 text-right">Total Stock</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.map((p) => {
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
                        <td className="px-6 py-4 font-mono text-xs text-gray-600">
                          {p.sku}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {p.weight ? `${p.weight}g` : '—'} · {p.purity || '—'}
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
        /* Movements Tab */
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

      {/* Transaction Delete Modal (Reverses Stock) */}
      <ConfirmModal
        isOpen={!!deleteTxTarget}
        title="Delete & Reverse Movement"
        description={`Deleting this ${deleteTxTarget?.type} record will automatically reverse its stock/weight changes. Continue?`}
        confirmText="Reverse & Delete"
        onConfirm={executeDeleteTransaction}
        onClose={() => setDeleteTxTarget(null)}
      />
    </div>
  )
}
