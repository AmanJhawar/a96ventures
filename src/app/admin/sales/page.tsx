"use client"

import { useState, useEffect, useMemo } from 'react'
import {
  ShoppingCart,
  Plus,
  Trash2,
  AlertCircle,
  X,
  Check,
  RotateCcw,
  IndianRupee,
  TrendingUp,
  PackageCheck
} from 'lucide-react'
import { Product, Location, Transaction, ProductCategory, MetalType } from '@/lib/types'
import {
  getProducts,
  getLocations,
  getTransactions,
  recordTransaction,
  deleteTransaction
} from '@/lib/services/inventory.service'
import { ConfirmModal } from '@/components/confirm-modal'
import { EmptyState } from '@/components/empty-state'
import CustomSelect, { SelectOption } from '@/components/custom-select'
import CustomDatePicker from '@/components/custom-date-picker'

const CATEGORIES: ProductCategory[] = ['MMTC PAMP', 'Idols', 'Bullions']
const METALS: MetalType[] = ['Gold', 'Silver']

type SalesTab = 'sales' | 'returns'

export default function AdminSales() {
  const [activeTab, setActiveTab] = useState<SalesTab>('sales')
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'All'>('All')
  const [selectedMetal, setSelectedMetal] = useState<MetalType | 'All'>('All')

  // Data state
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Sale form state
  const [isSaleFormOpen, setIsSaleFormOpen] = useState(false)
  const [saleProductId, setSaleProductId] = useState('')
  const [saleLocationId, setSaleLocationId] = useState('')
  const [saleQty, setSaleQty] = useState('1')
  const [salePrice, setSalePrice] = useState('')
  const [saleCustomerName, setSaleCustomerName] = useState('')
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().split('T')[0])
  const [saleNotes, setSaleNotes] = useState('')
  const [saleSubmitting, setSaleSubmitting] = useState(false)
  const [saleError, setSaleError] = useState<string | null>(null)

  // Return form state
  const [isReturnFormOpen, setIsReturnFormOpen] = useState(false)
  const [returnProductId, setReturnProductId] = useState('')
  const [returnLocationId, setReturnLocationId] = useState('')
  const [returnQty, setReturnQty] = useState('1')
  const [returnPrice, setReturnPrice] = useState('')
  const [returnCustomerName, setReturnCustomerName] = useState('')
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().split('T')[0])
  const [returnNotes, setReturnNotes] = useState('')
  const [returnSubmitting, setReturnSubmitting] = useState(false)
  const [returnError, setReturnError] = useState<string | null>(null)

  // Delete modal state
  const [deleteTxTarget, setDeleteTxTarget] = useState<Transaction | null>(null)

  const loadData = async () => {
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
      console.error('Failed to load sales data', err)
      setError('Unable to load sales data. Please check connection.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Helper map for locations
  const locationMap = useMemo(() => {
    const map = new Map<string, string>()
    locations.forEach((l) => map.set(l.id, l.name))
    return map
  }, [locations])

  // Filtered sales
  const salesList = useMemo(() => {
    return transactions.filter(
      (tx) =>
        tx.type === 'sale' &&
        (selectedCategory === 'All' || tx.category === selectedCategory) &&
        (selectedMetal === 'All' || tx.metal === selectedMetal)
    )
  }, [transactions, selectedCategory, selectedMetal])

  // Filtered returns
  const returnsList = useMemo(() => {
    return transactions.filter(
      (tx) =>
        tx.type === 'return' &&
        (selectedCategory === 'All' || tx.category === selectedCategory) &&
        (selectedMetal === 'All' || tx.metal === selectedMetal)
    )
  }, [transactions, selectedCategory, selectedMetal])

  // KPI Metrics
  const metrics = useMemo(() => {
    let totalSalesRevenue = 0
    let totalUnitsSold = 0
    let totalReturnsAmount = 0

    salesList.forEach((s) => {
      totalUnitsSold += Number(s.quantity || 0)
      if (s.price) {
        totalSalesRevenue += Number(s.price) * Number(s.quantity || 0)
      }
    })

    returnsList.forEach((r) => {
      if (r.price) {
        totalReturnsAmount += Number(r.price) * Number(r.quantity || 0)
      }
    })

    return {
      revenue: totalSalesRevenue,
      unitsSold: totalUnitsSold,
      returnsAmount: totalReturnsAmount,
      netRevenue: totalSalesRevenue - totalReturnsAmount
    }
  }, [salesList, returnsList])

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
    return products.map((p) => ({
      value: p.id,
      label: p.name,
      sublabel: `${p.category} · ${p.weight}g · ${p.sku}`,
      badge: `${p.stock} in stock`
    }))
  }, [products])

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
    // Default to a location with stock if possible
    let defaultLoc = locations[0]?.id || ''
    if (firstP?.stockByLocation) {
      const locWithStock = Object.keys(firstP.stockByLocation).find((id) => (firstP.stockByLocation[id] || 0) > 0)
      if (locWithStock) defaultLoc = locWithStock
    }
    setSaleLocationId(defaultLoc)
    setSaleQty('1')
    setSalePrice('')
    setSaleCustomerName('')
    setSaleDate(new Date().toISOString().split('T')[0])
    setSaleNotes('')
    setSaleError(null)
    setIsSaleFormOpen(true)
  }

  // Open Return modal
  const handleOpenReturnForm = () => {
    setReturnProductId(products[0]?.id || '')
    setReturnLocationId(locations[0]?.id || '')
    setReturnQty('1')
    setReturnPrice('')
    setReturnCustomerName('')
    setReturnDate(new Date().toISOString().split('T')[0])
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
    if (!saleLocationId) {
      setSaleError('Please select a selling location')
      return
    }
    const qty = Number(saleQty)
    if (isNaN(qty) || qty <= 0) {
      setSaleError('Quantity must be at least 1')
      return
    }
    if (qty > availableStockAtSaleLocation) {
      setSaleError(`Insufficient stock at this location. Available: ${availableStockAtSaleLocation}, Requested: ${qty}`)
      return
    }

    setSaleSubmitting(true)
    setSaleError(null)

    try {
      const locName = locationMap.get(saleLocationId) || ''
      await recordTransaction({
        type: 'sale',
        productId: prod.id,
        productName: prod.name,
        category: prod.category,
        metal: prod.metal,
        quantity: qty,
        price: salePrice ? Number(salePrice) : undefined,
        locationId: saleLocationId,
        locationName: locName,
        customerName: saleCustomerName,
        date: saleDate,
        notes: saleNotes
      })
      setIsSaleFormOpen(false)
      await loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record sale'
      setSaleError(msg)
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
    if (!returnLocationId) {
      setReturnError('Please select a location to receive the return')
      return
    }
    const qty = Number(returnQty)
    if (isNaN(qty) || qty <= 0) {
      setReturnError('Quantity must be at least 1')
      return
    }

    setReturnSubmitting(true)
    setReturnError(null)

    try {
      const locName = locationMap.get(returnLocationId) || ''
      await recordTransaction({
        type: 'return',
        productId: prod.id,
        productName: prod.name,
        category: prod.category,
        metal: prod.metal,
        quantity: qty,
        price: returnPrice ? Number(returnPrice) : undefined,
        locationId: returnLocationId,
        locationName: locName,
        customerName: returnCustomerName,
        date: returnDate,
        notes: returnNotes
      })
      setIsReturnFormOpen(false)
      await loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record return'
      setReturnError(msg)
    } finally {
      setReturnSubmitting(false)
    }
  }

  // Delete transaction with automatic stock reversal
  const executeDeleteTransaction = async () => {
    if (!deleteTxTarget) return
    try {
      await deleteTransaction(deleteTxTarget)
      setDeleteTxTarget(null)
      await loadData()
    } catch (err: unknown) {
      console.error('Failed to delete transaction', err)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-black mb-1">Sales & Orders</h1>
          <p className="text-gray-500 text-sm">
            Record customer sales (which deduct inventory) and customer returns (which restock items).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenReturnForm}
            disabled={products.length === 0 || locations.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-gray-200 text-black rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-40 transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]"
          >
            <RotateCcw size={16} />
            Record Return
          </button>
          <button
            onClick={handleOpenSaleForm}
            disabled={products.length === 0 || locations.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-[background-color,transform] duration-150 active:scale-[0.97]"
          >
            <Plus size={16} />
            Record Sale
          </button>
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
            ₹{metrics.revenue.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-gray-400 mt-1">{salesList.length} sales recorded</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs uppercase font-semibold tracking-wider">Units Sold</span>
            <PackageCheck size={16} className="text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-black tabular-nums">
            {metrics.unitsSold.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-gray-400 mt-1">across all locations</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs uppercase font-semibold tracking-wider">Returns / Refunds</span>
            <RotateCcw size={16} className="text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-black tabular-nums">
            ₹{metrics.returnsAmount.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-gray-400 mt-1">{returnsList.length} returns restocked</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs uppercase font-semibold tracking-wider">Net Sales</span>
            <TrendingUp size={16} className="text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-black tabular-nums">
            ₹{metrics.netRevenue.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-gray-400 mt-1">Gross sales minus returns</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('sales')}
          className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'sales'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
        >
          <ShoppingCart size={16} />
          Sales ({salesList.length})
        </button>
        <button
          onClick={() => setActiveTab('returns')}
          className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'returns'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
        >
          <RotateCcw size={16} />
          Returns & Restock ({returnsList.length})
        </button>
      </div>

      {/* Category & Metal Filter Pills */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
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

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Metal:</span>
          {(['All', 'Gold', 'Silver'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMetal(m)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${
                selectedMetal === m
                  ? 'bg-black text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-black'
              }`}
            >
              {m === 'All' ? 'All Metals' : m}
            </button>
          ))}
        </div>
      </div>

      {/* Record Sale Modal / Card */}
      {isSaleFormOpen && (
        <div className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
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
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle size={14} />
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
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Fulfill from Location <span className="text-red-500">*</span>
                </label>
                <CustomSelect
                  value={saleLocationId}
                  onValueChange={setSaleLocationId}
                  options={saleLocationOptions}
                  placeholder="Select selling location..."
                />
                <div className="text-xs text-gray-500 mt-1">
                  Available at selected location:{' '}
                  <strong className={availableStockAtSaleLocation > 0 ? 'text-black' : 'text-red-600'}>
                    {availableStockAtSaleLocation} units
                  </strong>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Quantity Sold <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max={availableStockAtSaleLocation}
                  value={saleQty}
                  onChange={(e) => setSaleQty(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Selling Price per Unit (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 78500"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
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
        </div>
      )}

      {/* Record Return Modal / Card */}
      {isReturnFormOpen && (
        <div className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
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
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle size={14} />
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
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Restock into Location <span className="text-red-500">*</span>
                </label>
                <CustomSelect
                  value={returnLocationId}
                  onValueChange={setReturnLocationId}
                  options={returnLocationOptions}
                  placeholder="Select location to restock..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Quantity Returned <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={returnQty}
                  onChange={(e) => setReturnQty(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
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
        </div>
      )}

      {/* Main Tables */}
      {loading ? (
        <div className="flex justify-center items-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
        </div>
      ) : activeTab === 'sales' ? (
        salesList.length === 0 ? (
          <EmptyState
            title="No sales recorded"
            description="When you record a customer sale, stock is automatically decremented from the chosen physical location."
            action={
              <button
                onClick={handleOpenSaleForm}
                disabled={products.length === 0 || locations.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-[background-color,transform] duration-150 active:scale-[0.97]"
              >
                <Plus size={16} />
                Record First Sale
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
                  {salesList.map((tx) => {
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
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums text-gray-600">
                          {tx.price ? `₹${tx.price.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums font-bold text-black">
                          {totalVal > 0 ? `₹${totalVal.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500 max-w-xs truncate">
                          {tx.notes || '—'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => setDeleteTxTarget(tx)}
                            title="Delete sale (restores stock)"
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
        /* Returns Tab */
        returnsList.length === 0 ? (
          <EmptyState
            title="No returns recorded"
            description="Returns restore items back into stock at your chosen location and track customer refund amounts."
            action={
              <button
                onClick={handleOpenReturnForm}
                disabled={products.length === 0 || locations.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-[background-color,transform] duration-150 active:scale-[0.97]"
              >
                <RotateCcw size={16} />
                Record First Return
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
                  {returnsList.map((tx) => {
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
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums text-gray-600">
                          {tx.price ? `₹${tx.price.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums font-bold text-black">
                          {totalVal > 0 ? `₹${totalVal.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500 max-w-xs truncate">
                          {tx.notes || '—'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => setDeleteTxTarget(tx)}
                            title="Delete return (reverses restock)"
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

      {/* Delete / Reverse Modal */}
      <ConfirmModal
        isOpen={!!deleteTxTarget}
        title={`Delete & Reverse ${deleteTxTarget?.type === 'sale' ? 'Sale' : 'Return'}`}
        description={`Deleting this transaction will reverse its stock effect (${
          deleteTxTarget?.type === 'sale' ? 'restore sold stock back into location' : 'remove returned stock from location'
        }). Continue?`}
        confirmText="Reverse & Delete"
        onConfirm={executeDeleteTransaction}
        onClose={() => setDeleteTxTarget(null)}
      />
    </div>
  )
}
