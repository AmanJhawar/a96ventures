'use client'

import React from 'react'
import { Plus, ChevronLeft, ChevronRight, Pencil, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PurchasesTableProps {
  filteredPurchases: any[]
  paginatedPurchases: any[]
  purchasesPage: number
  totalPurchasesPages: number
  pageSize: number
  setPurchasesPage: React.Dispatch<React.SetStateAction<number>>
  formatWeight: (w?: number) => string
  archivedSession: boolean
  isSuperAdmin: boolean
  hasPermission: (module: any, action: any) => boolean
  handleOpenAddPurchase: () => void
  handleOpenEditPurchase: (tx: any) => void
  setDeleteTxTarget: (tx: any) => void
  canAddPurchase: boolean
}

function formatDateDisplay(rawDate: string): string {
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

export function PurchasesTable({
  filteredPurchases,
  paginatedPurchases,
  purchasesPage,
  totalPurchasesPages,
  pageSize,
  setPurchasesPage,
  formatWeight,
  archivedSession,
  isSuperAdmin,
  hasPermission,
  handleOpenAddPurchase,
  handleOpenEditPurchase,
  setDeleteTxTarget,
  canAddPurchase
}: PurchasesTableProps) {
  if (filteredPurchases.length === 0) {
    return (
      <div className="text-center py-16 bg-white border border-gray-200 rounded-xl">
        <h3 className="text-base font-semibold text-black mb-1">No purchases recorded</h3>
        <p className="text-sm text-gray-500 max-w-sm mx-auto mb-4">
          Purchases record incoming stock inventory and automatically increase product counts at designated locations.
        </p>
        {hasPermission('purchases', 'add') && (
          <Button
            type="button"
            variant="primary"
            onClick={handleOpenAddPurchase}
            disabled={!canAddPurchase}
            className="inline-flex items-center gap-1.5"
          >
            <Plus size={16} />
            Record first purchase
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-gray-50/95 backdrop-blur z-10 border-b border-gray-200 text-xs uppercase font-semibold text-gray-500 tracking-wider">
            <tr>
              <th className="px-6 py-3.5">Date</th>
              <th className="px-6 py-3.5">Product</th>
              <th className="px-6 py-3.5">Location</th>
              <th className="px-6 py-3.5 text-right">Quantity</th>
              <th className="px-6 py-3.5 text-right">Cost & Total (₹)</th>
              <th className="px-6 py-3.5">Notes & Status</th>
              <th className="px-6 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedPurchases.map((tx) => {
              const totalVal = tx.price ? tx.price * tx.quantity : 0
              return (
                <tr key={tx.id} className="hover:bg-gray-50/70 transition-[background-color] duration-100">
                  <td className="px-6 py-4 text-xs font-medium text-gray-600 whitespace-nowrap">
                    {formatDateDisplay(tx.date)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-black">{tx.productName}</span>
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                        <span>{tx.category}</span>
                        {tx.metal && (
                          <>
                            <span>·</span>
                            <span className="font-medium text-gray-700">{tx.metal}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-700">
                    {tx.locationName}
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums font-semibold text-black">
                    +{tx.quantity}
                    {tx.pieceWeights && tx.pieceWeights.length > 0 && (
                      <div className="text-[11px] font-mono text-gray-500 font-normal">
                        avg {formatWeight(tx.pieceWeights.reduce((a: number, b: number) => a + b, 0) / tx.pieceWeights.length)}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums">
                    <div className="font-semibold text-black">
                      {totalVal > 0 ? `₹${totalVal.toLocaleString('en-IN')}` : '—'}
                    </div>
                    {tx.price ? (
                      <div className="text-[11px] text-gray-500">
                        @ ₹{tx.price.toLocaleString('en-IN')} / unit
                      </div>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500 max-w-xs">
                    <div className="truncate">{tx.notes || '—'}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {tx.isReversed && (
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          Reversed
                        </span>
                      )}
                      {tx.reversalOf && (
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                          Reversal
                        </span>
                      )}
                      {(tx.isOpeningBalance || tx.isOpeningEntry) && (
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          Opening Balance
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!archivedSession && (isSuperAdmin || hasPermission('purchases', 'edit')) && !tx.isReversed && !tx.reversalOf && !tx.isOpeningBalance && !tx.isOpeningEntry && (
                        <button
                          type="button"
                          onClick={() => handleOpenEditPurchase(tx)}
                          title="Edit purchase"
                          className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {!archivedSession && hasPermission('purchases', 'delete') && !tx.isReversed && !tx.reversalOf && !tx.isOpeningBalance && !tx.isOpeningEntry && (
                        <button
                          type="button"
                          onClick={() => setDeleteTxTarget(tx)}
                          title="Post reversing entry"
                          className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                        >
                          <RotateCcw size={14} />
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
              type="button"
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
              type="button"
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
}
