"use client"

import React, { useState, useMemo, useEffect } from 'react'
import { Plus, X, Lock, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { EASE_OUT } from '@/components/motion-transitions'
import { Product, Location, Customer, Order, OrderPayment, PaymentMode } from '@/lib/types'
import { SaleLineItem } from './types'
import CustomerPicker from '@/components/customer-picker'
import MoneyInput from '@/components/money-input'
import CustomSelect, { SelectOption } from '@/components/custom-select'
import CustomDatePicker from '@/components/custom-date-picker'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/ui/form-error'
import { rupeesToPaise } from '@/lib/utils/money'
import { gramsToMg, formatWeight } from '@/lib/utils/weight'
import { createOrder } from '@/lib/services/orders.service'

export interface ValidatedSaleItem {
  prod: Product
  qty: number
  price: number
  pieceWeight?: number
}

interface RecordSaleModalProps {
  isOpen: boolean
  onClose: () => void
  products: Product[]
  locations: Location[]
  locationMap: Map<string, string>
  saleLocationOptions: SelectOption[]
  saleProductOptions: SelectOption[]
  isLocationLocked: boolean
  userAssignedLocationId?: string
  adminLocationName?: string
  onSaleRecorded: (order: Order, validatedItems: ValidatedSaleItem[]) => void
}

export function RecordSaleModal({
  isOpen,
  onClose,
  products,
  locations,
  locationMap,
  saleLocationOptions,
  saleProductOptions,
  isLocationLocked,
  userAssignedLocationId,
  adminLocationName,
  onSaleRecorded
}: RecordSaleModalProps) {
  const [saleLocationId, setSaleLocationId] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [isWalkInCustomer, setIsWalkInCustomer] = useState(false)
  const [salePaymentMode, setSalePaymentMode] = useState<PaymentMode>('cash')
  const [salePaymentReference, setSalePaymentReference] = useState('')
  const [saleOldMetal, setSaleOldMetal] = useState<'Gold' | 'Silver'>('Gold')
  const [saleOldMetalWeight, setSaleOldMetalWeight] = useState('')
  const [saleOldMetalPurity, setSaleOldMetalPurity] = useState('')
  const [saleDate, setSaleDate] = useState('')
  const [saleNotes, setSaleNotes] = useState('')
  const [saleItems, setSaleItems] = useState<SaleLineItem[]>([
    { id: '1', productId: '', quantity: '', price: '', pieceWeight: '' }
  ])
  const [saleSubmitting, setSaleSubmitting] = useState(false)
  const [saleError, setSaleError] = useState<string | null>(null)

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSaleLocationId(isLocationLocked && userAssignedLocationId ? userAssignedLocationId : '')
      setSelectedCustomer(null)
      setIsWalkInCustomer(false)
      setSalePaymentMode('cash')
      setSalePaymentReference('')
      setSaleOldMetal('Gold')
      setSaleOldMetalWeight('')
      setSaleOldMetalPurity('')
      setSaleDate('')
      setSaleNotes('')
      setSaleError(null)
      setSaleItems([
        {
          id: String(Date.now()),
          productId: '',
          quantity: '',
          price: '',
          pieceWeight: ''
        }
      ])
    }
  }, [isOpen, isLocationLocked, userAssignedLocationId])

  const handleAddSaleItem = () => {
    setSaleItems((prev) => [
      ...prev,
      {
        id: String(Date.now() + Math.random()),
        productId: '',
        quantity: '',
        price: '',
        pieceWeight: ''
      }
    ])
  }

  const handleRemoveSaleItem = (id: string) => {
    setSaleItems((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((item) => item.id !== id)
    })
  }

  const handleUpdateSaleItem = (id: string, updates: Partial<SaleLineItem>) => {
    setSaleItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const updated = { ...item, ...updates }
        if (updates.productId && updates.productId !== item.productId) {
          const newProd = products.find((p) => p.id === updates.productId)
          const isIdol = newProd?.category === 'Idols'
          updated.pieceWeight = ''
          updated.quantity = isIdol ? '1' : ''
        }
        return updated
      })
    )
  }

  const saleTotals = useMemo(() => {
    let totalUnits = 0
    let totalWeightGrams = 0
    let grandTotal = 0

    saleItems.forEach((item) => {
      const prod = products.find((p) => p.id === item.productId)
      const qty = Number(item.quantity) || 0
      const price = Number(String(item.price || '').replace(/,/g, '')) || 0
      totalUnits += qty
      grandTotal += qty * price

      if (prod) {
        if (prod.category === 'Idols' && item.pieceWeight) {
          totalWeightGrams += Number(item.pieceWeight) || 0
        } else if (prod.weight) {
          totalWeightGrams += prod.weight * qty
        }
      }
    })

    return { totalUnits, totalWeightGrams, grandTotal }
  }, [saleItems, products])

  const saleTotalsPaise = useMemo(() => {
    return rupeesToPaise(saleTotals.grandTotal)
  }, [saleTotals.grandTotal])

  const isSaleFormValid = useMemo(() => {
    const effectiveLocId = isLocationLocked && userAssignedLocationId ? userAssignedLocationId : saleLocationId
    if (!effectiveLocId || !saleDate.trim() || saleItems.length === 0) return false
    if (!selectedCustomer && !isWalkInCustomer) return false
    if (!salePaymentMode) return false
    if (salePaymentMode === 'old_metal') {
      const w = Number(saleOldMetalWeight)
      if (isNaN(w) || w <= 0 || !saleOldMetalPurity.trim()) return false
    }

    const requiredStockPerProduct: Record<string, number> = {}
    const chosenPiecesPerProduct: Record<string, Set<number>> = {}

    for (const item of saleItems) {
      if (!item.productId.trim()) return false
      const prod = products.find((p) => p.id === item.productId)
      if (!prod) return false

      const isIdol = prod.category === 'Idols'
      if (isIdol && !item.pieceWeight) return false

      const qty = isIdol ? 1 : Number(item.quantity)
      if (isNaN(qty) || qty <= 0) return false

      const unitPrice = Number(String(item.price || '').replace(/,/g, ''))
      if (isNaN(unitPrice) || unitPrice <= 0) return false

      if (isIdol && item.pieceWeight) {
        const pw = Number(item.pieceWeight)
        if (!chosenPiecesPerProduct[prod.id]) {
          chosenPiecesPerProduct[prod.id] = new Set()
        }
        if (chosenPiecesPerProduct[prod.id].has(pw)) return false
        chosenPiecesPerProduct[prod.id].add(pw)
      }

      requiredStockPerProduct[prod.id] = (requiredStockPerProduct[prod.id] || 0) + qty
      const available = prod.stockByLocation?.[effectiveLocId] || 0
      if (requiredStockPerProduct[prod.id] > available) return false
    }

    return true
  }, [
    isLocationLocked,
    userAssignedLocationId,
    saleLocationId,
    saleDate,
    saleItems,
    products,
    selectedCustomer,
    isWalkInCustomer,
    salePaymentMode,
    saleOldMetalWeight,
    saleOldMetalPurity
  ])

  const handleSaveSale = async (e: React.FormEvent) => {
    e.preventDefault()
    const effectiveLocId = isLocationLocked && userAssignedLocationId ? userAssignedLocationId : saleLocationId
    if (!effectiveLocId) {
      setSaleError('Please select a selling location')
      return
    }

    if (!saleDate) {
      setSaleError('Please select a sale date')
      return
    }

    if (saleItems.length === 0) {
      setSaleError('Please add at least one item to the sale')
      return
    }

    // Validate each line item
    const validatedItems: ValidatedSaleItem[] = []
    const requiredStockPerProduct: Record<string, number> = {}
    const chosenPiecesPerProduct: Record<string, Set<number>> = {}

    for (let i = 0; i < saleItems.length; i++) {
      const item = saleItems[i]
      const itemNum = i + 1
      const prod = products.find((p) => p.id === item.productId)
      if (!prod) {
        setSaleError(`Item #${itemNum}: Please select a valid product`)
        return
      }

      const isIdol = prod.category === 'Idols'
      if (isIdol && !item.pieceWeight) {
        setSaleError(`Item #${itemNum} (${prod.name}): Please select which piece weight is being sold`)
        return
      }

      const qty = isIdol ? 1 : Number(item.quantity)
      if (isNaN(qty) || qty <= 0) {
        setSaleError(`Item #${itemNum} (${prod.name}): Quantity must be at least 1`)
        return
      }

      const unitPrice = Number(String(item.price || '').replace(/,/g, ''))
      if (isNaN(unitPrice) || unitPrice <= 0) {
        setSaleError(`Item #${itemNum} (${prod.name}): Selling price per unit is required and must be greater than ₹0`)
        return
      }

      if (isIdol && item.pieceWeight) {
        const pw = Number(item.pieceWeight)
        if (!chosenPiecesPerProduct[prod.id]) {
          chosenPiecesPerProduct[prod.id] = new Set()
        }
        if (chosenPiecesPerProduct[prod.id].has(pw)) {
          setSaleError(`Item #${itemNum}: Piece weight ${formatWeight(pw)} is already selected in another row`)
          return
        }
        chosenPiecesPerProduct[prod.id].add(pw)
      }

      requiredStockPerProduct[prod.id] = (requiredStockPerProduct[prod.id] || 0) + qty
      const available = prod.stockByLocation?.[effectiveLocId] || 0
      if (requiredStockPerProduct[prod.id] > available) {
        setSaleError(
          `Insufficient stock for "${prod.name}" at this location. Available: ${available}, Total in sale: ${requiredStockPerProduct[prod.id]}`
        )
        return
      }

      validatedItems.push({
        prod,
        qty,
        price: unitPrice,
        pieceWeight: isIdol && item.pieceWeight ? Number(item.pieceWeight) : undefined
      })
    }

    setSaleSubmitting(true)
    setSaleError(null)

    try {
      if (!selectedCustomer && !isWalkInCustomer) {
        setSaleError('Please select a customer or choose Walk-in customer')
        return
      }
      if (!salePaymentMode) {
        setSaleError('Please select a payment method')
        return
      }
      if (salePaymentMode === 'old_metal') {
        const w = Number(saleOldMetalWeight)
        if (isNaN(w) || w <= 0 || !saleOldMetalPurity.trim()) {
          setSaleError('Please provide valid metal, weight in grams, and purity for old metal exchange')
          return
        }
      }

      const singlePayment: OrderPayment = {
        mode: salePaymentMode,
        amountPaise: saleTotalsPaise,
        reference: salePaymentReference.trim() || undefined
      }
      if (salePaymentMode === 'old_metal') {
        singlePayment.metal = saleOldMetal
        singlePayment.weightMg = gramsToMg(Number(saleOldMetalWeight))
        singlePayment.purity = saleOldMetalPurity.trim()
      }

      const payload = {
        type: 'sale' as const,
        customerId: selectedCustomer ? selectedCustomer.id : undefined,
        locationId: effectiveLocId,
        date: saleDate,
        lines: validatedItems.map((it) => ({
          productId: it.prod.id,
          qty: it.qty,
          pieceWeightMg: it.pieceWeight ? gramsToMg(it.pieceWeight) : undefined,
          unitPricePaise: rupeesToPaise(it.price)
        })),
        payments: [singlePayment],
        notes: saleNotes.trim() || undefined
      }

      const data = await createOrder(payload)
      const createdOrder: Order = data.order

      toast.success(`Bill ${createdOrder.orderNo} recorded successfully`)
      onSaleRecorded(createdOrder, validatedItems)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record sale'
      setSaleError(msg)
      toast.error(msg)
    } finally {
      setSaleSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.18, ease: EASE_OUT }}
        className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm"
      >
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-black">Record Customer Sale</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
              {saleItems.length} {saleItems.length === 1 ? 'item' : 'items'}
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

        {saleError && (
          <div className="mb-4">
            <FormError message={saleError} />
          </div>
        )}

        <form onSubmit={handleSaveSale} className="space-y-5">
          {/* Common Sale Metadata Header */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50/70 border border-gray-200 rounded-xl items-start relative z-30">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-gray-700">
                  Selling Location <span className="text-rose-500">*</span>
                </label>
                {isLocationLocked && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                    <Lock className="w-2.5 h-2.5 text-gray-500" />
                    Locked
                  </span>
                )}
              </div>
              {isLocationLocked ? (
                <div className="h-10 px-3.5 bg-gray-100 border border-gray-200 rounded-lg text-sm font-medium text-black flex items-center">
                  {locationMap.get(saleLocationId) || adminLocationName || 'Assigned Location'}
                </div>
              ) : (
                <CustomSelect
                  value={saleLocationId}
                  onValueChange={setSaleLocationId}
                  options={saleLocationOptions}
                  placeholder="Select location..."
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Sale Date <span className="text-rose-500">*</span>
              </label>
              <CustomDatePicker
                value={saleDate}
                onChange={setSaleDate}
                placeholder="Select sale date..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Customer <span className="text-rose-500">*</span>
              </label>
              <CustomerPicker
                selectedCustomer={selectedCustomer}
                isWalkIn={isWalkInCustomer}
                onSelectCustomer={(cust) => {
                  setSelectedCustomer(cust)
                  if (cust) {
                    setIsWalkInCustomer(false)
                  }
                }}
                onSelectWalkIn={() => {
                  setIsWalkInCustomer(true)
                  setSelectedCustomer(null)
                }}
                onClear={() => {
                  setSelectedCustomer(null)
                  setIsWalkInCustomer(false)
                }}
                disabled={saleSubmitting}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Invoice / Notes
              </label>
              <input
                type="text"
                placeholder="e.g. Tax Invoice #INV-001"
                value={saleNotes}
                onChange={(e) => setSaleNotes(e.target.value)}
                className="h-10 w-full px-3.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 transition-[border-color,box-shadow] duration-150"
              />
            </div>
          </div>

          {/* Line Items List */}
          <div className="space-y-3 relative z-20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">
                Items to Sell ({saleItems.length})
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<Plus size={13} />}
                onClick={handleAddSaleItem}
              >
                Add Another Item
              </Button>
            </div>

            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {saleItems.map((item, idx) => {
                  const prod = products.find((p) => p.id === item.productId)
                  const isIdol = prod?.category === 'Idols'
                  const availableInStore = prod?.stockByLocation?.[saleLocationId] || 0
                  const usedInOtherLines = saleItems
                    .filter((other) => other.id !== item.id && other.productId === item.productId)
                    .reduce((sum, other) => sum + (Number(other.quantity) || 0), 0)
                  const availableForThisLine = Math.max(0, availableInStore - usedInOtherLines)

                  const locPieces = prod?.pieceWeightsByLocation?.[saleLocationId] || []
                  const chosenInOtherLines = new Set(
                    saleItems
                      .filter((other) => other.id !== item.id && other.productId === item.productId && other.pieceWeight)
                      .map((other) => Number(other.pieceWeight))
                  )
                  const availableLinePieces = locPieces.filter((pw) => !chosenInOtherLines.has(pw))
                  const lineTotal = (Number(item.price) || 0) * (Number(item.quantity) || 0)

                  return (
                    <motion.div
                      key={item.id}
                      style={{ zIndex: 50 - idx }}
                      initial={{ opacity: 0, scale: 0.98, y: 6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98, y: -6 }}
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
                            <span className="text-[11px] font-mono text-gray-500">
                              ({prod.category} · {prod.metal || 'Silver'})
                            </span>
                          )}
                        </div>

                        {saleItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSaleItem(item.id)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                            title="Remove item"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                        <div className="sm:col-span-6">
                          <label className="block text-xs font-medium text-gray-700 mb-1.5">
                            Product <span className="text-rose-500">*</span>
                          </label>
                          <CustomSelect
                            value={item.productId}
                            onValueChange={(val) => handleUpdateSaleItem(item.id, { productId: val })}
                            options={saleProductOptions}
                            placeholder="Select product..."
                          />
                          <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                            <span>Available in store:</span>
                            {prod ? (
                              <strong className={availableForThisLine > 0 ? 'text-black' : 'text-rose-600'}>
                                {availableForThisLine} units
                              </strong>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1.5">
                            Qty <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            max={Math.max(1, availableForThisLine)}
                            disabled={isIdol}
                            placeholder={isIdol ? '1' : 'Qty'}
                            value={isIdol ? '1' : item.quantity}
                            onChange={(e) => handleUpdateSaleItem(item.id, { quantity: e.target.value })}
                            className={`h-10 w-full px-3.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 transition-[border-color,box-shadow] duration-150 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                              isIdol ? 'bg-gray-100 cursor-not-allowed font-semibold' : ''
                            }`}
                            required
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1.5">
                            Unit Price (₹) <span className="text-rose-500">*</span>
                          </label>
                          <MoneyInput
                            placeholder="e.g. 78500"
                            value={item.price}
                            onChange={(val) => handleUpdateSaleItem(item.id, { price: val })}
                            required
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1.5">
                            Total
                          </label>
                          <div className="h-10 px-3.5 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-end font-mono font-bold text-sm tabular-nums">
                            {lineTotal > 0 ? (
                              <span className="text-black font-semibold font-mono">₹{lineTotal.toLocaleString('en-IN')}</span>
                            ) : (
                              <span className="text-gray-400 font-medium font-mono">₹0</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Idol piece weight selector */}
                      {isIdol && (
                        <div className="pt-2 border-t border-gray-200/60">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-gray-700">
                              Select Piece Weight <span className="text-rose-500">*</span>
                            </span>
                            <span className="text-xs text-gray-500">
                              {availableLinePieces.length} available
                            </span>
                          </div>
                          {availableLinePieces.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                              {availableLinePieces.map((pw, i) => (
                                <button
                                  key={`${pw}-${i}`}
                                  type="button"
                                  onClick={() => handleUpdateSaleItem(item.id, { pieceWeight: String(pw) })}
                                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${
                                    String(item.pieceWeight) === String(pw)
                                      ? 'bg-black text-white shadow-xs'
                                      : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                                  }`}
                                >
                                  #{i + 1}: {formatWeight(pw)}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-rose-600 font-semibold">
                              No available idol pieces in stock at this location.
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

          {/* Payment Method */}
          <div className="pt-2 relative z-10 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Payment Method <span className="text-rose-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {([
                  { id: 'cash', label: 'Cash' },
                  { id: 'upi', label: 'UPI' },
                  { id: 'card', label: 'Card' },
                  { id: 'bank', label: 'Bank Transfer' },
                  { id: 'old_metal', label: 'Old Metal Exchange' }
                ] as const).map((opt) => {
                  const isSelected = salePaymentMode === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={saleSubmitting}
                      onClick={() => setSalePaymentMode(opt.id)}
                      className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] cursor-pointer ${
                        isSelected
                          ? 'bg-black text-white border-black shadow-sm'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Reference / Transaction ID for electronic payments */}
            {(salePaymentMode === 'upi' || salePaymentMode === 'card' || salePaymentMode === 'bank') && (
              <div className="p-3 bg-gray-50/70 border border-gray-200 rounded-xl space-y-2">
                <label className="block text-xs font-medium text-gray-700">
                  Reference / Transaction ID <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  disabled={saleSubmitting}
                  placeholder={
                    salePaymentMode === 'upi'
                      ? 'e.g. UPI Ref / UTR #'
                      : salePaymentMode === 'card'
                      ? 'e.g. Card Auth / Approval code'
                      : 'e.g. NEFT / RTGS / IMPS Ref #'
                  }
                  value={salePaymentReference}
                  onChange={(e) => setSalePaymentReference(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-gray-200 rounded-lg text-xs font-mono text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black/10 transition-[border-color,box-shadow] duration-150"
                />
              </div>
            )}

            {/* Old Metal Exchange details */}
            {salePaymentMode === 'old_metal' && (
              <div className="p-3.5 bg-gray-50/70 border border-gray-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-800">Old Metal Exchange Details</span>
                  <span className="text-[11px] text-gray-500">
                    Value covers total ₹{saleTotals.grandTotal.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Metal <span className="text-rose-500">*</span>
                    </label>
                    <CustomSelect
                      size="sm"
                      value={saleOldMetal}
                      disabled={saleSubmitting}
                      onValueChange={(val) => setSaleOldMetal(val as 'Gold' | 'Silver')}
                      options={[
                        { value: 'Gold', label: 'Gold' },
                        { value: 'Silver', label: 'Silver' }
                      ]}
                      placeholder="Select metal..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Weight (g, 3 decimals) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      disabled={saleSubmitting}
                      value={saleOldMetalWeight}
                      onChange={(e) => setSaleOldMetalWeight(e.target.value)}
                      placeholder="e.g. 5.250"
                      className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-lg text-xs font-mono text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black/10 transition-[border-color,box-shadow] duration-150 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Purity <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      disabled={saleSubmitting}
                      value={saleOldMetalPurity}
                      onChange={(e) => setSaleOldMetalPurity(e.target.value)}
                      placeholder="e.g. 916 / 22K"
                      className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-lg text-xs font-mono text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black/10 transition-[border-color,box-shadow] duration-150"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Order Summary Footer */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-0">
            <div className="flex items-center gap-6 divide-x divide-gray-200 text-xs">
              <div>
                <span className="text-gray-500 block">Total Items</span>
                <span className="font-bold text-sm text-black tabular-nums">
                  {saleItems.length} {saleItems.length === 1 ? 'item' : 'items'} ({saleTotals.totalUnits} units)
                </span>
              </div>
              {saleTotals.totalWeightGrams > 0 && (
                <div className="pl-6">
                  <span className="text-gray-500 block">Total Weight</span>
                  <span className="font-bold text-sm text-black tabular-nums">
                    {formatWeight(saleTotals.totalWeightGrams)}
                  </span>
                </div>
              )}
              <div className="pl-6">
                <span className="text-gray-500 block">Grand Total</span>
                <span className="font-extrabold text-base text-black font-mono tabular-nums">
                  ₹{saleTotals.grandTotal.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={saleSubmitting || !isSaleFormValid}
                loading={saleSubmitting}
              >
                Record Sale ({saleItems.length} {saleItems.length === 1 ? 'item' : 'items'})
              </Button>
            </div>
          </div>
        </form>
      </motion.div>
    </AnimatePresence>
  )
}
