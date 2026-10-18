"use client"

import { useState, useEffect, useMemo } from 'react'
import {
  TrendingUp,
  Warehouse,
  Download,
  Printer,
  Calendar,
  Layers,
  ShoppingBag,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react'
import { Product, Location, Transaction, ProductCategory, MetalType } from '@/lib/types'
import { getProducts, getLocations, getTransactions } from '@/lib/services/inventory.service'
import CustomSelect, { SelectOption } from '@/components/custom-select'
import { EmptyState } from '@/components/empty-state'
import { usePermissions } from '@/lib/context/PermissionsContext'

const CATEGORIES: ProductCategory[] = ['MMTC PAMP', 'Idols', 'Bullions']
const METALS: MetalType[] = ['Gold', 'Silver']

type ReportTab = 'top_selling' | 'stock_summary'
type DateRange = 'all' | 'month' | 'week' | 'today'
type TopSellingSort = 'volume_desc' | 'revenue_desc' | 'stock_desc'

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

interface ProductSalesStat {
  productId: string
  productName: string
  category: ProductCategory
  metal: MetalType
  weight: number
  purity: string
  unitsSold: number
  totalRevenue: number
  averagePrice: number
  currentStock: number
}

export default function AdminReportsPage() {
  const { hasPermission } = usePermissions()
  const [activeTab, setActiveTab] = useState<ReportTab>('top_selling')
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'All'>('All')
  const [selectedMetal, setSelectedMetal] = useState<MetalType | 'All'>('All')
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [topSort, setTopSort] = useState<TopSellingSort>('volume_desc')

  // Data
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
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
        console.error('Failed to load reports data', err)
        setError('Unable to load reports data. Please try again.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // -------------------------------------------------------------
  // TOP SELLING PRODUCTS COMPUTATION
  // -------------------------------------------------------------
  const salesTransactions = useMemo(() => {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    // 7 days ago
    const weekAgo = new Date(now)
    weekAgo.setDate(now.getDate() - 7)
    const weekAgoStr = weekAgo.toISOString().split('T')[0]

    // 30 days ago
    const monthAgo = new Date(now)
    monthAgo.setDate(now.getDate() - 30)
    const monthAgoStr = monthAgo.toISOString().split('T')[0]

    return transactions.filter((tx) => {
      if (tx.type !== 'sale') return false

      if (dateRange === 'today' && tx.date !== todayStr) return false
      if (dateRange === 'week' && tx.date < weekAgoStr) return false
      if (dateRange === 'month' && tx.date < monthAgoStr) return false

      if (selectedCategory !== 'All' && tx.category !== selectedCategory) return false
      if (selectedMetal !== 'All' && tx.metal !== selectedMetal) return false

      return true
    })
  }, [transactions, dateRange, selectedCategory, selectedMetal])

  const topSellingList = useMemo<ProductSalesStat[]>(() => {
    const map = new Map<string, { unitsSold: number; totalRevenue: number }>()

    salesTransactions.forEach((tx) => {
      const existing = map.get(tx.productId) || { unitsSold: 0, totalRevenue: 0 }
      const revenue = (tx.price || 0) * tx.quantity
      map.set(tx.productId, {
        unitsSold: existing.unitsSold + tx.quantity,
        totalRevenue: existing.totalRevenue + revenue
      })
    })

    // Map through products (or include products that have sales)
    const stats: ProductSalesStat[] = []
    const productLookup = new Map<string, Product>()
    products.forEach((p) => productLookup.set(p.id, p))

    map.forEach((value, prodId) => {
      const prod = productLookup.get(prodId)
      if (prod) {
        stats.push({
          productId: prod.id,
          productName: prod.name,
          category: prod.category,
          metal: prod.metal || 'Silver',
          weight: prod.weight || 0,
          purity: prod.purity || '—',
          unitsSold: value.unitsSold,
          totalRevenue: value.totalRevenue,
          averagePrice: value.unitsSold > 0 ? Math.round(value.totalRevenue / value.unitsSold) : 0,
          currentStock: prod.stock || 0
        })
      } else {
        // Fallback for archived / deleted products
        const sampleTx = salesTransactions.find((t) => t.productId === prodId)
        stats.push({
          productId: prodId,
          productName: sampleTx?.productName || 'Unknown Product',
          category: (sampleTx?.category || 'MMTC PAMP') as ProductCategory,
          metal: sampleTx?.metal || 'Silver',
          weight: 0,
          purity: '—',
          unitsSold: value.unitsSold,
          totalRevenue: value.totalRevenue,
          averagePrice: value.unitsSold > 0 ? Math.round(value.totalRevenue / value.unitsSold) : 0,
          currentStock: 0
        })
      }
    })

    return stats.sort((a, b) => {
      if (topSort === 'volume_desc') return b.unitsSold - a.unitsSold
      if (topSort === 'revenue_desc') return b.totalRevenue - a.totalRevenue
      if (topSort === 'stock_desc') return b.currentStock - a.currentStock
      return 0
    })
  }, [salesTransactions, products, topSort])

  const topSellingOverview = useMemo<{
    totalUnits: number
    totalRevenue: number
    topProductByVolume: ProductSalesStat | null
    topProductByRevenue: ProductSalesStat | null
  }>(() => {
    let totalUnits = 0
    let totalRevenue = 0
    let topProductByVolume: ProductSalesStat | null = null
    let topProductByRevenue: ProductSalesStat | null = null

    topSellingList.forEach((item) => {
      totalUnits += item.unitsSold
      totalRevenue += item.totalRevenue
      if (!topProductByVolume || item.unitsSold > topProductByVolume.unitsSold) {
        topProductByVolume = item
      }
      if (!topProductByRevenue || item.totalRevenue > topProductByRevenue.totalRevenue) {
        topProductByRevenue = item
      }
    })

    return {
      totalUnits,
      totalRevenue,
      topProductByVolume,
      topProductByRevenue
    }
  }, [topSellingList])

  const maxUnitsSold = useMemo(() => {
    if (topSellingList.length === 0) return 1
    return Math.max(...topSellingList.map((i) => i.unitsSold), 1)
  }, [topSellingList])

  // -------------------------------------------------------------
  // STOCK SUMMARY COMPUTATION
  // -------------------------------------------------------------
  const summaryReport = useMemo(() => {
    let totalStockUnits = 0
    let totalEstimatedWeightGrams = 0

    let totalGoldUnits = 0
    let totalGoldWeight = 0
    let totalSilverUnits = 0
    let totalSilverWeight = 0

    let lowStockCount = 0
    let outOfStockCount = 0

    const categoryStats: Record<
      ProductCategory,
      {
        units: number
        weight: number
        count: number
        goldUnits: number
        goldWeight: number
        silverUnits: number
        silverWeight: number
      }
    > = {
      'MMTC PAMP': { units: 0, weight: 0, count: 0, goldUnits: 0, goldWeight: 0, silverUnits: 0, silverWeight: 0 },
      Idols: { units: 0, weight: 0, count: 0, goldUnits: 0, goldWeight: 0, silverUnits: 0, silverWeight: 0 },
      Bullions: { units: 0, weight: 0, count: 0, goldUnits: 0, goldWeight: 0, silverUnits: 0, silverWeight: 0 }
    }

    const locationStockTotals: Record<string, number> = {}
    locations.forEach((l) => {
      locationStockTotals[l.id] = 0
    })

    products.forEach((p) => {
      const pStock = Number(p.stock || 0)
      const pWeight = Number(p.weight || 0)
      const isGold = p.metal === 'Gold'

      totalStockUnits += pStock
      totalEstimatedWeightGrams += pStock * pWeight

      if (isGold) {
        totalGoldUnits += pStock
        totalGoldWeight += pStock * pWeight
      } else {
        totalSilverUnits += pStock
        totalSilverWeight += pStock * pWeight
      }

      if (pStock === 0) outOfStockCount += 1
      else if (pStock <= 2) lowStockCount += 1

      if (categoryStats[p.category]) {
        categoryStats[p.category].units += pStock
        categoryStats[p.category].weight += pStock * pWeight
        categoryStats[p.category].count += 1
        if (isGold) {
          categoryStats[p.category].goldUnits += pStock
          categoryStats[p.category].goldWeight += pStock * pWeight
        } else {
          categoryStats[p.category].silverUnits += pStock
          categoryStats[p.category].silverWeight += pStock * pWeight
        }
      }

      if (p.stockByLocation) {
        Object.entries(p.stockByLocation).forEach(([locId, qty]) => {
          if (locationStockTotals[locId] !== undefined) {
            locationStockTotals[locId] += Number(qty) || 0
          }
        })
      }
    })

    return {
      totalStockUnits,
      totalEstimatedWeightGrams,
      totalGoldUnits,
      totalGoldWeight,
      totalSilverUnits,
      totalSilverWeight,
      lowStockCount,
      outOfStockCount,
      uniqueProducts: products.length,
      categoryStats,
      locationStockTotals
    }
  }, [products, locations])

  // -------------------------------------------------------------
  // EXPORT HANDLERS
  // -------------------------------------------------------------
  const handleExportTopSellingCSV = () => {
    if (topSellingList.length === 0) return

    const headers = [
      'Rank',
      'Product Name',
      'Category',
      'Metal',
      'Weight (g)',
      'Purity',
      'Units Sold',
      'Total Revenue (INR)',
      'Avg Price (INR)',
      'Current In Stock'
    ]

    const rows = topSellingList.map((item, idx) => [
      `#${idx + 1}`,
      `"${item.productName.replace(/"/g, '""')}"`,
      `"${item.category}"`,
      `"${item.metal}"`,
      item.weight > 0 ? item.weight : 'Variable',
      `"${item.purity}"`,
      item.unitsSold,
      item.totalRevenue,
      item.averagePrice,
      item.currentStock
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `a96-highest-selling-products-${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleExportStockSummaryCSV = () => {
    if (products.length === 0) return

    const headers = [
      'Product Name',
      'Category',
      'Metal',
      'SKU',
      'Weight (g)',
      'Purity',
      'Total Stock',
      ...locations.map((l) => `"${l.name.replace(/"/g, '""')}"`)
    ]

    const rows = products.map((p) => {
      const locCells = locations.map((l) => p.stockByLocation?.[l.id] || 0)
      return [
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.category}"`,
        `"${p.metal || 'Silver'}"`,
        `"${p.sku}"`,
        p.weight > 0 ? p.weight : 'Variable',
        `"${p.purity || ''}"`,
        p.stock,
        ...locCells
      ]
    })

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `a96-stock-summary-${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-black mb-1">Reports & Analytics</h1>
          <p className="text-gray-500 text-sm">
            Highest-selling products, sales leaderboards, and physical stock valuation.
          </p>
        </div>

        {hasPermission('reports', 'export') && (
          <div className="flex items-center gap-2">
            {activeTab === 'top_selling' ? (
              <button
                onClick={handleExportTopSellingCSV}
                disabled={topSellingList.length === 0}
                className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 hover:text-black hover:bg-gray-50 disabled:opacity-40 rounded-lg text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97]"
              >
                <Download size={14} />
                Export Sales CSV
              </button>
            ) : (
              <>
                <button
                  onClick={handleExportStockSummaryCSV}
                  disabled={products.length === 0}
                  className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 hover:text-black hover:bg-gray-50 disabled:opacity-40 rounded-lg text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97]"
                >
                  <Download size={14} />
                  Export Stock CSV
                </button>
                <button
                  onClick={() => window.print()}
                  className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 hover:text-black hover:bg-gray-50 rounded-lg text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97]"
                >
                  <Printer size={14} />
                  Print Summary
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 text-sm">
          {error}
        </div>
      )}

      {/* Primary Section Tabs */}
      <div className="flex items-center border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('top_selling')}
          className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'top_selling'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
        >
          <TrendingUp size={16} />
          Highest Selling Products
        </button>
        <button
          onClick={() => setActiveTab('stock_summary')}
          className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'stock_summary'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
        >
          <Warehouse size={16} />
          Stock Summary Report
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
        </div>
      ) : activeTab === 'top_selling' ? (
        /* ============================================================ */
        /* TAB 1: HIGHEST SELLING PRODUCTS                             */
        /* ============================================================ */
        <div className="space-y-6">
          {/* Executive Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <span className="text-xs uppercase font-semibold tracking-wider text-gray-400 block mb-1">
                Total Units Sold
              </span>
              <div className="text-2xl font-bold text-black tabular-nums">
                {topSellingOverview.totalUnits.toLocaleString('en-IN')}
              </div>
              <span className="text-xs text-gray-500 mt-1 block">
                Across {salesTransactions.length} recorded sales
              </span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <span className="text-xs uppercase font-semibold tracking-wider text-gray-400 block mb-1">
                Total Sales Revenue
              </span>
              <div className="text-2xl font-bold text-black tabular-nums">
                ₹{topSellingOverview.totalRevenue.toLocaleString('en-IN')}
              </div>
              <span className="text-xs text-gray-500 mt-1 block">
                Gross realized customer sales
              </span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <span className="text-xs uppercase font-semibold tracking-wider text-gray-400 block mb-1">
                #1 by Volume
              </span>
              <div className="text-lg font-bold text-black truncate">
                {topSellingOverview.topProductByVolume ? (
                  topSellingOverview.topProductByVolume.productName
                ) : (
                  <span className="text-gray-300 italic">No sales yet</span>
                )}
              </div>
              <span className="text-xs text-gray-500 mt-1 block">
                {topSellingOverview.topProductByVolume
                  ? `${topSellingOverview.topProductByVolume.unitsSold} units sold`
                  : '—'}
              </span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <span className="text-xs uppercase font-semibold tracking-wider text-gray-400 block mb-1">
                #1 by Revenue
              </span>
              <div className="text-lg font-bold text-black truncate">
                {topSellingOverview.topProductByRevenue ? (
                  topSellingOverview.topProductByRevenue.productName
                ) : (
                  <span className="text-gray-300 italic">No sales yet</span>
                )}
              </div>
              <span className="text-xs text-gray-500 mt-1 block">
                {topSellingOverview.topProductByRevenue
                  ? `₹${topSellingOverview.topProductByRevenue.totalRevenue.toLocaleString('en-IN')}`
                  : '—'}
              </span>
            </div>
          </div>

          {/* Filters Bar: Time Range, Category, Metal, Sort */}
          <div className="bg-white p-4 border border-gray-200 rounded-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Time Range Squircles */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Period:</span>
                {[
                  { id: 'all', label: 'All Time' },
                  { id: 'month', label: 'Last 30 Days' },
                  { id: 'week', label: 'Last 7 Days' },
                  { id: 'today', label: 'Today' }
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setDateRange(t.id as DateRange)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${
                      dateRange === t.id
                        ? 'bg-black text-white border border-black shadow-xs'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Category Squircles */}
              <div className="flex items-center gap-1.5 border-l border-gray-200 pl-4 overflow-x-auto">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Category:</span>
                <button
                  onClick={() => setSelectedCategory('All')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${
                    selectedCategory === 'All'
                      ? 'bg-black text-white border border-black shadow-xs'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                  }`}
                >
                  All
                </button>
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setSelectedCategory(c)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${
                      selectedCategory === c
                        ? 'bg-black text-white border border-black shadow-xs'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              {/* Metal Squircles */}
              <div className="flex items-center gap-1.5 border-l border-gray-200 pl-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Metal:</span>
                <button
                  onClick={() => setSelectedMetal('All')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${
                    selectedMetal === 'All'
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
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${
                      selectedMetal === m
                        ? 'bg-black text-white border border-black shadow-xs'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort Toggle */}
            <div className="flex items-center gap-1.5 border-l border-gray-200 pl-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Rank By:</span>
              <button
                onClick={() => setTopSort('volume_desc')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${
                  topSort === 'volume_desc'
                    ? 'bg-black text-white border border-black shadow-xs'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                }`}
              >
                Volume (Units)
              </button>
              <button
                onClick={() => setTopSort('revenue_desc')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${
                  topSort === 'revenue_desc'
                    ? 'bg-black text-white border border-black shadow-xs'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                }`}
              >
                Revenue (₹)
              </button>
            </div>
          </div>

          {/* Leaderboard Table */}
          {topSellingList.length === 0 ? (
            <EmptyState
              title="No sales found for the selected period"
              description="Adjust the time filter or record customer sales in the Sales section to populate the sales leaderboard."
            />
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-black tracking-tight">Sales Leaderboard</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Ranked products based on total sales volume and revenue generation.
                  </p>
                </div>
                <span className="text-xs text-gray-400 font-mono">
                  {topSellingList.length} top performing items
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase font-semibold text-gray-500 tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5 w-16 text-center">Rank</th>
                      <th className="px-6 py-3.5">Product</th>
                      <th className="px-6 py-3.5">Category</th>
                      <th className="px-6 py-3.5">Metal</th>
                      <th className="px-6 py-3.5">Weight / Purity</th>
                      <th className="px-6 py-3.5 text-right">Units Sold</th>
                      <th className="px-6 py-3.5 w-44">Sales Share</th>
                      <th className="px-6 py-3.5 text-right">Total Revenue (₹)</th>
                      <th className="px-6 py-3.5 text-right">Avg Unit Price</th>
                      <th className="px-6 py-3.5 text-right">Remaining Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {topSellingList.map((item, idx) => {
                      const sharePercent = Math.min(100, Math.round((item.unitsSold / maxUnitsSold) * 100))
                      return (
                        <tr key={item.productId} className="hover:bg-gray-50/70 transition-[background-color] duration-100">
                          <td className="px-6 py-4 text-center">
                            <span
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                idx === 0
                                  ? 'bg-black text-white'
                                  : idx === 1
                                  ? 'bg-gray-200 text-black'
                                  : idx === 2
                                  ? 'bg-gray-100 text-gray-700'
                                  : 'text-gray-400'
                              }`}
                            >
                              {idx + 1}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-semibold text-black">
                            {item.productName}
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-600">
                            {item.category}
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium border border-gray-200 text-gray-700 bg-gray-50">
                              {item.metal}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-600">
                            {item.weight > 0 ? `${item.weight}g` : <span className="text-gray-400 italic">Variable</span>}
                            {item.purity && item.purity !== '—' ? ` · ${item.purity}` : ''}
                          </td>
                          <td className="px-6 py-4 text-right tabular-nums font-bold text-black text-base">
                            {item.unitsSold}
                          </td>
                          <td className="px-6 py-4">
                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-black h-2 rounded-full origin-left transition-transform duration-300 ease-[var(--ease-out)] w-full"
                                style={{ transform: `scaleX(${sharePercent / 100})` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-400 mt-1 block">
                              {sharePercent}% of top item
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right tabular-nums font-bold text-black">
                            ₹{item.totalRevenue.toLocaleString('en-IN')}
                          </td>
                          <td className="px-6 py-4 text-right tabular-nums text-gray-600">
                            ₹{item.averagePrice.toLocaleString('en-IN')}
                          </td>
                          <td className="px-6 py-4 text-right tabular-nums">
                            <span
                              className={`font-semibold ${
                                item.currentStock === 0
                                  ? 'text-gray-400'
                                  : 'text-black'
                              }`}
                            >
                              {item.currentStock} in stock
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ============================================================ */
        /* TAB 2: STOCK SUMMARY REPORT                                 */
        /* ============================================================ */
        <div className="space-y-6">
          {/* Executive Metrics Cards: Segregated by Gold and Silver */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <span className="text-xs uppercase font-semibold tracking-wider text-gray-400 block mb-1">
                Total Gold Inventory
              </span>
              <div className="text-2xl font-bold text-black tabular-nums">
                {summaryReport.totalGoldWeight >= 1000
                  ? `${(summaryReport.totalGoldWeight / 1000).toFixed(2)} kg`
                  : `${summaryReport.totalGoldWeight.toFixed(1)} g`}
              </div>
              <span className="text-xs text-gray-500 mt-1 block">
                {summaryReport.totalGoldUnits} units in stock
              </span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <span className="text-xs uppercase font-semibold tracking-wider text-gray-400 block mb-1">
                Total Silver Inventory
              </span>
              <div className="text-2xl font-bold text-black tabular-nums">
                {summaryReport.totalSilverWeight >= 1000
                  ? `${(summaryReport.totalSilverWeight / 1000).toFixed(2)} kg`
                  : `${summaryReport.totalSilverWeight.toFixed(1)} g`}
              </div>
              <span className="text-xs text-gray-500 mt-1 block">
                {summaryReport.totalSilverUnits} units in stock
              </span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <span className="text-xs uppercase font-semibold tracking-wider text-gray-400 block mb-1">
                Total Products & Storage
              </span>
              <div className="text-2xl font-bold text-black tabular-nums">
                {summaryReport.uniqueProducts} Products
              </div>
              <span className="text-xs text-gray-500 mt-1 block">
                Across {locations.length} locations
              </span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <span className="text-xs uppercase font-semibold tracking-wider text-gray-400 block mb-1">
                Stock Attention
              </span>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold tabular-nums text-black">
                  {summaryReport.outOfStockCount} <span className="text-xs font-normal text-gray-500">Out</span>
                </span>
                <span className="text-gray-300">/</span>
                <span className={`text-2xl font-bold tabular-nums ${summaryReport.lowStockCount > 0 ? 'text-gray-900' : 'text-black'}`}>
                  {summaryReport.lowStockCount} <span className="text-xs font-normal text-gray-500">Low (≤2)</span>
                </span>
              </div>
              <span className="text-xs text-gray-500 mt-1 block">Requires restocking</span>
            </div>
          </div>

          {/* Category Breakdown Cards with Gold & Silver details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CATEGORIES.map((cat) => {
              const stat = summaryReport.categoryStats[cat]
              return (
                <div key={cat} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-black text-sm">{cat}</h3>
                    <span className="text-xs text-gray-400">{stat.count} products</span>
                  </div>
                  <div className="space-y-1.5 mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 font-medium">Gold:</span>
                      <strong className="text-black tabular-nums">
                        {stat.goldUnits} units ({stat.goldWeight.toFixed(1)}g)
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 font-medium">Silver:</span>
                      <strong className="text-black tabular-nums">
                        {stat.silverUnits} units ({stat.silverWeight.toFixed(1)}g)
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-50 font-bold">
                      <span className="text-gray-600">Total:</span>
                      <strong className="text-black tabular-nums">{stat.units} units</strong>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Location Distribution Matrix Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-black tracking-tight">Location Inventory Matrix</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Detailed distribution of Gold and Silver items and weight across physical storage locations.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase font-semibold text-gray-500 tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Product</th>
                    <th className="px-6 py-3.5">Category</th>
                    <th className="px-6 py-3.5">Metal</th>
                    <th className="px-6 py-3.5 text-right">Unit Weight</th>
                    <th className="px-6 py-3.5 text-right font-bold text-black">Total Units</th>
                    {locations.map((loc) => (
                      <th key={loc.id} className="px-6 py-3.5 text-right">
                        {loc.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50/70 transition-[background-color] duration-100">
                      <td className="px-6 py-3 font-semibold text-black">
                        {p.name}
                      </td>
                      <td className="px-6 py-3 text-xs text-gray-600">
                        {p.category}
                      </td>
                      <td className="px-6 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium border border-gray-200 text-gray-700 bg-gray-50">
                          {p.metal}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right text-xs text-gray-600 tabular-nums">
                        {p.category === 'Idols' && (!p.weight || p.weight === 0) ? (
                          <span className="text-gray-400 italic">Variable</span>
                        ) : (
                          `${p.weight}g`
                        )}
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-black tabular-nums">
                        {p.stock}
                      </td>
                      {locations.map((loc) => {
                        const qty = p.stockByLocation?.[loc.id] || 0
                        return (
                          <td
                            key={loc.id}
                            className={`px-6 py-3 text-right tabular-nums ${
                              qty > 0 ? 'text-black font-semibold' : 'text-gray-300'
                            }`}
                          >
                            {qty > 0 ? qty : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200 font-bold text-black text-xs uppercase">
                  <tr>
                    <td colSpan={4} className="px-6 py-3.5 tracking-wider">
                      Total Location Inventory
                    </td>
                    <td className="px-6 py-3.5 text-right text-sm tabular-nums">
                      {summaryReport.totalStockUnits}
                    </td>
                    {locations.map((loc) => (
                      <td key={loc.id} className="px-6 py-3.5 text-right text-sm tabular-nums">
                        {summaryReport.locationStockTotals[loc.id] || 0}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
