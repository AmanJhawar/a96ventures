"use client"

import React from 'react'
import { RotateCcw } from 'lucide-react'
import { Transaction, UserPermissions } from '@/lib/types'
import { formatDateDisplay } from './types'
import { formatWeight } from '@/lib/utils/weight'
import { EmptyState } from '@/components/empty-state'

interface ReturnsTableProps {
  filteredReturns: Transaction[]
  totalReturnsCount: number
  hasPermission: (module: keyof UserPermissions, action: string) => boolean
  onReverseReturn: (tx: Transaction) => void
  returnsHasMore: boolean
  loadingMoreReturns: boolean
  onLoadMoreReturns: () => void
  onOpenReturnForm: () => void
  canAddReturn: boolean
}

export function ReturnsTable({
  filteredReturns,
  totalReturnsCount,
  hasPermission,
  onReverseReturn,
  returnsHasMore,
  loadingMoreReturns,
  onLoadMoreReturns,
  onOpenReturnForm,
  canAddReturn
}: ReturnsTableProps) {
  if (filteredReturns.length === 0) {
    return (
      <EmptyState
        title="No returns recorded"
        description="Returns restore items back into stock at your chosen location and track customer refund amounts."
        action={
          canAddReturn ? (
            <button
              onClick={onOpenReturnForm}
              className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              <RotateCcw size={16} />
              Record First Return
            </button>
          ) : undefined
        }
      />
    )
  }

  return (
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
                  <td className="px-5 py-4 text-right font-mono tabular-nums font-bold text-black">
                    {totalVal > 0 ? `₹${totalVal.toLocaleString('en-IN')}` : '—'}
                    {tx.notes && (
                      <div className="text-[11px] text-gray-400 font-normal truncate max-w-xs ml-auto">
                        {tx.notes}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {hasPermission('returns', 'delete') && !tx.isReversed && !tx.reversalOf && !tx.orderId && (
                      <button
                        onClick={() => onReverseReturn(tx)}
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
          <strong className="text-black font-semibold">{totalReturnsCount}</strong> recorded returns
        </span>
        {returnsHasMore ? (
          <button
            onClick={onLoadMoreReturns}
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
}
