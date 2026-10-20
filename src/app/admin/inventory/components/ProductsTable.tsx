'use client'

import React from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown, Edit2, Archive, Plus } from 'lucide-react'
import { Product } from '@/lib/types'
import { ProductSortOption } from './types'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'

interface ProductsTableProps {
  products: Product[]
  sortBy: any
  toggleSort: (col: any) => void
  locationMap: Map<string, string>
  formatWeight: (w?: number) => string
  hasPermission: (module: any, action: any) => boolean
  archivedSession: boolean
  handleOpenAddProduct: () => void
  handleEditProduct: (p: Product) => void
  setDeleteProductTarget: (p: Product) => void
  onSelectLocationId?: (locId: string) => void
}

export function ProductsTable({
  products,
  sortBy,
  toggleSort,
  locationMap,
  formatWeight,
  hasPermission,
  archivedSession,
  handleOpenAddProduct,
  handleEditProduct,
  setDeleteProductTarget,
  onSelectLocationId
}: ProductsTableProps) {
  if (products.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <EmptyState
          title="No products in this filter"
          description="Add your first product to start tracking inventory across Gold & Silver."
          action={
            <Button
              type="button"
              variant="primary"
              onClick={handleOpenAddProduct}
              className="inline-flex items-center gap-1.5"
            >
              <Plus size={16} />
              Add product
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-gray-50/95 backdrop-blur z-10 border-b border-gray-200 text-xs uppercase font-semibold text-gray-500 tracking-wider">
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
              <th className="px-6 py-3.5">Metal & Purity</th>
              <th
                onClick={() => toggleSort('weight')}
                className="px-6 py-3.5 cursor-pointer hover:text-black transition-colors select-none"
              >
                <div className="inline-flex items-center gap-1.5">
                  <span>Weight / Pieces</span>
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
            {products.map((p) => {
              const locEntries = Object.entries(p.stockByLocation || {}).filter(
                ([, qty]) => Number(qty) > 0
              )
              return (
                <tr key={p.id} className="hover:bg-gray-50/70 transition-[background-color] duration-100">
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-black">{p.name}</span>
                        {p.isArchived && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 border border-gray-300 rounded">
                            Archived
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700">
                          {p.category}
                        </span>
                        {p.brand && p.brand !== 'Local' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border border-gray-200 text-gray-600 bg-white">
                            {p.brand}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-600">
                    {p.sku}
                  </td>
                  <td className="px-6 py-4 text-xs">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-gray-200 text-gray-700 bg-gray-50">
                      <strong>{p.metal}</strong>
                      <span className="text-gray-400">·</span>
                      <span>{p.purity || '—'}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 text-xs">
                    {p.category === 'Idols' ? (
                      <div>
                        <span className="font-semibold text-black">
                          {p.weight && p.weight > 0 ? `~${formatWeight(p.weight)} avg` : 'Variable'}
                        </span>
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
                      <span className="font-semibold text-black">{formatWeight(p.weight)}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {locEntries.length === 0 ? (
                      <span className="text-xs text-gray-400 italic">No location stock</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {locEntries.map(([locId, qty]) => {
                          const locName = locationMap.get(locId) || 'Loc'
                          if (onSelectLocationId) {
                            return (
                              <button
                                key={locId}
                                type="button"
                                onClick={() => onSelectLocationId(locId)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-50 hover:bg-gray-100 hover:border-gray-300 border border-gray-200 text-xs text-gray-700 transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] cursor-pointer"
                                title={`Click to view ${locName} stock breakdown`}
                              >
                                <span className="text-gray-400">{locName}:</span>
                                <strong className="font-semibold text-black">{qty}</strong>
                              </button>
                            )
                          }
                          return (
                            <span
                              key={locId}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-50 border border-gray-200 text-xs text-gray-700"
                            >
                              <span className="text-gray-400">{locName}:</span>
                              <strong className="font-semibold text-black">{qty}</strong>
                            </span>
                          )
                        })}
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
                          type="button"
                          onClick={() => handleEditProduct(p)}
                          title="Edit"
                          className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                      {!archivedSession && hasPermission('products', 'delete') && (
                        <button
                          type="button"
                          onClick={() => setDeleteProductTarget(p)}
                          title={p.isArchived ? "Product archived" : "Archive product"}
                          disabled={p.isArchived}
                          className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 disabled:opacity-30 transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                        >
                          <Archive size={14} />
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
}
