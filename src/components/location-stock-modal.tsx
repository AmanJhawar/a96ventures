'use client'

import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  MapPin,
  Search,
  Package,
  Layers,
  Scale,
  Sparkles,
  Boxes
} from 'lucide-react'
import { Location, Product, ProductCategory } from '@/lib/types'
import { formatWeight } from '@/lib/utils/weight'
import { EASE_OUT } from '@/components/motion-transitions'

interface LocationStockModalProps {
  isOpen: boolean
  onClose: () => void
  location: Location | null
  products: Product[]
}

export function LocationStockModal({
  isOpen,
  onClose,
  location,
  products
}: LocationStockModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProductCategory>('all')

  const locId = location?.id || ''

  // Compute location-specific stock statistics
  const {
    totalUnits,
    goldUnits,
    silverUnits,
    goldWeightGrams,
    silverWeightGrams,
    bullionUnits,
    idolUnits,
    locationProducts
  } = useMemo(() => {
    if (!locId) {
      return {
        totalUnits: 0,
        goldUnits: 0,
        silverUnits: 0,
        goldWeightGrams: 0,
        silverWeightGrams: 0,
        bullionUnits: 0,
        idolUnits: 0,
        locationProducts: []
      }
    }

    let totUnits = 0
    let gUnits = 0
    let sUnits = 0
    let gWeight = 0
    let sWeight = 0
    let bUnits = 0
    let iUnits = 0

    const list: Array<{
      product: Product
      quantity: number
      pieceWeights: number[]
      totalWeight: number
    }> = []

    for (const prod of products) {
      const qty = prod.stockByLocation?.[locId] || 0
      if (qty <= 0) continue

      const isIdol = prod.category === 'Idols'
      const isGold = prod.metal === 'Gold'
      const locPieces = prod.pieceWeightsByLocation?.[locId] || []

      let prodWeight = 0
      if (isIdol) {
        prodWeight = locPieces.reduce((sum, w) => sum + (Number(w) || 0), 0)
      } else {
        prodWeight = qty * (Number(prod.weight) || 0)
      }

      totUnits += qty
      if (isGold) {
        gUnits += qty
        gWeight += prodWeight
      } else {
        sUnits += qty
        sWeight += prodWeight
      }

      if (isIdol) {
        iUnits += qty
      } else {
        bUnits += qty
      }

      list.push({
        product: prod,
        quantity: qty,
        pieceWeights: locPieces,
        totalWeight: prodWeight
      })
    }

    // Sort by category, then by name
    list.sort((a, b) => {
      if (a.product.category !== b.product.category) {
        return a.product.category.localeCompare(b.product.category)
      }
      return a.product.name.localeCompare(b.product.name)
    })

    return {
      totalUnits: totUnits,
      goldUnits: gUnits,
      silverUnits: sUnits,
      goldWeightGrams: gWeight,
      silverWeightGrams: sWeight,
      bullionUnits: bUnits,
      idolUnits: iUnits,
      locationProducts: list
    }
  }, [locId, products])

  // Filtered products list inside this location
  const filteredProducts = useMemo(() => {
    return locationProducts.filter((item) => {
      const matchesCategory =
        categoryFilter === 'all' || item.product.category === categoryFilter
      if (!matchesCategory) return false

      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      const matchName = item.product.name.toLowerCase().includes(q)
      const matchSku = item.product.sku.toLowerCase().includes(q)
      const matchBrand = (item.product.brand || '').toLowerCase().includes(q)
      return matchName || matchSku || matchBrand
    })
  }, [locationProducts, categoryFilter, searchQuery])

  if (!isOpen || !location) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/45 backdrop-blur-xs"
        />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, transform: 'scale(0.96) translateY(8px)' }}
          animate={{ opacity: 1, transform: 'scale(1) translateY(0px)' }}
          exit={{ opacity: 0, transform: 'scale(0.96) translateY(8px)' }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="relative w-full max-w-3xl bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh] z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-black shrink-0 border border-gray-200/60">
                <MapPin size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-black tracking-tight">
                    {location.name}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                    {totalUnits} {totalUnits === 1 ? 'unit' : 'units'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {location.description || 'Inventory breakdown and stocked products'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-black rounded-lg hover:bg-gray-100 transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
              title="Close modal"
            >
              <X size={18} />
            </button>
          </div>

          {/* Metric Summary Cards */}
          <div className="p-6 pb-4 bg-gray-50/50 border-b border-gray-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Total Units */}
            <div className="p-3.5 bg-white border border-gray-200 rounded-xl shadow-xs">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                <Package size={13} className="text-gray-400" />
                <span>Total Units</span>
              </div>
              <div className="text-xl font-bold text-black tabular-nums">
                {totalUnits.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {locationProducts.length} product {locationProducts.length === 1 ? 'type' : 'types'}
              </div>
            </div>

            {/* Gold Stock */}
            <div className="p-3.5 bg-white border border-gray-200 rounded-xl shadow-xs">
              <div className="flex items-center gap-1.5 text-xs text-amber-700 font-medium mb-1">
                <Sparkles size={13} className="text-amber-500" />
                <span>Gold Stock</span>
              </div>
              <div className="text-xl font-bold text-black tabular-nums">
                {goldUnits} <span className="text-xs font-semibold text-gray-500">pcs</span>
              </div>
              <div className="text-[11px] font-mono text-gray-600 mt-0.5">
                {goldWeightGrams > 0 ? formatWeight(goldWeightGrams) : '0 g'}
              </div>
            </div>

            {/* Silver Stock */}
            <div className="p-3.5 bg-white border border-gray-200 rounded-xl shadow-xs">
              <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium mb-1">
                <Boxes size={13} className="text-slate-400" />
                <span>Silver Stock</span>
              </div>
              <div className="text-xl font-bold text-black tabular-nums">
                {silverUnits} <span className="text-xs font-semibold text-gray-500">pcs</span>
              </div>
              <div className="text-[11px] font-mono text-gray-600 mt-0.5">
                {silverWeightGrams > 0 ? formatWeight(silverWeightGrams) : '0 g'}
              </div>
            </div>

            {/* Categories */}
            <div className="p-3.5 bg-white border border-gray-200 rounded-xl shadow-xs">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                <Layers size={13} className="text-gray-400" />
                <span>Categories</span>
              </div>
              <div className="text-xs font-semibold text-black space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Bullions:</span>
                  <span className="tabular-nums font-bold">{bullionUnits}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Idols:</span>
                  <span className="tabular-nums font-bold">{idolUnits}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="px-6 py-3 border-b border-gray-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white">
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search products by name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black focus:bg-white transition-[background-color,border-color] duration-150"
              />
            </div>

            <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg shrink-0">
              {(['all', 'Bullions', 'Idols'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
                    categoryFilter === cat
                      ? 'bg-white text-black shadow-xs'
                      : 'text-gray-600 hover:text-black'
                  }`}
                >
                  {cat === 'all' ? 'All' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Products Table / List */}
          <div className="flex-1 overflow-y-auto min-h-[220px]">
            {filteredProducts.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center px-4">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-2">
                  <Package size={20} />
                </div>
                <p className="text-sm font-semibold text-gray-800">No products found</p>
                <p className="text-xs text-gray-500 max-w-xs mt-0.5">
                  {locationProducts.length === 0
                    ? `No stock is currently registered at ${location.name}. Record a purchase or stock transfer to add units.`
                    : 'No items match your search or filter.'}
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50/70 border-b border-gray-200 text-[11px] uppercase font-semibold text-gray-500 tracking-wider sticky top-0 z-10 backdrop-blur-xs">
                  <tr>
                    <th className="px-6 py-2.5">Product</th>
                    <th className="px-4 py-2.5">Metal & Purity</th>
                    <th className="px-4 py-2.5 text-right">Available Qty</th>
                    <th className="px-6 py-2.5 text-right">Total Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.map(({ product, quantity, pieceWeights, totalWeight }) => {
                    const isIdol = product.category === 'Idols'
                    const isGold = product.metal === 'Gold'

                    return (
                      <tr
                        key={product.id}
                        className="hover:bg-gray-50/60 transition-[background-color] duration-100"
                      >
                        <td className="px-6 py-3">
                          <div className="font-semibold text-black">{product.name}</div>
                          <div className="flex items-center gap-2 text-[11px] text-gray-500 font-mono mt-0.5">
                            <span>{product.sku}</span>
                            <span>·</span>
                            <span>{product.category}</span>
                            {product.brand && (
                              <>
                                <span>·</span>
                                <span>{product.brand}</span>
                              </>
                            )}
                          </div>

                          {/* Idol Piece Weight Tags */}
                          {isIdol && pieceWeights.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {pieceWeights.map((pw, i) => (
                                <span
                                  key={`${pw}-${i}`}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-gray-100 text-gray-700 border border-gray-200"
                                >
                                  {formatWeight(pw)}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isGold ? 'bg-amber-500' : 'bg-slate-400'
                              }`}
                            />
                            <span className="font-medium text-black">
                              {product.metal || 'Silver'}
                            </span>
                            {product.purity && (
                              <span className="text-[11px] text-gray-500">
                                ({product.purity})
                              </span>
                            )}
                          </div>
                          {!isIdol && product.weight ? (
                            <div className="text-[11px] text-gray-500 mt-0.5 font-mono">
                              Unit: {formatWeight(product.weight)}
                            </div>
                          ) : null}
                        </td>

                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                          <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-bold bg-black text-white">
                            {quantity} {quantity === 1 ? 'unit' : 'units'}
                          </span>
                        </td>

                        <td className="px-6 py-3 text-right tabular-nums font-mono font-semibold text-black whitespace-nowrap">
                          {totalWeight > 0 ? formatWeight(totalWeight) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
            <span>
              Showing {filteredProducts.length} of {locationProducts.length} stocked products
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 hover:text-black transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
