'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Trash2, AlertCircle, CheckCircle2, IndianRupee } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { EASE_OUT } from '@/components/motion-transitions'
import { PaymentMode, OrderPayment } from '@/lib/types'
import { rupeesToPaise, formatINR } from '@/lib/utils/money'
import { gramsToMg } from '@/lib/utils/weight'
import { Button } from '@/components/ui/button'
import CustomSelect, { SelectOption } from '@/components/custom-select'

export interface PaymentRowState {
  id: string
  mode: PaymentMode | ''
  amountRupees: string
  reference: string
  metal: 'Gold' | 'Silver' | ''
  weightGrams: string
  purity: string
}

export interface PaymentSplitProps {
  totalBillPaise?: number
  totalPaise?: number
  payments?: OrderPayment[]
  onChange: (payments: OrderPayment[], isBalanced: boolean) => void
  disabled?: boolean
}

const PAYMENT_MODE_OPTIONS: SelectOption[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'old_metal', label: 'Old Metal Exchange' }
]

export default function PaymentSplit({ totalBillPaise, totalPaise, onChange, disabled = false }: PaymentSplitProps) {
  const billPaise = totalBillPaise ?? totalPaise ?? 0
  const [rows, setRows] = useState<PaymentRowState[]>(() => [
    {
      id: 'pay_init_1',
      mode: '',
      amountRupees: billPaise > 0 ? (billPaise / 100).toFixed(2) : '',
      reference: '',
      metal: '',
      weightGrams: '',
      purity: ''
    }
  ])

  // If totalBillPaise changes and there's only 1 untouched row, synchronize it
  useEffect(() => {
    const timer = setTimeout(() => {
      setRows((prev) => {
        if (prev.length === 1 && !prev[0].reference) {
          const expected = billPaise > 0 ? (billPaise / 100).toFixed(2) : ''
          if (prev[0].amountRupees !== expected) {
            return [
              {
                ...prev[0],
                amountRupees: expected
              }
            ]
          }
        }
        return prev
      })
    }, 0)
    return () => clearTimeout(timer)
  }, [billPaise])

  // Convert row states to OrderPayment[] and calculate totals in paise
  const { payments, totalPaidPaise, isBalanced, remainingPaise } = useMemo(() => {
    let sumPaise = 0
    const list: OrderPayment[] = []
    let allValidModes = true

    for (const r of rows) {
      const amtStr = r.amountRupees.trim()
      let pAmount = 0
      try {
        if (amtStr) pAmount = rupeesToPaise(amtStr)
      } catch {
        pAmount = 0
      }

      if (pAmount > 0) {
        sumPaise += pAmount
        if (!r.mode) {
          allValidModes = false
        } else {
          const item: OrderPayment = {
            mode: r.mode as PaymentMode,
            amountPaise: pAmount,
            reference: r.reference.trim() || undefined
          }

          if (r.mode === 'old_metal') {
            item.metal = (r.metal as 'Gold' | 'Silver') || undefined
            const wNum = parseFloat(r.weightGrams)
            item.weightMg = !isNaN(wNum) && wNum > 0 ? gramsToMg(wNum) : 0
            item.purity = r.purity.trim() || undefined
          }

          list.push(item)
        }
      }
    }

    const diff = billPaise - sumPaise
    const balanced = sumPaise === billPaise && billPaise > 0 && allValidModes && list.length > 0

    return {
      payments: list,
      totalPaidPaise: sumPaise,
      isBalanced: balanced,
      remainingPaise: diff
    }
  }, [rows, billPaise])

  // Notify parent component on changes
  useEffect(() => {
    onChange(payments, isBalanced)
  }, [payments, isBalanced, onChange])

  const handleUpdateRow = useCallback((id: string, updates: Partial<PaymentRowState>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)))
  }, [])

  const handleAddRow = () => {
    const unallocated = Math.max(0, remainingPaise)
    const newId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    setRows((prev) => [
      ...prev,
      {
        id: newId,
        mode: '',
        amountRupees: unallocated > 0 ? (unallocated / 100).toFixed(2) : '',
        reference: '',
        metal: '',
        weightGrams: '',
        purity: ''
      }
    ])
  }

  const handleRemoveRow = (id: string) => {
    if (rows.length <= 1) return
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  const handleFillRemaining = (id: string) => {
    const otherRowsPaid = rows
      .filter((r) => r.id !== id)
      .reduce((sum, r) => {
        try {
          return sum + rupeesToPaise(r.amountRupees)
        } catch {
          return sum
        }
      }, 0)
    const neededPaise = Math.max(0, billPaise - otherRowsPaid)
    handleUpdateRow(id, { amountRupees: (neededPaise / 100).toFixed(2) })
  }

  return (
    <div className="space-y-3 pt-3 border-t border-gray-200">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
          <IndianRupee className="w-3.5 h-3.5 text-black" />
          <span>Payment Split</span>
        </label>

        {/* Live balance badge */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-gray-500 text-[11px]">Paid: {formatINR(totalPaidPaise)}</span>
          {isBalanced ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Paid in full
            </span>
          ) : billPaise === 0 && totalPaidPaise === 0 ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-500 font-medium">
              Awaiting items
            </span>
          ) : remainingPaise > 0 ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-medium">
              <AlertCircle className="w-3 h-3" />
              Remaining: {formatINR(remainingPaise)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 font-medium">
              <AlertCircle className="w-3 h-3" />
              Overpaid: {formatINR(Math.abs(remainingPaise))}
            </span>
          )}
        </div>
      </div>

      {/* Payment Rows */}
      <div className="space-y-2.5">
        <AnimatePresence initial={false}>
          {rows.map((row, idx) => (
            <motion.div
              key={row.id}
              style={{ zIndex: rows.length - idx }}
              initial={{ opacity: 0, transform: 'scale(0.98) translateY(4px)' }}
              animate={{ opacity: 1, transform: 'scale(1) translateY(0px)' }}
              exit={{ opacity: 0, transform: 'scale(0.98) translateY(-4px)' }}
              transition={{ duration: 0.15, ease: EASE_OUT }}
              className="p-3.5 bg-gray-50/70 border border-gray-200 rounded-xl space-y-2.5 transition-[border-color] duration-150 relative"
            >
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                {/* Payment Mode Selector */}
                <div className="sm:col-span-3">
                  <CustomSelect
                    value={row.mode}
                    disabled={disabled}
                    onValueChange={(val) => handleUpdateRow(row.id, { mode: val as PaymentMode })}
                    options={PAYMENT_MODE_OPTIONS}
                    placeholder="Select method..."
                  />
                </div>

                {/* Amount Input */}
                <div className="sm:col-span-4 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono pointer-events-none">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={disabled}
                    value={row.amountRupees}
                    onChange={(e) => handleUpdateRow(row.id, { amountRupees: e.target.value })}
                    placeholder="0.00"
                    className="w-full h-10 pl-7 pr-12 bg-white border border-gray-200 rounded-lg text-sm font-mono text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 transition-[border-color,box-shadow] duration-150 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  {remainingPaise > 0 && !disabled && (
                    <button
                      type="button"
                      onClick={() => handleFillRemaining(row.id)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-[11px] font-semibold text-black bg-gray-100 hover:bg-gray-200 transition-colors font-mono"
                      title="Fill remaining balance into this mode"
                    >
                      Fill
                    </button>
                  )}
                </div>

                {/* Reference / Details */}
                <div className="sm:col-span-4">
                  <input
                    type="text"
                    disabled={disabled}
                    value={row.reference}
                    onChange={(e) => handleUpdateRow(row.id, { reference: e.target.value })}
                    placeholder={
                      row.mode === 'cash'
                        ? 'Notes (optional)'
                        : row.mode === 'upi'
                          ? 'UPI Ref / UTR #'
                          : row.mode === 'card'
                            ? 'Card last 4 / Auth #'
                            : row.mode === 'bank'
                              ? 'IMPS/NEFT Ref #'
                              : 'Exchange reference'
                    }
                    className="w-full h-10 px-3.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 transition-[border-color,box-shadow] duration-150"
                  />
                </div>

                {/* Actions: Fill / Delete */}
                <div className="sm:col-span-1 flex items-center justify-end">
                  {rows.length > 1 && !disabled && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(row.id)}
                      className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                      title="Remove payment mode"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Old Metal Additional Fields */}
              {row.mode === 'old_metal' && (
                <div className="pt-2.5 border-t border-gray-200/60 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Metal *</label>
                    <CustomSelect
                      size="sm"
                      value={row.metal}
                      disabled={disabled}
                      onValueChange={(val) => handleUpdateRow(row.id, { metal: val as 'Gold' | 'Silver' })}
                      options={[
                        { value: 'Gold', label: 'Gold' },
                        { value: 'Silver', label: 'Silver' }
                      ]}
                      placeholder="Select metal..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Weight (g, 3 decimals) *</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      disabled={disabled}
                      value={row.weightGrams}
                      onChange={(e) => handleUpdateRow(row.id, { weightGrams: e.target.value })}
                      placeholder="e.g. 5.250"
                      className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-lg text-xs font-mono text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black/10 transition-[border-color,box-shadow] duration-150 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Purity *</label>
                    <input
                      type="text"
                      disabled={disabled}
                      value={row.purity}
                      onChange={(e) => handleUpdateRow(row.id, { purity: e.target.value })}
                      placeholder="e.g. 916 / 22K"
                      className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-lg text-xs font-mono text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black/10 transition-[border-color,box-shadow] duration-150"
                    />
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Add Row Button - styled identically to Add Another Item */}
      {!disabled && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<Plus size={13} />}
          onClick={handleAddRow}
        >
          Add payment method
        </Button>
      )}
    </div>
  )
}
