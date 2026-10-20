'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Trash2, Lock } from 'lucide-react'
import { Product, AdminUser } from '@/lib/types'
import { PurchaseLineItem } from './types'
import { EASE_OUT } from '@/components/motion-transitions'
import CustomSelect, { SelectOption } from '@/components/custom-select'
import CustomDatePicker from '@/components/custom-date-picker'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/ui/form-error'
import { formatWeight } from '@/lib/utils/weight'

interface RecordPurchaseModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (e: React.FormEvent) => Promise<void>
  isLocationLocked: boolean
  purchaseLocationId: string
  setPurchaseLocationId: (id: string) => void
  locationMap: Map<string, string>
  adminUser: AdminUser | null
  locationOptions: SelectOption[]
  purchaseDate: string
  setPurchaseDate: (d: string) => void
  purchaseNotes: string
  setPurchaseNotes: (n: string) => void
  purchaseItems: PurchaseLineItem[]
  products: Product[]
  productOptions: SelectOption[]
  onAddPurchaseItem: () => void
  onRemovePurchaseItem: (id: string) => void
  onUpdatePurchaseItem: (id: string, updates: Partial<PurchaseLineItem>) => void
  onAddPieceWeight: (itemId: string) => void
  onRemovePieceWeight: (itemId: string, pieceIndex: number) => void
  purchaseTotals: {
    totalUnits: number
    totalWeightGrams: number
    grandTotal: number
  }
  submitting: boolean
  isValid: boolean
  error: string | null
}

export function RecordPurchaseModal({
  isOpen,
  onClose,
  onSubmit,
  isLocationLocked,
  purchaseLocationId,
  setPurchaseLocationId,
  locationMap,
  adminUser,
  locationOptions,
  purchaseDate,
  setPurchaseDate,
  purchaseNotes,
  setPurchaseNotes,
  purchaseItems,
  products,
  productOptions,
  onAddPurchaseItem,
  onRemovePurchaseItem,
  onUpdatePurchaseItem,
  onAddPieceWeight,
  onRemovePieceWeight,
  purchaseTotals,
  submitting,
  isValid,
  error
}: RecordPurchaseModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, transform: 'scale(0.97) translateY(8px)' }}
          animate={{ opacity: 1, transform: 'scale(1) translateY(0px)' }}
          exit={{ opacity: 0, transform: 'scale(0.97) translateY(8px)' }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm"
        >
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-black">Record Purchase</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
              {purchaseItems.length} {purchaseItems.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97]"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4">
            <FormError message={error} />
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-5">
          {/* Common Purchase Header */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50/70 border border-gray-200 rounded-xl">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-gray-700">
                  Receiving Location <span className="text-rose-500">*</span>
                </label>
                {isLocationLocked && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                    <Lock className="w-2.5 h-2.5 text-gray-500" />
                    Locked
                  </span>
                )}
              </div>
              {isLocationLocked ? (
                <div className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-xs font-semibold text-black">
                  {locationMap.get(purchaseLocationId) ||
                    adminUser?.assignedLocationName ||
                    'Assigned Location'}
                </div>
              ) : (
                <CustomSelect
                  value={purchaseLocationId}
                  onValueChange={setPurchaseLocationId}
                  options={locationOptions}
                  placeholder="Select receiving location..."
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Purchase Date <span className="text-rose-500">*</span>
              </label>
              <CustomDatePicker
                value={purchaseDate}
                onChange={setPurchaseDate}
                placeholder="Select purchase date"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Notes / Supplier Ref (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Supplier Invoice #9821, MMTC lot 44"
                value={purchaseNotes}
                onChange={(e) => setPurchaseNotes(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
              />
            </div>
          </div>

          {/* Purchase Line Items List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">
                Purchase Line Items ({purchaseItems.length})
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<Plus size={13} />}
                onClick={onAddPurchaseItem}
              >
                Add Another Item
              </Button>
            </div>

            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {purchaseItems.map((item, idx) => {
                  const prod = products.find((p) => p.id === item.productId)
                  const isIdol = prod?.category === 'Idols'
                  const lineTotal =
                    (Number(item.price) || 0) *
                    (isIdol ? item.pieceWeights.length : Number(item.quantity) || 0)

                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, transform: 'scale(0.98) translateY(6px)' }}
                      animate={{ opacity: 1, transform: 'scale(1) translateY(0px)' }}
                      exit={{ opacity: 0, transform: 'scale(0.98) translateY(-6px)' }}
                      transition={{ duration: 0.16, ease: EASE_OUT }}
                      className="p-4 bg-gray-50/70 border border-gray-200 rounded-xl space-y-3 relative"
                    >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-semibold text-gray-800">
                          Item #{idx + 1}
                        </span>
                        {prod && (
                          <span className="text-xs text-gray-500">
                            ({prod.category} · {prod.metal})
                          </span>
                        )}
                      </div>

                      {purchaseItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onRemovePurchaseItem(item.id)}
                          className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                          title="Remove item"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                      <div className="sm:col-span-6">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Product <span className="text-rose-500">*</span>
                        </label>
                        <CustomSelect
                          size="sm"
                          value={item.productId}
                          onValueChange={(val) =>
                            onUpdatePurchaseItem(item.id, { productId: val })
                          }
                          options={productOptions}
                          placeholder="Select product to restock..."
                        />
                        {prod ? (
                          <div className="text-xs text-gray-500 mt-1">
                            Current stock at location:{' '}
                            <strong>
                              {prod.stockByLocation?.[purchaseLocationId] || 0} units
                            </strong>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 mt-1">
                            Select a product to view stock
                          </div>
                        )}
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Qty <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          disabled={isIdol}
                          placeholder={isIdol ? '0' : 'Qty'}
                          value={
                            isIdol
                              ? String(item.pieceWeights.length || 0)
                              : item.quantity
                          }
                          onChange={(e) =>
                            onUpdatePurchaseItem(item.id, { quantity: e.target.value })
                          }
                          className={`h-9 w-full px-3 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150 ${
                            isIdol ? 'bg-gray-100 cursor-not-allowed font-semibold' : ''
                          }`}
                          required
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Unit Cost (₹)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="e.g. 75000"
                          value={item.price}
                          onChange={(e) =>
                            onUpdatePurchaseItem(item.id, { price: e.target.value })
                          }
                          className="h-9 w-full px-3 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Total
                        </label>
                        <div className="h-9 px-3 bg-gray-100 border border-gray-200 rounded-lg flex items-center justify-end font-bold text-xs text-black tabular-nums">
                          {lineTotal > 0
                            ? `₹${lineTotal.toLocaleString('en-IN')}`
                            : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Idol piece weight batch registration */}
                    {isIdol && (
                      <div className="pt-2 border-t border-gray-200/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-700">
                            Register Piece Weights for this Idol Batch
                          </span>
                          {item.pieceWeights.length > 0 && (
                            <span className="text-xs font-semibold text-black bg-gray-200 px-2 py-0.5 rounded">
                              {item.pieceWeights.length} pcs (
                              {formatWeight(
                                item.pieceWeights.reduce((a, b) => a + b, 0)
                              )}
                              )
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="e.g. 48.250, 51.600, 49.825"
                            value={item.pieceInput}
                            onChange={(e) =>
                              onUpdatePurchaseItem(item.id, {
                                pieceInput: e.target.value
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                onAddPieceWeight(item.id)
                              }
                            }}
                            className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => onAddPieceWeight(item.id)}
                          >
                            + Add Piece
                          </Button>
                        </div>

                        {item.pieceWeights.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-white rounded-lg border border-gray-200">
                            {item.pieceWeights.map((w, pieceIdx) => (
                              <span
                                key={pieceIdx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 border border-gray-200 text-xs font-medium text-gray-800"
                              >
                                <span>
                                  #{pieceIdx + 1}: {formatWeight(w)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onRemovePieceWeight(item.id, pieceIdx)
                                  }
                                  className="text-gray-400 hover:text-rose-600 transition-colors ml-0.5"
                                  title="Remove piece"
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* Purchase Summary Footer */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-6 divide-x divide-gray-200 text-xs">
              <div>
                <span className="text-gray-500 block">Total Items</span>
                <span className="font-bold text-sm text-black tabular-nums">
                  {purchaseItems.length}{' '}
                  {purchaseItems.length === 1 ? 'item' : 'items'} (
                  {purchaseTotals.totalUnits} units)
                </span>
              </div>
              {purchaseTotals.totalWeightGrams > 0 && (
                <div className="pl-6">
                  <span className="text-gray-500 block">Total Weight</span>
                  <span className="font-bold text-sm text-black tabular-nums">
                    {formatWeight(purchaseTotals.totalWeightGrams)}
                  </span>
                </div>
              )}
              {purchaseTotals.grandTotal > 0 && (
                <div className="pl-6">
                  <span className="text-gray-500 block">Total Value</span>
                  <span className="font-extrabold text-base text-black tabular-nums">
                    ₹{purchaseTotals.grandTotal.toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting} disabled={!isValid}>
                {`Record Purchase (${purchaseItems.length} ${
                  purchaseItems.length === 1 ? 'item' : 'items'
                })`}
              </Button>
            </div>
          </div>
        </form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
