"use client"

import React, { useState, useMemo, useEffect } from 'react'
import { X, Lock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { EASE_OUT } from '@/components/motion-transitions'
import { Product, Location, Transaction } from '@/lib/types'
import CustomSelect, { SelectOption } from '@/components/custom-select'
import CustomDatePicker from '@/components/custom-date-picker'
import MoneyInput from '@/components/money-input'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/ui/form-error'
import { recordTransaction } from '@/lib/services/inventory.service'

interface RecordReturnModalProps {
  isOpen: boolean
  onClose: () => void
  products: Product[]
  locations: Location[]
  locationMap: Map<string, string>
  returnLocationOptions: SelectOption[]
  saleProductOptions: SelectOption[]
  isLocationLocked: boolean
  userAssignedLocationId?: string
  adminLocationName?: string
  onReturnRecorded: (createdTx: Transaction, prod: Product, qty: number, effectiveLocId: string, pieceWeight?: number) => void
}

export function RecordReturnModal({
  isOpen,
  onClose,
  products,
  locations,
  locationMap,
  returnLocationOptions,
  saleProductOptions,
  isLocationLocked,
  userAssignedLocationId,
  adminLocationName,
  onReturnRecorded
}: RecordReturnModalProps) {
  const [returnProductId, setReturnProductId] = useState('')
  const [returnLocationId, setReturnLocationId] = useState('')
  const [returnQty, setReturnQty] = useState('')
  const [returnPieceWeight, setReturnPieceWeight] = useState('')
  const [returnPrice, setReturnPrice] = useState('')
  const [returnCustomerName, setReturnCustomerName] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [returnNotes, setReturnNotes] = useState('')
  const [returnSubmitting, setReturnSubmitting] = useState(false)
  const [returnError, setReturnError] = useState<string | null>(null)

  // Reset when opening
  useEffect(() => {
    if (isOpen) {
      setReturnProductId('')
      setReturnLocationId(isLocationLocked && userAssignedLocationId ? userAssignedLocationId : '')
      setReturnQty('')
      setReturnPieceWeight('')
      setReturnPrice('')
      setReturnCustomerName('')
      setReturnDate('')
      setReturnNotes('')
      setReturnError(null)
    }
  }, [isOpen, isLocationLocked, userAssignedLocationId])

  const selectedReturnProduct = useMemo(() => {
    return products.find((p) => p.id === returnProductId)
  }, [products, returnProductId])

  const isReturnProductAnIdol = useMemo(() => {
    return selectedReturnProduct?.category === 'Idols'
  }, [selectedReturnProduct])

  const isReturnFormValid = useMemo(() => {
    const effectiveLocId = isLocationLocked && userAssignedLocationId ? userAssignedLocationId : returnLocationId
    if (!effectiveLocId || !returnProductId.trim() || !returnDate.trim()) return false
    const prod = products.find((p) => p.id === returnProductId)
    if (!prod) return false
    const isIdol = prod.category === 'Idols'
    if (isIdol) {
      const numW = Number(returnPieceWeight)
      if (isNaN(numW) || numW <= 0) return false
    } else {
      const q = Number(returnQty)
      if (isNaN(q) || q <= 0) return false
    }
    if (returnPrice.trim()) {
      const p = Number(returnPrice)
      if (isNaN(p) || p < 0) return false
    }
    return true
  }, [isLocationLocked, userAssignedLocationId, returnLocationId, returnProductId, returnDate, products, returnPieceWeight, returnQty, returnPrice])

  const handleSaveReturn = async (e: React.FormEvent) => {
    e.preventDefault()
    const prod = products.find((p) => p.id === returnProductId)
    if (!prod) {
      setReturnError('Please select a product')
      return
    }
    const effectiveLocId = isLocationLocked && userAssignedLocationId ? userAssignedLocationId : returnLocationId
    if (!effectiveLocId) {
      setReturnError('Please select a location to receive the return')
      return
    }

    if (!returnDate) {
      setReturnError('Please select a return date')
      return
    }

    const isIdol = prod.category === 'Idols'
    if (isIdol) {
      const numW = Number(returnPieceWeight)
      if (isNaN(numW) || numW <= 0) {
        setReturnError('Please enter the returned piece weight in grams')
        return
      }
    }
    const qty = isIdol ? 1 : Number(returnQty)

    if (isNaN(qty) || qty <= 0) {
      setReturnError('Quantity must be at least 1')
      return
    }

    setReturnSubmitting(true)
    setReturnError(null)

    try {
      const locName = locationMap.get(effectiveLocId) || adminLocationName || ''
      const pieceWeightNum = isIdol ? Number(returnPieceWeight) : undefined
      const priceNum = returnPrice ? Number(returnPrice) : undefined

      const { transaction: createdTx } = await recordTransaction({
        type: 'return',
        productId: prod.id,
        productName: prod.name,
        category: prod.category,
        brand: prod.brand,
        metal: prod.metal,
        quantity: qty,
        pieceWeight: pieceWeightNum,
        price: priceNum,
        locationId: effectiveLocId,
        locationName: locName,
        customerName: returnCustomerName,
        date: returnDate,
        notes: returnNotes
      })

      toast.success('Return recorded and restocked successfully')
      onReturnRecorded(createdTx, prod, qty, effectiveLocId, pieceWeightNum)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record return'
      setReturnError(msg)
      toast.error(msg)
    } finally {
      setReturnSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
        className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm"
      >
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-black">Record Customer Return (Restock)</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97]"
          >
            <X size={18} />
          </button>
        </div>

        {returnError && (
          <div className="mb-4">
            <FormError message={returnError} />
          </div>
        )}

        <form onSubmit={handleSaveReturn} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Select Product <span className="text-rose-500">*</span>
              </label>
              <CustomSelect
                value={returnProductId}
                onValueChange={setReturnProductId}
                options={saleProductOptions}
                placeholder="Select product..."
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-gray-700">
                  Restock into Location <span className="text-rose-500">*</span>
                </label>
                {isLocationLocked && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                    <Lock className="w-3 h-3 text-gray-500" />
                    Assigned Store
                  </span>
                )}
              </div>
              {isLocationLocked ? (
                <div className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-black flex items-center justify-between">
                  <span className="font-semibold text-black">
                    {locationMap.get(returnLocationId) || adminLocationName || 'Assigned Location'}
                  </span>
                  <span className="text-xs text-gray-500 font-medium">Default & Locked</span>
                </div>
              ) : (
                <CustomSelect
                  value={returnLocationId}
                  onValueChange={setReturnLocationId}
                  options={returnLocationOptions}
                  placeholder="Select location to restock..."
                />
              )}
            </div>
          </div>

          {/* Idol Piece Weight for Return */}
          {isReturnProductAnIdol && (
            <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
              <label className="block text-xs font-medium text-gray-700">
                Returned Piece Weight (Grams) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                placeholder="e.g. 48.250"
                value={returnPieceWeight}
                onChange={(e) => setReturnPieceWeight(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                required
              />
              <p className="text-xs text-gray-500">
                This weight will be registered back into the idol inventory at the restocked location.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Quantity Returned <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                disabled={isReturnProductAnIdol}
                value={isReturnProductAnIdol ? '1' : returnQty}
                onChange={(e) => setReturnQty(e.target.value)}
                className={`w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150 ${
                  isReturnProductAnIdol ? 'bg-gray-100 cursor-not-allowed font-semibold' : ''
                }`}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Refund Price per Unit (₹)
              </label>
              <MoneyInput
                placeholder="e.g. 78500"
                value={returnPrice}
                onChange={setReturnPrice}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
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
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
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
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
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
            <Button type="button" variant="ghost" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={returnSubmitting || !isReturnFormValid}
              loading={returnSubmitting}
            >
              Accept Return & Add Stock
            </Button>
          </div>
        </form>
      </motion.div>
    </AnimatePresence>
  )
}
