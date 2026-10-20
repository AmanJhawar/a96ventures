'use client'

import React from 'react'
import { Plus, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MovementSubtype } from './types'

interface MovementsTableProps {
  filteredMovements: any[]
  paginatedMovements: any[]
  movementsPage: number
  totalMovementsPages: number
  pageSize: number
  setMovementsPage: React.Dispatch<React.SetStateAction<number>>
  movementTypeFilter: string
  allowedMovementTypes: MovementSubtype[]
  handleOpenMovement: (type: MovementSubtype) => void
  canRecordMovement: boolean
  formatWeight: (w?: number) => string
  archivedSession: boolean
  hasPermission: (module: any, action: any) => boolean
  setDeleteTxTarget: (tx: any) => void
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

export function MovementsTable({
  filteredMovements,
  paginatedMovements,
  movementsPage,
  totalMovementsPages,
  pageSize,
  setMovementsPage,
  movementTypeFilter,
  allowedMovementTypes,
  handleOpenMovement,
  canRecordMovement,
  formatWeight,
  archivedSession,
  hasPermission,
  setDeleteTxTarget
}: MovementsTableProps) {
  if (filteredMovements.length === 0) {
    return (
      <div className="text-center py-16 bg-white border border-gray-200 rounded-xl">
        <h3 className="text-base font-semibold text-black mb-1">No stock movements recorded</h3>
        <p className="text-sm text-gray-500 max-w-sm mx-auto mb-4">
          {movementTypeFilter !== 'All'
            ? `No ${movementTypeFilter} records found under the current filters.`
            : 'Stock movements track transfers between stores, physical count audits, idol weight repairs, and scrap melts.'}
        </p>
        {allowedMovementTypes.length > 0 && (
          <Button
            type="button"
            variant="primary"
            onClick={() => handleOpenMovement(allowedMovementTypes[0])}
            disabled={!canRecordMovement}
            className="inline-flex items-center gap-1.5"
          >
            <Plus size={16} />
            Record movement
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
              <th className="px-6 py-3.5">Type & Product</th>
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
                  <td className="px-6 py-4 text-xs font-medium text-gray-600 whitespace-nowrap">
                    {formatDateDisplay(tx.date)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium border border-gray-200 bg-gray-50 text-gray-800 capitalize">
                          {tx.type}
                        </span>
                        {tx.metal && (
                          <span className="inline-flex px-1.5 py-0.2 rounded text-[10px] font-medium border border-gray-200 text-gray-600 bg-white">
                            {tx.metal}
                          </span>
                        )}
                      </div>
                      <span className="font-semibold text-black text-xs">{tx.productName}</span>
                    </div>
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
                          <span className="text-[10px] font-mono text-gray-500 block font-normal" title={tx.pieceWeights.map((w: number) => formatWeight(w)).join(', ')}>
                            {tx.pieceWeights.length} pcs ({tx.pieceWeights.slice(0, 2).map((w: number) => formatWeight(w)).join(', ')}{tx.pieceWeights.length > 2 ? '…' : ''})
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
                    {!archivedSession && hasPermission('movements', 'delete') && !tx.isReversed && !tx.reversalOf && !tx.isOpeningBalance && !tx.isOpeningEntry && (
                      <button
                        type="button"
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
              type="button"
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
              type="button"
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
}
