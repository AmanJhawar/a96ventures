"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { EASE_OUT } from '@/components/motion-transitions'
import { Transaction } from '@/lib/types'
import CustomSelect, { SelectOption } from '@/components/custom-select'
import CustomDatePicker from '@/components/custom-date-picker'
import MoneyInput from '@/components/money-input'
import { getTodayIST } from '@/lib/utils/date'
import { updateTransaction } from '@/lib/services/inventory.service'

interface EditSaleModalProps {
  editingSale: Transaction | null
  onClose: () => void
  saleLocationOptions: SelectOption[]
  locationMap: Map<string, string>
  onSaleUpdated: (
    updatedTx: Transaction,
    oldQty: number,
    oldPrice: number,
    newQty: number,
    newPrice: number,
    oldLoc: string,
    newLoc: string
  ) => void
}

export function EditSaleModal({
  editingSale,
  onClose,
  saleLocationOptions,
  locationMap,
  onSaleUpdated
}: EditSaleModalProps) {
  const [editSaleDate, setEditSaleDate] = useState('')
  const [editSaleLocationId, setEditSaleLocationId] = useState('')
  const [editSaleQuantity, setEditSaleQuantity] = useState('')
  const [editSalePrice, setEditSalePrice] = useState('')
  const [editSaleCustomerName, setEditSaleCustomerName] = useState('')
  const [editSaleNotes, setEditSaleNotes] = useState('')
  const [editSaleSubmitting, setEditSaleSubmitting] = useState(false)
  const [editSaleError, setEditSaleError] = useState<string | null>(null)

  useEffect(() => {
    if (editingSale) {
      setEditSaleDate(editingSale.date || getTodayIST())
      setEditSaleLocationId(editingSale.locationId || '')
      setEditSaleQuantity(String(editingSale.quantity || 1))
      setEditSalePrice(editingSale.price !== undefined ? String(editingSale.price) : '')
      setEditSaleCustomerName(editingSale.customerName || '')
      setEditSaleNotes(editingSale.notes || '')
      setEditSaleError(null)
    }
  }, [editingSale])

  const isEditSaleValid = useMemo(() => {
    if (!editSaleDate.trim() || !editSaleLocationId.trim() || !editSalePrice.trim()) return false
    const q = Number(editSaleQuantity)
    if (isNaN(q) || q < 1) return false
    const p = Number(editSalePrice)
    if (isNaN(p) || p < 0) return false
    return true
  }, [editSaleDate, editSaleLocationId, editSaleQuantity, editSalePrice])

  const handleSaveEditSale = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSale) return

    const qty = Number(editSaleQuantity)
    if (isNaN(qty) || qty < 1) {
      setEditSaleError('Quantity must be at least 1')
      return
    }

    const priceNum = Number(editSalePrice)
    if (isNaN(priceNum) || priceNum < 0) {
      setEditSaleError('Price must be a valid non-negative number')
      return
    }

    setEditSaleSubmitting(true)
    setEditSaleError(null)

    try {
      const res = await updateTransaction(editingSale.id, {
        quantity: qty,
        price: priceNum,
        locationId: editSaleLocationId,
        locationName: locationMap.get(editSaleLocationId) || editingSale.locationName,
        date: editSaleDate,
        customerName: editSaleCustomerName,
        notes: editSaleNotes
      })

      const updated = res.transaction
      const oldQty = Number(editingSale.quantity || 1)
      const oldPrice = Number(editingSale.price || 0)
      const oldLoc = editingSale.locationId
      const newLoc = editSaleLocationId

      toast.success('Sale entry updated successfully')
      onSaleUpdated(updated, oldQty, oldPrice, qty, priceNum, oldLoc, newLoc)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update sale'
      setEditSaleError(msg)
      toast.error(msg)
    } finally {
      setEditSaleSubmitting(false)
    }
  }

  if (!editingSale) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.16, ease: EASE_OUT }}
          className="w-full max-w-lg bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-gray-100 overflow-hidden"
        >
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-black">Edit Sale Entry</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-800 border border-gray-200">
                  Ledger Entry
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Correct recorded sale details. Stock adjustments apply automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-black rounded-lg hover:bg-gray-100 transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
            >
              <X size={16} />
            </button>
          </div>

          {editSaleError && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{editSaleError}</span>
            </div>
          )}

          <form onSubmit={handleSaveEditSale} className="p-6 space-y-4">
            {/* Product Summary banner */}
            <div className="p-3 bg-gray-50 border border-gray-200/80 rounded-xl flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-black block">{editingSale.productName}</span>
                <span className="text-[11px] text-gray-500">
                  {editingSale.metal} · {editingSale.category} {editingSale.brand ? `· ${editingSale.brand}` : ''}
                </span>
              </div>
              <span className="text-[11px] font-mono text-gray-400">ID: {editingSale.id.slice(-6)}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Sale Date <span className="text-red-500">*</span>
                </label>
                <CustomDatePicker
                  value={editSaleDate}
                  onChange={setEditSaleDate}
                  placeholder="Select sale date"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Store Location <span className="text-red-500">*</span>
                </label>
                <CustomSelect
                  value={editSaleLocationId}
                  onValueChange={setEditSaleLocationId}
                  options={saleLocationOptions}
                  placeholder="Select location..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Quantity Sold <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={editSaleQuantity}
                  onChange={(e) => setEditSaleQuantity(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Unit Price (₹) <span className="text-red-500">*</span>
                </label>
                <MoneyInput
                  required
                  value={editSalePrice}
                  onChange={setEditSalePrice}
                  placeholder="e.g. 15000"
                  size="sm"
                />
              </div>
            </div>

            {/* Live total display */}
            <div className="p-2.5 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between text-xs">
              <span className="text-gray-500">Total Sale Amount:</span>
              <span className="font-bold text-black text-sm font-mono tabular-nums">
                ₹{((Number(editSaleQuantity) || 0) * (Number(String(editSalePrice || '').replace(/,/g, '')) || 0)).toLocaleString('en-IN')}
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                Customer Name / Entity
              </label>
              <input
                type="text"
                value={editSaleCustomerName}
                onChange={(e) => setEditSaleCustomerName(e.target.value)}
                placeholder="e.g. Rajesh Kumar"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                Invoice / Notes
              </label>
              <input
                type="text"
                value={editSaleNotes}
                onChange={(e) => setEditSaleNotes(e.target.value)}
                placeholder="e.g. Tax Invoice #INV-001"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSaleSubmitting || !isEditSaleValid}
                className="px-5 py-2 text-xs font-semibold text-white bg-black hover:bg-black/85 rounded-lg shadow-xs transition-[background-color,opacity,transform] duration-150 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none inline-flex items-center gap-2"
              >
                {editSaleSubmitting ? 'Saving Changes...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
