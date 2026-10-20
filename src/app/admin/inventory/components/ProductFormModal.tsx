'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Lock } from 'lucide-react'
import CustomSelect from '@/components/custom-select'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/ui/form-error'
import { AdminUser, ProductCategory, ProductBrand } from '@/lib/types'

const EASE_OUT = [0.16, 1, 0.3, 1] as const

interface ProductFormModalProps {
  isOpen: boolean
  onClose: () => void
  editingProductId: string | null
  productFormError: string | null
  productFormSubmitting: boolean
  isProductFormValid: boolean
  handleSaveProduct: (e: React.FormEvent) => void
  prodName: string
  setProdName: (val: string) => void
  prodCategory: ProductCategory | ''
  handleCategoryChange: (val: ProductCategory) => void
  categoryOptions: { value: string; label: string }[]
  isProductCategoryMetalLocked: boolean
  prodBrand: ProductBrand | ''
  setProdBrand: (val: ProductBrand) => void
  brandOptions: { value: string; label: string }[]
  prodMetal: 'Gold' | 'Silver' | ''
  handleMetalChange: (metal: 'Gold' | 'Silver') => void
  prodSku: string
  setProdSku: (val: string) => void
  isIdolCategory: boolean
  prodWeight: string
  setProdWeight: (val: string) => void
  prodPurity: string
  setProdPurity: (val: string) => void
  purityOptions: { value: string; label: string }[]
  prodPieceWeights: number[]
  prodPieceInput: string
  setProdPieceInput: (val: string) => void
  handleAddProdPieceWeight: () => void
  handleRemoveProdPieceWeight: (idx: number) => void
  prodInitialStock: string
  setProdInitialStock: (val: string) => void
  prodInitialLocationId: string
  setProdInitialLocationId: (val: string) => void
  isLocationLocked: boolean
  locationOptions: { value: string; label: string }[]
  locationMap: Map<string, string>
  adminUser: AdminUser | null
  formatWeight: (w?: number) => string
}

export function ProductFormModal({
  isOpen,
  onClose,
  editingProductId,
  productFormError,
  productFormSubmitting,
  isProductFormValid,
  handleSaveProduct,
  prodName,
  setProdName,
  prodCategory,
  handleCategoryChange,
  categoryOptions,
  isProductCategoryMetalLocked,
  prodBrand,
  setProdBrand,
  brandOptions,
  prodMetal,
  handleMetalChange,
  prodSku,
  setProdSku,
  isIdolCategory,
  prodWeight,
  setProdWeight,
  prodPurity,
  setProdPurity,
  purityOptions,
  prodPieceWeights,
  prodPieceInput,
  setProdPieceInput,
  handleAddProdPieceWeight,
  handleRemoveProdPieceWeight,
  prodInitialStock,
  setProdInitialStock,
  prodInitialLocationId,
  setProdInitialLocationId,
  isLocationLocked,
  locationOptions,
  locationMap,
  adminUser,
  formatWeight
}: ProductFormModalProps) {
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
            <h2 className="text-lg font-semibold text-black">
              {editingProductId ? 'Edit product' : 'Add new product'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97]"
            >
              <X size={18} />
            </button>
          </div>

          {productFormError && (
            <div className="mb-4">
              <FormError message={productFormError} />
            </div>
          )}

          <form onSubmit={handleSaveProduct} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Product name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. MMTC Gold Bar 10g / Silver Lakshmi Idol"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-gray-700">
                    Category <span className="text-rose-500">*</span>
                  </label>
                  {isProductCategoryMetalLocked && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                      <Lock className="w-3 h-3 text-gray-500" />
                      Locked
                    </span>
                  )}
                </div>
                {isProductCategoryMetalLocked ? (
                  <div className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 flex items-center justify-between">
                    <span>{prodCategory}</span>
                    <span className="text-xs font-normal text-gray-400">Has entries / stock</span>
                  </div>
                ) : (
                  <CustomSelect
                    value={prodCategory}
                    onValueChange={(val) => handleCategoryChange(val as ProductCategory)}
                    options={categoryOptions}
                    placeholder="Select category..."
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Brand <span className="text-rose-500">*</span>
                </label>
                {prodCategory === 'Bullions' ? (
                  <CustomSelect
                    value={prodBrand}
                    onValueChange={(val) => setProdBrand(val as ProductBrand)}
                    options={brandOptions}
                    placeholder="Select brand..."
                  />
                ) : prodCategory === 'Idols' ? (
                  <div className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 flex items-center justify-between">
                    <span>Local</span>
                    <span className="text-xs font-normal text-gray-400">Default</span>
                  </div>
                ) : (
                  <div className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-400 flex items-center justify-between">
                    <span>Select category first</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-gray-700">
                    Metal <span className="text-rose-500">*</span>
                  </label>
                  {isProductCategoryMetalLocked && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                      <Lock className="w-3 h-3 text-gray-500" />
                      Locked
                    </span>
                  )}
                </div>
                {isProductCategoryMetalLocked ? (
                  <div className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 flex items-center justify-between">
                    <span>{prodMetal}</span>
                    <span className="text-xs font-normal text-gray-400">Has entries / stock</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleMetalChange('Gold')}
                      className={`py-2 px-2.5 rounded-lg text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 flex items-center justify-center active:scale-[0.97] ${prodMetal === 'Gold'
                        ? 'bg-black text-white shadow-xs'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                      Gold
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMetalChange('Silver')}
                      className={`py-2 px-2.5 rounded-lg text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 flex items-center justify-center active:scale-[0.97] ${prodMetal === 'Silver'
                        ? 'bg-black text-white shadow-xs'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                      Silver
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  SKU code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. GP-10G / IDOL-SLV-100"
                  value={prodSku}
                  onChange={(e) => setProdSku(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black uppercase transition-[border-color] duration-150"
                  required
                />
              </div>

              <div>
                {isIdolCategory ? (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Average weight
                    </label>
                    <div className="px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-black flex items-center justify-between">
                      <span>
                        {prodPieceWeights.length > 0
                          ? `~${formatWeight(prodPieceWeights.reduce((a, b) => a + b, 0) / prodPieceWeights.length)} avg`
                          : 'Variable'}
                      </span>
                      <span className="text-xs font-normal text-gray-500">
                        {prodPieceWeights.length} pcs
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Weight (grams) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      placeholder="e.g. 10.000"
                      value={prodWeight}
                      onChange={(e) => setProdWeight(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-200 text-black placeholder-gray-400 focus:outline-none focus:border-black rounded-lg text-sm transition-[border-color] duration-150"
                      required
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Purity {prodMetal ? `(${prodMetal})` : ''} <span className="text-rose-500">*</span>
                </label>
                <CustomSelect
                  value={prodPurity}
                  onValueChange={setProdPurity}
                  options={purityOptions}
                  placeholder={prodMetal ? 'Select purity...' : 'Select metal first'}
                  disabled={!prodMetal}
                />
              </div>
            </div>

            {/* Idol Piece-Level Weight Registry */}
            {isIdolCategory && (
              <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-gray-800 flex items-center gap-1.5">
                      {editingProductId && <Lock className="w-3.5 h-3.5 text-gray-500" />}
                      Piece-level weight registry {editingProductId ? '(Locked)' : ''}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {editingProductId
                        ? 'Pieces are managed through inventory movements. Change pieces only through purchases and adjustments.'
                        : 'Each idol piece has a distinct weight. Enter individual piece weights (press Enter or Add).'}
                    </p>
                  </div>
                  {prodPieceWeights.length > 0 && (
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-black text-white">
                      {prodPieceWeights.length} piece{prodPieceWeights.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                {!editingProductId && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="e.g. 48.250, 51.600, 49.825 (or comma-separated)"
                      value={prodPieceInput}
                      onChange={(e) => setProdPieceInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddProdPieceWeight()
                        }
                      }}
                      className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                    />
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => handleAddProdPieceWeight()}
                    >
                      + Add piece
                    </Button>
                  </div>
                )}

                {prodPieceWeights.length > 0 ? (
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-white rounded-lg border border-gray-200">
                      <AnimatePresence initial={false}>
                        {prodPieceWeights.map((w, idx) => (
                          <motion.span
                            key={`${idx}-${w}`}
                            initial={{ opacity: 0, scale: 0.92 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.92 }}
                            transition={{ duration: 0.14, ease: EASE_OUT }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-100 border border-gray-200 text-xs font-medium text-gray-800"
                          >
                            <span>#{idx + 1}: <strong>{formatWeight(w)}</strong></span>
                            {!editingProductId && (
                              <button
                                type="button"
                                onClick={() => handleRemoveProdPieceWeight(idx)}
                                className="text-gray-400 hover:text-rose-600 transition-colors duration-100 ml-0.5 active:scale-[0.97]"
                                title="Remove piece"
                              >
                                ✕
                              </button>
                            )}
                          </motion.span>
                        ))}
                      </AnimatePresence>
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-600 px-1 pt-1 border-t border-gray-200">
                      <span>Total: <strong>{formatWeight(prodPieceWeights.reduce((a, b) => a + b, 0))}</strong></span>
                      <span>Average: <strong>{formatWeight(prodPieceWeights.reduce((a, b) => a + b, 0) / prodPieceWeights.length)}</strong></span>
                      <span>Quantity: <strong>{prodPieceWeights.length} pcs</strong></span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-3 bg-white/60 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400">
                    {editingProductId
                      ? 'No individual pieces registered. Restock or adjust via Purchases or Adjustments.'
                      : 'No individual pieces registered yet. Add weights above or restock via Purchases.'}
                  </div>
                )}
              </div>
            )}

            {/* Opening stock (Only on creation) */}
            {!editingProductId && (
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="text-xs font-medium text-gray-700 mb-2">
                  Initial stock setup (optional)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Initial quantity {prodCategory === 'Idols' && '(Derived from pieces above)'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      disabled={prodCategory === 'Idols'}
                      placeholder="0"
                      value={prodCategory === 'Idols' ? String(prodPieceWeights.length) : prodInitialStock}
                      onChange={(e) => setProdInitialStock(e.target.value)}
                      className={`w-full px-3.5 py-2 border border-gray-200 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150 ${prodCategory === 'Idols' ? 'bg-gray-100 cursor-not-allowed font-semibold' : 'bg-white'}`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs text-gray-500">Assign to location</label>
                      {isLocationLocked && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-700 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                          <Lock className="w-2.5 h-2.5 text-gray-500" />
                          Assigned store
                        </span>
                      )}
                    </div>
                    {isLocationLocked ? (
                      <div className="w-full px-3.5 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-black flex items-center justify-between">
                        <span className="font-semibold text-black">
                          {locationMap.get(prodInitialLocationId) || adminUser?.assignedLocationName || 'Assigned Location'}
                        </span>
                        <span className="text-xs text-gray-500">Default & Locked</span>
                      </div>
                    ) : (
                      <CustomSelect
                        value={prodInitialLocationId}
                        onValueChange={setProdInitialLocationId}
                        options={[{ value: '', label: 'Select location...' }, ...locationOptions]}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

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
                disabled={!isProductFormValid}
                loading={productFormSubmitting}
              >
                {editingProductId ? 'Update product' : 'Create product'}
              </Button>
            </div>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
