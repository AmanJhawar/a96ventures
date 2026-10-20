'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Trash2, AlertCircle, CheckCircle2, IndianRupee } from 'lucide-react'
import { PaymentMode, OrderPayment } from '@/lib/types'
import { rupeesToPaise, formatINR } from '@/lib/utils/money'
import { gramsToMg } from '@/lib/utils/weight'

export interface PaymentRowState {
  id: string
  mode: PaymentMode
  amountRupees: string
  reference: string
  metal: 'Gold' | 'Silver'
  weightGrams: string
  purity: string
}

export interface PaymentSplitProps {
  totalBillPaise: number
  onChange: (payments: OrderPayment[], isBalanced: boolean) => void
  disabled?: boolean
}

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'old_metal', label: 'Old metal' }
]

export default function PaymentSplit({ totalBillPaise, onChange, disabled = false }: PaymentSplitProps) {
  const [rows, setRows] = useState<PaymentRowState[]>(() => [
    {
      id: 'pay_init_1',
      mode: 'cash',
      amountRupees: (totalBillPaise / 100).toFixed(2),
      reference: '',
      metal: 'Gold',
      weightGrams: '',
      purity: '916'
    }
  ])

  // If totalBillPaise changes and there's only 1 untouched cash row, synchronize it
  useEffect(() => {
    const timer = setTimeout(() => {
      setRows((prev) => {
        if (prev.length === 1 && prev[0].mode === 'cash' && !prev[0].reference) {
          const expected = (totalBillPaise / 100).toFixed(2)
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
  }, [totalBillPaise])

  // Convert row states to OrderPayment[] and calculate totals in paise
  const { payments, totalPaidPaise, isBalanced, remainingPaise } = useMemo(() => {
    let sumPaise = 0
    const list: OrderPayment[] = []

    for (const r of rows) {
      const amtStr = r.amountRupees.trim()
      let pAmount = 0
      try {
        if (amtStr) pAmount = rupeesToPaise(amtStr)
      } catch {
        pAmount = 0
      }

      sumPaise += pAmount

      const item: OrderPayment = {
        mode: r.mode,
        amountPaise: pAmount,
        reference: r.reference.trim() || undefined
      }

      if (r.mode === 'old_metal') {
        item.metal = r.metal
        const wNum = parseFloat(r.weightGrams)
        item.weightMg = !isNaN(wNum) && wNum > 0 ? gramsToMg(wNum) : 0
        item.purity = r.purity.trim() || '916'
      }

      list.push(item)
    }

    const diff = totalBillPaise - sumPaise
    const balanced = sumPaise === totalBillPaise && totalBillPaise > 0

    return {
      payments: list,
      totalPaidPaise: sumPaise,
      isBalanced: balanced,
      remainingPaise: diff
    }
  }, [rows, totalBillPaise])

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
        mode: 'upi',
        amountRupees: unallocated > 0 ? (unallocated / 100).toFixed(2) : '0.00',
        reference: '',
        metal: 'Gold',
        weightGrams: '',
        purity: '916'
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
    const neededPaise = Math.max(0, totalBillPaise - otherRowsPaid)
    handleUpdateRow(id, { amountRupees: (neededPaise / 100).toFixed(2) })
  }

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <IndianRupee className="w-3.5 h-3.5 text-primary" />
          <span>Payment Split</span>
        </label>

        {/* Live balance badge */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-muted-foreground text-[11px]">Paid: {formatINR(totalPaidPaise)}</span>
          {isBalanced ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Paid in full: ₹0.00
            </span>
          ) : remainingPaise > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-medium">
              <AlertCircle className="w-3 h-3" />
              Remaining: {formatINR(remainingPaise)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 font-medium">
              <AlertCircle className="w-3 h-3" />
              Overpaid: {formatINR(Math.abs(remainingPaise))}
            </span>
          )}
        </div>
      </div>

      {/* Payment Rows */}
      <div className="space-y-2.5">
        {rows.map((row) => (
          <div
            key={row.id}
            className="p-3 bg-secondary/30 border border-border/80 rounded-lg space-y-2 transition-[border-color] duration-150"
          >
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              {/* Payment Mode Selector */}
              <div className="sm:col-span-3">
                <select
                  value={row.mode}
                  disabled={disabled}
                  onChange={(e) => handleUpdateRow(row.id, { mode: e.target.value as PaymentMode })}
                  className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount Input */}
              <div className="sm:col-span-4 relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">
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
                  className="w-full pl-6 pr-12 py-1.5 bg-background border border-border rounded-lg text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {remainingPaise > 0 && !disabled && (
                  <button
                    type="button"
                    onClick={() => handleFillRemaining(row.id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-primary hover:underline font-mono"
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
                  className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Actions: Fill / Delete */}
              <div className="sm:col-span-1 flex items-center justify-end gap-1">
                {rows.length > 1 && !disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(row.id)}
                    className="p-1.5 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded transition-[color,background-color] duration-150"
                    title="Remove payment mode"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Old Metal Additional Fields */}
            {row.mode === 'old_metal' && (
              <div className="pt-2 border-t border-border/40 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Metal *</label>
                  <select
                    value={row.metal}
                    disabled={disabled}
                    onChange={(e) => handleUpdateRow(row.id, { metal: e.target.value as 'Gold' | 'Silver' })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="Gold">Gold</option>
                    <option value="Silver">Silver</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Weight (g, 3 decimals) *</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    disabled={disabled}
                    value={row.weightGrams}
                    onChange={(e) => handleUpdateRow(row.id, { weightGrams: e.target.value })}
                    placeholder="e.g. 5.250"
                    className="w-full px-2 py-1 bg-background border border-border rounded text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Purity *</label>
                  <input
                    type="text"
                    disabled={disabled}
                    value={row.purity}
                    onChange={(e) => handleUpdateRow(row.id, { purity: e.target.value })}
                    placeholder="e.g. 916 / 22K"
                    className="w-full px-2 py-1 bg-background border border-border rounded text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Row Button */}
      {!disabled && (
        <button
          type="button"
          onClick={handleAddRow}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border hover:bg-secondary/60 text-xs font-medium text-foreground transition-[background-color,transform] duration-150 active:scale-[0.97]"
        >
          <Plus className="w-3.5 h-3.5 text-primary" />
          <span>Add payment method</span>
        </button>
      )}
    </div>
  )
}
