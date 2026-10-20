'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Lock, Plus, Trash2 } from 'lucide-react'
import CustomSelect from '@/components/custom-select'
import { CustomDatePicker } from '@/components/custom-date-picker'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/ui/form-error'
import { AdminUser, Product } from '@/lib/types'
import { MovementSubtype, TransferLineItem } from './types'

const EASE_OUT = [0.16, 1, 0.3, 1] as const

interface RecordMovementModalProps {
  isOpen: boolean
  onClose: () => void
  allowedMovementTypes: MovementSubtype[]
  movementType: MovementSubtype | ''
  setMovementType: (type: MovementSubtype) => void
  movementError: string | null
  setMovementError: (err: string | null) => void
  handleSaveMovement: (e: React.FormEvent) => void
  products: Product[]
  transferItems: TransferLineItem[]
  onAddTransferItem: () => void
  onRemoveTransferItem: (id: string) => void
  onUpdateTransferItem: (id: string, updates: Partial<TransferLineItem>) => void
  movementProductId: string
  setMovementProductId: (id: string) => void
  productOptions: { value: string; label: string }[]
  movementLocationId: string
  setMovementLocationId: (id: string) => void
  isLocationLocked: boolean
  locationMap: Map<string, string>
  adminUser: AdminUser | null
  movementLocationOptions: { value: string; label: string }[]
  isMovementProductAnIdol: boolean
  availableMovementPieces: number[]
  movementPieceWeight: string
  setMovementPieceWeight: (val: string) => void
  movementToLocationId: string
  setMovementToLocationId: (id: string) => void
  destinationLocationOptions: { value: string; label: string }[]
  locationsLength: number
  movementQty: string
  setMovementQty: (qty: string) => void
  currentSourceStock: number
  currentDestStock: number
  movementAdjustmentMode: 'deficit' | 'surplus' | ''
  setMovementAdjustmentMode: (mode: 'deficit' | 'surplus') => void
  selectedMovementProduct: Product | undefined
  movementNewWeight: string
  setMovementNewWeight: (val: string) => void
  movementRepairCharge: string
  setMovementRepairCharge: (val: string) => void
  movementRecoveredWeight: string
  setMovementRecoveredWeight: (val: string) => void
  movementDate: string
  setMovementDate: (date: string) => void
  movementNotes: string
  setMovementNotes: (notes: string) => void
  movementSubmitting: boolean
  isMovementFormValid: boolean
  formatWeight: (w?: number) => string
}

export function RecordMovementModal({
  isOpen,
  onClose,
  allowedMovementTypes,
  movementType,
  setMovementType,
  movementError,
  setMovementError,
  handleSaveMovement,
  products,
  transferItems,
  onAddTransferItem,
  onRemoveTransferItem,
  onUpdateTransferItem,
  movementProductId,
  setMovementProductId,
  productOptions,
  movementLocationId,
  setMovementLocationId,
  isLocationLocked,
  locationMap,
  adminUser,
  movementLocationOptions,
  isMovementProductAnIdol,
  availableMovementPieces,
  movementPieceWeight,
  setMovementPieceWeight,
  movementToLocationId,
  setMovementToLocationId,
  destinationLocationOptions,
  locationsLength,
  movementQty,
  setMovementQty,
  currentSourceStock,
  currentDestStock,
  movementAdjustmentMode,
  setMovementAdjustmentMode,
  selectedMovementProduct,
  movementNewWeight,
  setMovementNewWeight,
  movementRepairCharge,
  setMovementRepairCharge,
  movementRecoveredWeight,
  setMovementRecoveredWeight,
  movementDate,
  setMovementDate,
  movementNotes,
  setMovementNotes,
  movementSubmitting,
  isMovementFormValid,
  formatWeight
}: RecordMovementModalProps) {
  const isTransfer = movementType === 'transfer'

  const totalTransferUnits = React.useMemo(() => {
    if (!isTransfer || !transferItems) return 0
    return transferItems.reduce((sum, it) => {
      const prod = products.find((p) => p.id === it.productId)
      if (!prod) return sum
      if (prod.category === 'Idols') {
        return sum + (it.pieceWeights?.length || 0)
      }
      const q = Number(it.quantity)
      return sum + (!isNaN(q) && q > 0 ? q : 0)
    }, 0)
  }, [isTransfer, transferItems, products])
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
            <div>
              <h2 className="text-lg font-semibold text-black">Record stock movement</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Transfer between locations, audit inventory counts, log repairs, or melt scrap metal.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97]"
            >
              <X size={18} />
            </button>
          </div>

          {/* Segmented Control for Movement Type */}
          <div className="flex items-center p-1 bg-gray-100 rounded-lg mb-5 max-w-md">
            {allowedMovementTypes.map((type) => {
              const labelMap: Record<MovementSubtype, string> = {
                transfer: 'Transfer',
                adjustment: 'Audit / Adjust',
                repair: 'Repair',
                melt: 'Melt'
              }
              const isActive = movementType === type
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setMovementType(type)
                    setMovementError(null)
                  }}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${isActive
                    ? 'bg-white text-black shadow-xs font-semibold'
                    : 'text-gray-500 hover:text-black'
                    }`}
                >
                  {labelMap[type]}
                </button>
              )
            })}
          </div>

          {movementError && (
            <div className="mb-4">
              <FormError message={movementError} />
            </div>
          )}

          <form onSubmit={handleSaveMovement} className="space-y-4">
            {!movementType ? (
              <div className="p-8 text-center bg-gray-50/70 border border-dashed border-gray-200 rounded-xl space-y-1">
                <p className="text-sm font-semibold text-black">Please select a movement type</p>
                <p className="text-xs text-gray-500">
                  Select Transfer, Audit / Adjust, Repair, or Melt from the options above to begin.
                </p>
              </div>
            ) : movementType === 'transfer' ? (
              <div className="space-y-4">
                {/* Source & Destination Locations */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50/70 border border-gray-200 rounded-xl relative z-30">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-gray-700">
                        Source location <span className="text-rose-500">*</span>
                      </label>
                      {isLocationLocked && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                          <Lock className="w-3 h-3 text-gray-500" />
                          Assigned store
                        </span>
                      )}
                    </div>
                    {isLocationLocked ? (
                      <div className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-lg text-sm text-black flex items-center justify-between font-semibold">
                        <span>
                          {locationMap.get(movementLocationId) || adminUser?.assignedLocationName || 'Assigned Location'}
                        </span>
                        <span className="text-xs text-gray-500 font-medium">Locked</span>
                      </div>
                    ) : (
                      <CustomSelect
                        value={movementLocationId}
                        onValueChange={setMovementLocationId}
                        options={movementLocationOptions}
                        placeholder="Select source location..."
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Destination location <span className="text-rose-500">*</span>
                    </label>
                    <CustomSelect
                      value={movementToLocationId}
                      onValueChange={setMovementToLocationId}
                      options={destinationLocationOptions}
                      placeholder={locationsLength < 2 ? 'At least 2 locations required' : 'Select destination location...'}
                    />
                  </div>
                </div>

                {/* Transfer Line Items List */}
                <div className="space-y-3 relative z-20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-800">
                        Products to transfer
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700">
                        {transferItems.length} {transferItems.length === 1 ? 'product' : 'products'}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={<Plus size={13} />}
                      onClick={onAddTransferItem}
                    >
                      Add Another Product
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <AnimatePresence initial={false}>
                      {transferItems.map((item, idx) => {
                        const prod = products.find((p) => p.id === item.productId)
                        const isIdol = prod?.category === 'Idols'
                        const availableStock = prod?.stockByLocation?.[movementLocationId] || 0
                        const availablePieces = prod?.pieceWeightsByLocation?.[movementLocationId] || []

                        const usedInOtherLines = transferItems
                          .filter((it) => it.id !== item.id && it.productId === item.productId)
                          .reduce((sum, it) => sum + (Number(it.quantity) || 0), 0)
                        const remainingAvailable = Math.max(0, availableStock - usedInOtherLines)

                        const piecesUsedInOtherLines = new Set<number>()
                        transferItems
                          .filter((it) => it.id !== item.id && it.productId === item.productId)
                          .forEach((it) => (it.pieceWeights || []).forEach((pw) => piecesUsedInOtherLines.add(pw)))

                        const requestedQty = Number(item.quantity) || 0
                        const isOverStock = !isIdol && item.productId && requestedQty > remainingAvailable

                        return (
                          <motion.div
                            key={item.id}
                            style={{ zIndex: 50 - idx }}
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
                                  Product #{idx + 1}
                                </span>
                                {prod && (
                                  <span className="text-xs text-gray-500">
                                    ({prod.category} · {prod.metal})
                                  </span>
                                )}
                              </div>

                              {transferItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => onRemoveTransferItem(item.id)}
                                  className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                                  title="Remove product"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                              <div className={isIdol ? 'sm:col-span-12' : 'sm:col-span-8'}>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Product <span className="text-rose-500">*</span>
                                </label>
                                <CustomSelect
                                  size="sm"
                                  value={item.productId}
                                  onValueChange={(val) => {
                                    onUpdateTransferItem(item.id, {
                                      productId: val,
                                      quantity: '1',
                                      pieceWeights: []
                                    })
                                  }}
                                  options={productOptions}
                                  placeholder="Select product to transfer..."
                                />
                                {prod ? (
                                  <div className="text-xs text-gray-500 mt-1">
                                    Available at {locationMap.get(movementLocationId) || 'source'}:{' '}
                                    <strong className={availableStock === 0 ? 'text-rose-600' : 'text-black'}>
                                      {availableStock} units
                                    </strong>
                                    {usedInOtherLines > 0 && (
                                      <span className="ml-1 text-gray-400">
                                        ({remainingAvailable} remaining after other lines)
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-400 mt-1">
                                    Select a product to view available source stock
                                  </div>
                                )}
                              </div>

                              {!isIdol && (
                                <div className="sm:col-span-4">
                                  <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Transfer Quantity <span className="text-rose-500">*</span>
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    max={remainingAvailable > 0 ? remainingAvailable : undefined}
                                    placeholder="Qty"
                                    value={item.quantity}
                                    onChange={(e) =>
                                      onUpdateTransferItem(item.id, { quantity: e.target.value })
                                    }
                                    className={`w-full px-3 py-2 bg-white border rounded-lg text-xs text-black focus:outline-none focus:border-black transition-[border-color] duration-150 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                      isOverStock ? 'border-rose-400 bg-rose-50/30' : 'border-gray-200'
                                    }`}
                                    required
                                  />
                                  {isOverStock && (
                                    <p className="text-[11px] text-rose-600 font-medium mt-1">
                                      Max available: {remainingAvailable}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Idol Piece Selector */}
                            {isIdol && (
                              <div className="p-3 bg-white border border-gray-200 rounded-lg space-y-2 mt-2">
                                <div className="flex items-center justify-between">
                                  <label className="block text-xs font-medium text-gray-700">
                                    Select piece(s) to transfer <span className="text-rose-500">*</span>
                                  </label>
                                  <span className="text-[11px] text-gray-500 font-medium">
                                    {availablePieces.length} total at source · {(item.pieceWeights || []).length} selected
                                  </span>
                                </div>
                                {availablePieces.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                                    {availablePieces.map((pw, i) => {
                                      const isSelected = (item.pieceWeights || []).includes(pw)
                                      const isUsedElsewhere = piecesUsedInOtherLines.has(pw)

                                      return (
                                        <button
                                          key={`${pw}-${i}`}
                                          type="button"
                                          disabled={isUsedElsewhere}
                                          onClick={() => {
                                            const current = item.pieceWeights || []
                                            const updated = isSelected
                                              ? current.filter((w) => w !== pw)
                                              : [...current, pw]
                                            onUpdateTransferItem(item.id, {
                                              pieceWeights: updated,
                                              quantity: String(updated.length || 1)
                                            })
                                          }}
                                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${
                                            isSelected
                                              ? 'bg-black text-white shadow-xs'
                                              : isUsedElsewhere
                                              ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed opacity-60'
                                              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                                          }`}
                                        >
                                          #{i + 1}: {formatWeight(pw)}
                                          {isUsedElsewhere ? ' (Selected)' : ''}
                                        </button>
                                      )
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-xs text-rose-600 font-medium">
                                    No idol pieces in stock at {locationMap.get(movementLocationId) || 'selected source'}.
                                  </p>
                                )}
                              </div>
                            )}
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Real-time Transfer Route & Flow Preview */}
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg text-xs space-y-2 relative z-10">
                  <div className="flex items-center justify-between text-gray-700 font-medium">
                    <span>Source: <strong className="text-black">{locationMap.get(movementLocationId) || '—'}</strong></span>
                    <span className="text-gray-400">→</span>
                    <span>Destination: <strong className="text-black">{locationMap.get(movementToLocationId) || '—'}</strong></span>
                  </div>
                  <div className="pt-2 border-t border-gray-200 flex items-center justify-between text-[11px]">
                    <span className="text-gray-500">
                      {totalTransferUnits > 0
                        ? `Moving ${totalTransferUnits} total unit${totalTransferUnits === 1 ? '' : 's'} across ${transferItems.filter((it) => it.productId).length} product${transferItems.filter((it) => it.productId).length === 1 ? '' : 's'}`
                        : 'Select products and quantities above'}
                    </span>
                    {totalTransferUnits > 0 && (
                      <span className="font-semibold text-black bg-white px-2 py-0.5 rounded border border-gray-200">
                        {totalTransferUnits} units ready
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Single Product & Location Selector for Audit/Repair/Melt */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Select product <span className="text-rose-500">*</span>
                    </label>
                    <CustomSelect
                      value={movementProductId}
                      onValueChange={setMovementProductId}
                      options={productOptions}
                      placeholder="Select product..."
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-gray-700">
                        Location <span className="text-rose-500">*</span>
                      </label>
                      {isLocationLocked && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                          <Lock className="w-3 h-3 text-gray-500" />
                          Assigned store
                        </span>
                      )}
                    </div>
                    {isLocationLocked ? (
                      <div className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-black flex items-center justify-between">
                        <span className="font-semibold text-black">
                          {locationMap.get(movementLocationId) || adminUser?.assignedLocationName || 'Assigned Location'}
                        </span>
                        <span className="text-xs text-gray-500 font-medium">Default & Locked</span>
                      </div>
                    ) : (
                      <CustomSelect
                        value={movementLocationId}
                        onValueChange={setMovementLocationId}
                        options={movementLocationOptions}
                        placeholder="Select location..."
                      />
                    )}
                  </div>
                </div>

            {movementType === 'adjustment' && (
              <div className="space-y-4">
                {isMovementProductAnIdol ? (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-200">
                      <div>
                        <label className="block text-xs font-medium text-gray-800">
                          Idol piece adjustment mode <span className="text-rose-500">*</span>
                        </label>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Adjust idol stock at {locationMap.get(movementLocationId) || 'selected store'} piece by piece.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setMovementAdjustmentMode('deficit')
                            setMovementQty('-1')
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${
                            movementAdjustmentMode === 'deficit'
                              ? 'bg-black text-white shadow-xs'
                              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          Deficit / Write-off piece (-1)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMovementAdjustmentMode('surplus')
                            setMovementQty('1')
                            setMovementPieceWeight('')
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${
                            movementAdjustmentMode === 'surplus'
                              ? 'bg-black text-white shadow-xs'
                              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          Surplus / Add piece (+1)
                        </button>
                      </div>
                    </div>

                    {!movementAdjustmentMode ? (
                      <div className="p-4 text-center text-xs text-gray-500 bg-white rounded-lg border border-gray-200">
                        Please select Deficit or Surplus mode above.
                      </div>
                    ) : movementAdjustmentMode === 'deficit' ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-700 font-medium">
                            Select piece to write off <span className="text-rose-500">*</span>
                          </span>
                          <span className="text-[11px] text-gray-500 font-medium">
                            {availableMovementPieces.length} available at location
                          </span>
                        </div>
                        {availableMovementPieces.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-white rounded-lg border border-gray-200">
                            {availableMovementPieces.map((pw, i) => (
                              <button
                                key={`${pw}-${i}`}
                                type="button"
                                onClick={() => setMovementPieceWeight(String(pw))}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${
                                  String(movementPieceWeight) === String(pw)
                                    ? 'bg-black text-white shadow-xs'
                                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                                }`}
                              >
                                #{i + 1}: {formatWeight(pw)}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-rose-600 font-medium p-2 bg-rose-50 border border-rose-200 rounded-lg">
                            No idol pieces available at {locationMap.get(movementLocationId) || 'selected store'} to write off.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                          New piece weight (grams) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          placeholder="e.g. 52.350"
                          value={movementPieceWeight}
                          onChange={(e) => setMovementPieceWeight(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                          required
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          Adds an unrecorded or found idol piece directly to {locationMap.get(movementLocationId) || 'this location'}.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">
                        Quantity adjustment (+ or -) <span className="text-rose-500">*</span>
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
                        Positive number for surplus found, or negative for shrinkage / damaged units.
                      </p>
                    </div>

                    <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg text-xs flex flex-col justify-center">
                      <div className="text-gray-500">Current stock: <strong className="text-black">{currentSourceStock} units</strong></div>
                      <div className="mt-1 pt-1 border-t border-gray-200/60 font-medium text-black">
                        New stock: {currentSourceStock + (Number(movementQty) || 0)} units
                        {Number(movementQty) !== 0 && (
                          <span className="ml-1.5 text-[11px] font-normal text-gray-500">
                            ({Number(movementQty) > 0 ? `+${movementQty} surplus` : `${movementQty} deficit`})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {movementType === 'repair' && (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Original weight: <strong>{formatWeight(selectedMovementProduct?.weight)}</strong></span>
                  {movementNewWeight && (
                    <span className="font-semibold text-black">
                      Net change:{' '}
                      {(Number(movementNewWeight) - (selectedMovementProduct?.weight || 0)).toFixed(3)}g
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      New weight (grams) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      placeholder="e.g. 102.500"
                      value={movementNewWeight}
                      onChange={(e) => setMovementNewWeight(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                      required
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Updates physical weight of the product in system inventory.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Repair / labor charge (₹)
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
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
                <div className="p-3 bg-zinc-100/70 border border-zinc-200 rounded-lg text-xs text-zinc-700 flex items-center gap-2">
                  <span className="font-semibold">Notice:</span>
                  <span>Melt decrements physical item count at {locationMap.get(movementLocationId) || 'selected location'} and records recovered pure metal weight.</span>
                </div>

                {/* Idol Piece Selection for Melt */}
                {isMovementProductAnIdol && (
                  <div className="p-3.5 bg-white border border-gray-200 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-medium text-gray-700">
                        Select idol piece to melt <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[11px] text-gray-500 font-medium">
                        {availableMovementPieces.length} available at location
                      </span>
                    </div>
                    {availableMovementPieces.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                        {availableMovementPieces.map((pw, i) => (
                          <button
                            key={`${pw}-${i}`}
                            type="button"
                            onClick={() => setMovementPieceWeight(String(pw))}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${String(movementPieceWeight) === String(pw)
                              ? 'bg-black text-white shadow-xs'
                              : 'bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100'
                              }`}
                          >
                            #{i + 1}: {formatWeight(pw)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-black font-semibold">
                        No idol pieces in stock at {locationMap.get(movementLocationId) || 'selected location'}.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Quantity to melt <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={currentSourceStock > 0 ? currentSourceStock : undefined}
                      disabled={isMovementProductAnIdol}
                      value={isMovementProductAnIdol ? '1' : movementQty}
                      onChange={(e) => setMovementQty(e.target.value)}
                      className={`w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150 ${isMovementProductAnIdol ? 'bg-gray-100 cursor-not-allowed font-semibold' : ''
                        }`}
                      required
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Available to melt at this location: {currentSourceStock} units
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Recovered raw weight (grams)
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="e.g. 98.400"
                      value={movementRecoveredWeight}
                      onChange={(e) => setMovementRecoveredWeight(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                    />
                  </div>
                </div>
              </div>
            )}
              </>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Date <span className="text-rose-500">*</span>
                </label>
                <CustomDatePicker
                  value={movementDate}
                  onChange={setMovementDate}
                  placeholder="Select movement date"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Reason / notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Physical count discrepancy, store stock replenishment"
                  value={movementNotes}
                  onChange={(e) => setMovementNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!isMovementFormValid}
                loading={movementSubmitting}
              >
                {movementType === 'transfer'
                  ? totalTransferUnits > 0
                    ? `Confirm Transfer (${totalTransferUnits} unit${totalTransferUnits === 1 ? '' : 's'})`
                    : 'Confirm Transfer'
                  : `Confirm ${movementType ? movementType.charAt(0).toUpperCase() + movementType.slice(1) : 'Movement'}`}
              </Button>
            </div>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
