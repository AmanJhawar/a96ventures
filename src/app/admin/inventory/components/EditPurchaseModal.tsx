'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { Transaction } from '@/lib/types'
import { EASE_OUT } from '@/components/motion-transitions'
import CustomSelect, { SelectOption } from '@/components/custom-select'
import CustomDatePicker from '@/components/custom-date-picker'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/ui/form-error'

interface EditPurchaseModalProps {
  editingPurchase: Transaction | null
  onClose: () => void
  onSave: (e: React.FormEvent) => Promise<void>
  locationOptions: SelectOption[]
  date: string
  setDate: (d: string) => void
  locationId: string
  setLocationId: (id: string) => void
  quantity: string
  setQuantity: (q: string) => void
  price: string
  setPrice: (p: string) => void
  vendorName: string
  setVendorName: (v: string) => void
  notes: string
  setNotes: (n: string) => void
  submitting: boolean
  isValid: boolean
  error: string | null
}

export function EditPurchaseModal({
  editingPurchase,
  onClose,
  onSave,
  locationOptions,
  date,
  setDate,
  locationId,
  setLocationId,
  quantity,
  setQuantity,
  price,
  setPrice,
  vendorName,
  setVendorName,
  notes,
  setNotes,
  submitting,
  isValid,
  error
}: EditPurchaseModalProps) {
  if (!editingPurchase) return null

  const totalValue = (Number(quantity) || 0) * (Number(price) || 0)

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
                <h3 className="text-base font-bold text-black">Edit Purchase Entry</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-black text-white">
                  Super Admin
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Correct recorded purchase details. Inventory stock levels update automatically.
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

          {error && (
            <div className="mx-6 mt-4">
              <FormError message={error} />
            </div>
          )}

          <form onSubmit={onSave} className="p-6 space-y-4">
            {/* Product Summary banner */}
            <div className="p-3 bg-gray-50 border border-gray-200/80 rounded-xl flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-black block">{editingPurchase.productName}</span>
                <span className="text-xs text-gray-500">
                  {editingPurchase.metal} · {editingPurchase.category}{' '}
                  {editingPurchase.brand ? `· ${editingPurchase.brand}` : ''}
                </span>
              </div>
              <span className="text-xs font-mono text-gray-400">ID: {editingPurchase.id.slice(-6)}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Purchase Date <span className="text-rose-500">*</span>
                </label>
                <CustomDatePicker
                  value={date}
                  onChange={setDate}
                  placeholder="Select purchase date"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Store Location <span className="text-rose-500">*</span>
                </label>
                <CustomSelect
                  value={locationId}
                  onValueChange={setLocationId}
                  options={locationOptions}
                  placeholder="Select location..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Quantity Restocked <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Unit Cost (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 12000"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                />
              </div>
            </div>

            {/* Live total display */}
            <div className="p-2.5 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between text-xs">
              <span className="text-gray-500">Total Purchase Value:</span>
              <span className="font-bold text-black text-sm">
                ₹{totalValue.toLocaleString('en-IN')}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Supplier / Vendor Name
              </label>
              <input
                type="text"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="e.g. MMTC PAMP Refinery"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Invoice / Reference Notes
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. PO #PO-9921 / Challan #440"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting} disabled={!isValid}>
                Save Changes
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
