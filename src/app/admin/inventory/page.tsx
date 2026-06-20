"use client"

import { useRef, useEffect } from 'react'
import Image from 'next/image'
import { Trash2, Plus, Box, Edit2, X, ChevronDown } from 'lucide-react'
import { ImageDropzone } from '@/components/image-dropzone'
import { ConfirmModal } from '@/components/confirm-modal'
import { useInventoryForm } from '@/hooks/use-inventory-form'
import { 
  hasStonesCategory, 
  isNoPurityCategory, 
  getStandardSizeMatrix, 
  getCustomSizeMatrix,
  getSizeMatrix
} from '@/lib/domain/inventory'

const STANDARD_SIZES = ['4cm', '7cm', '10cm', '12.5cm']
const STANDARD_PURITIES = ['92.5', '80.0']
const STANDARD_STONES = [
  'White Quartz', 'Aventurine Quartz', 'Rose Quartz', 'Lapis Lazuli',
  'Tiger Eye', 'Black Tourmaline', 'Amethyst', 'Blue Agate'
]
const STANDARD_WEIGHTS = ['10g', '20g', '50g', '100g']

export default function AdminInventory() {
  const { state, actions } = useInventoryForm()

  const {
    items, categories, loading, isFormOpen, editingId, deleteId,
    formData, customSizeInput, customPurityInput,
    variantSkuInputs, variantWeightInputs, variantImageInputs,
    categoryOpen, categoryFocusedIndex, combos
  } = state

  const {
    setIsFormOpen, setDeleteId, setFormData,
    setCustomSizeInput, setCustomPurityInput,
    setVariantSkuInputs, setVariantWeightInputs, setVariantImageInputs,
    setCategoryOpen, setCategoryFocusedIndex,
    cleanupOrphanedInputs, executeDelete, handleEdit, handleCancel, handleSave,
    toggleSize, togglePurity, addCustomSize, removeCustomSize,
    addCustomPurity, removeCustomPurity, numericFilter
  } = actions

  const confirmDelete = (id: string) => setDeleteId(id)

  const categoryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) setCategoryOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [setCategoryOpen])

  useEffect(() => {
    if (categoryOpen) {
      const idx = categories.findIndex(c => c === formData.category)
      setCategoryFocusedIndex(idx >= 0 ? idx : 0)
    } else {
      setCategoryFocusedIndex(-1)
    }
  }, [categoryOpen, formData.category, categories, setCategoryFocusedIndex])

  const handleCategoryKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!categoryOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); setCategoryOpen(true)
      }
      return
    }
    switch (e.key) {
      case 'Escape': e.preventDefault(); setCategoryOpen(false); break
      case 'ArrowDown': e.preventDefault(); setCategoryFocusedIndex(prev => prev < categories.length - 1 ? prev + 1 : prev); break
      case 'ArrowUp': e.preventDefault(); setCategoryFocusedIndex(prev => prev > 0 ? prev - 1 : prev); break
      case 'Enter':
      case ' ': 
        e.preventDefault()
        if (categoryFocusedIndex >= 0 && categoryFocusedIndex < categories.length) { 
          const newFormData = { ...formData, category: categories[categoryFocusedIndex] }
          setFormData(newFormData)
          cleanupOrphanedInputs(newFormData)
          setCategoryOpen(false) 
        }
        break
    }
  }

  return (
    <div>
      {!isFormOpen && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-black mb-2 tracking-tight flex items-center gap-3">
              <Box size={28} />
              Inventory Manager
            </h1>
            <p className="text-gray-500">Manage inventory products, sizes and purity variants.</p>
          </div>
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <button
              onClick={() => setIsFormOpen(true)}
              className="admin-btn-primary flex items-center gap-2 whitespace-nowrap"
            >
              <Plus size={18} className="transition-transform" />
              Add Product
            </button>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-8 animate-[fadeInUp_300ms_var(--ease-out)_forwards]">
          <h2 className="text-xl font-semibold mb-6">{editingId ? 'Edit Product' : 'Add New Product'}</h2>
          <form onSubmit={handleSave} className="space-y-6">
            {/* Row 1: Slug + SKU */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="admin-label required">URL Key (ID)</label>
                <input
                  type="text" required disabled={!!editingId}
                  value={formData.id || ''}
                  onChange={e => setFormData({ ...formData, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '') })}
                  className="admin-input disabled:bg-gray-100 disabled:text-gray-500"
                  placeholder="e.g., modern-chair"
                />
              </div>
              <div>
                <label className="admin-label required">SKU (Internal Code)</label>
                <input
                  type="text" required
                  value={formData.sku || ''}
                  onChange={e => setFormData({ ...formData, sku: e.target.value })}
                  className="admin-input"
                  placeholder="e.g., A96-001"
                />
              </div>
            </div>

            {/* Row 2: Name + Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="admin-label required">Product Name</label>
                <input
                  type="text" required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="admin-input"
                  placeholder="e.g., Elegance Marble Vase"
                />
              </div>
              <div>
                <label className="admin-label required mb-2">Category</label>
                <div className="relative" ref={categoryRef} onKeyDown={handleCategoryKeyDown}>
                  <button
                    type="button"
                    role="combobox"
                    aria-haspopup="listbox"
                    aria-expanded={categoryOpen}
                    aria-controls="admin-category-listbox"
                    onClick={() => setCategoryOpen(!categoryOpen)}
                    className="admin-input flex items-center justify-between text-left"
                  >
                    <span className={formData.category ? 'text-black' : 'text-gray-400'}>
                      {formData.category || 'Select category'}
                    </span>
                    <ChevronDown size={16} className={`text-gray-400 transition-transform ${categoryOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {categoryOpen && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden origin-top animate-[fadeInUp_150ms_var(--ease-out)_forwards]">
                      <ul id="admin-category-listbox" role="listbox" className="m-0 p-0 list-none max-h-60 overflow-y-auto">
                        {categories.map((cat, idx) => (
                          <li key={cat} role="option" aria-selected={formData.category === cat}>
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => { 
                                const newFormData = { ...formData, category: cat };
                                setFormData(newFormData);
                                cleanupOrphanedInputs(newFormData);
                                setCategoryOpen(false);
                              }}
                              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${categoryFocusedIndex === idx ? 'bg-gray-100' : ''
                                } ${formData.category === cat ? 'bg-gray-100 text-black font-semibold' : 'text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                              {cat}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ─── Variant Configuration ─── */}
            <div className="border border-gray-200 rounded-xl overflow-hidden transition-[background-color,border-color,transform] duration-200 ease-[var(--ease-out)]">
              <div className={`p-5 flex items-center justify-between transition-colors duration-200 ${formData.hasVariants ? 'border-b border-gray-100 bg-gray-50/50' : ''}`}>
                <div>
                  <h3 className="text-sm font-semibold text-black">Inventory Variants</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Configure sizes, purities, or specific stones/weights.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.hasVariants}
                  onClick={() => {
                    const newFormData = { ...formData, hasVariants: !formData.hasVariants }
                    setFormData(newFormData)
                    if (!newFormData.hasVariants) cleanupOrphanedInputs(newFormData)
                  }}
                  className={`relative inline-flex h-[22px] w-[42px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-[160ms] ease-[var(--ease-in-out)] ${formData.hasVariants ? 'bg-black' : 'bg-gray-200'}`}
                >
                  <span className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-[160ms] ease-[var(--ease-in-out)] ${formData.hasVariants ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
                </button>
              </div>

              {formData.hasVariants && (
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 bg-white">
                  {/* ── Size Column ── */}
                  <div className={isNoPurityCategory(formData.category) ? 'md:col-span-2' : ''}>
                    <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 mb-4">
                      {hasStonesCategory(formData.category) ? 'Available Stones' : formData.category?.includes('Bullion') ? 'Available Weights' : 'Available Sizes'}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-6">
                      {Array.from(new Set([
                        ...(hasStonesCategory(formData.category)
                          ? STANDARD_STONES
                          : formData.category?.includes('Bullion')
                            ? STANDARD_WEIGHTS
                            : STANDARD_SIZES),
                        ...getStandardSizeMatrix(formData)
                      ])).map(opt => (
                        <button
                          key={opt} type="button"
                          onClick={() => toggleSize(opt)}
                          className={`admin-pill ${getStandardSizeMatrix(formData).includes(opt) ? 'admin-pill-active' : ''}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>

                    {/* Custom sizes already added */}
                    {getCustomSizeMatrix(formData).length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {getCustomSizeMatrix(formData).map(s => (
                          <span key={s} className="admin-pill admin-pill-active flex items-center gap-1.5">
                            {s}
                            <button type="button" onClick={() => removeCustomSize(s)} className="opacity-60 hover:opacity-100 transition-[opacity,transform] active:scale-[0.97]"><X size={12} /></button>
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 mb-3">
                      {hasStonesCategory(formData.category) ? 'Custom Stone' : formData.category?.includes('Bullion') ? 'Custom Weight' : 'Custom Size'}
                    </p>
                    <div className="flex items-end gap-3 max-w-sm">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={customSizeInput}
                          onChange={e => setCustomSizeInput(hasStonesCategory(formData.category) ? e.target.value : numericFilter(e.target.value))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSize() } }}
                          className="admin-input-underline"
                          placeholder={hasStonesCategory(formData.category) ? "e.g., Rose Quartz" : formData.category?.includes('Bullion') ? "e.g., 100" : "e.g., 20"}
                        />
                      </div>
                      <button type="button" onClick={addCustomSize} className="admin-btn-outline">
                        ADD
                      </button>
                    </div>
                  </div>

                  {/* ── Purity Column ── */}
                  {!isNoPurityCategory(formData.category) && (
                    <div>
                      <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 mb-4">Available Purities</p>
                      <div className="flex flex-wrap gap-2 mb-6">
                        {Array.from(new Set([...STANDARD_PURITIES, ...(formData.standardPurities || [])])).map(p => (
                          <button
                            key={p} type="button"
                            onClick={() => togglePurity(p)}
                            className={`admin-pill ${(formData.standardPurities || []).includes(p) ? 'admin-pill-active' : ''}`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>

                      {/* Custom purities already added */}
                      {(formData.customPurities || []).length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {(formData.customPurities || []).map(p => (
                            <span key={p} className="admin-pill admin-pill-active flex items-center gap-1.5">
                              {p}
                              <button type="button" onClick={() => removeCustomPurity(p)} className="opacity-60 hover:opacity-100 transition-[opacity,transform] active:scale-[0.97]"><X size={12} /></button>
                            </span>
                          ))}
                        </div>
                      )}

                      <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 mb-3">Custom Purity</p>
                      <div className="flex items-end gap-3">
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            value={customPurityInput}
                            onChange={e => setCustomPurityInput(numericFilter(e.target.value))}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomPurity() } }}
                            className="admin-input-underline"
                            placeholder="e.g., 99.9"
                          />
                        </div>
                        <button type="button" onClick={addCustomPurity} className="admin-btn-outline">
                          ADD
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Per-Variant SKUs & Weights ── */}
              {formData.hasVariants && (() => {
                const isBullion = !!formData.category?.includes('Bullion')

                if (combos.length === 0) {
                  return (
                    <div className="px-6 pb-6 bg-white">
                      <div className="pt-6 border-t border-gray-100">
                        <p className="text-sm text-gray-500 italic">
                          {hasStonesCategory(formData.category)
                            ? 'Select at least one stone to configure variant SKUs.'
                            : isBullion
                              ? 'Select at least one weight to configure variant SKUs.'
                              : 'Select at least one size and one purity to configure variant SKUs and weights.'}
                        </p>
                      </div>
                    </div>
                  )
                }

                return (
                  <div className="px-6 pb-6 bg-white">
                    <div className="pt-6 border-t border-gray-100">
                      <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 mb-4">
                        {isBullion ? 'Variant SKUs' : 'Variant SKUs & Approx Weights'}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {combos.map(combo => (
                          <div key={combo.key} className="p-4 bg-white rounded-xl border border-gray-200 space-y-3">
                            <span className="text-[11px] font-semibold text-black uppercase tracking-widest block">{combo.label}</span>
                            <div className={isBullion ? '' : 'grid grid-cols-2 gap-3'}>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">SKU</label>
                                <input
                                  type="text"
                                  value={variantSkuInputs[combo.key] || ''}
                                  onChange={e => setVariantSkuInputs({ ...variantSkuInputs, [combo.key]: e.target.value })}
                                  className="admin-input text-sm py-2"
                                  placeholder="e.g., A96-001-S"
                                />
                              </div>
                              {!isBullion && (
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Approx Weight</label>
                                  <input
                                    type="text"
                                    value={variantWeightInputs[combo.key] || ''}
                                    onChange={e => setVariantWeightInputs({ ...variantWeightInputs, [combo.key]: numericFilter(e.target.value) })}
                                    className="admin-input text-sm py-2"
                                    placeholder="e.g., 50"
                                  />
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col gap-2 pt-3 mt-3 border-t border-gray-100">
                              <div>
                                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">
                                  {hasStonesCategory(formData.category) || isBullion ? 'Image Overrides (All)' : 'Image Override (Last Image)'}
                                </label>
                                <p className="text-[10px] text-gray-400 mt-0.5 mb-2 leading-tight">
                                  {hasStonesCategory(formData.category) || isBullion 
                                    ? 'These images will completely replace the default product gallery when this variant is selected.' 
                                    : 'This image will replace ONLY the last slide of the product gallery when this variant is selected.'}
                                </p>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                {(() => {
                                  const isFullOverride = hasStonesCategory(formData.category) || isBullion
                                  const currentImages = variantImageInputs[combo.key] || []
                                  
                                  if (!isFullOverride) {
                                    return (
                                      <ImageDropzone 
                                        value={currentImages[0] || ''} 
                                        onChange={url => setVariantImageInputs({ ...variantImageInputs, [combo.key]: url ? [url] : [] })} 
                                      />
                                    )
                                  }
                                  
                                  return (
                                    <>
                                      {currentImages.map((img, idx) => (
                                        <ImageDropzone 
                                          key={idx} 
                                          value={img} 
                                          onChange={url => {
                                            const newImgs = [...currentImages]
                                            if (url) newImgs[idx] = url
                                            else newImgs.splice(idx, 1)
                                            setVariantImageInputs({ ...variantImageInputs, [combo.key]: newImgs })
                                          }} 
                                        />
                                      ))}
                                      {currentImages.length < 4 && (
                                        <ImageDropzone 
                                          value="" 
                                          onChange={url => {
                                            if (url) setVariantImageInputs({ ...variantImageInputs, [combo.key]: [...currentImages, url] })
                                          }} 
                                        />
                                      )}
                                    </>
                                  )
                                })()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Row 3: Weight + Material + Display Order */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="admin-label required">Approx Weight</label>
                <input
                  type="text" required={!formData.hasVariants} disabled={formData.hasVariants}
                  value={formData.hasVariants ? 'Configured per variant' : (formData.weight || '')}
                  onChange={e => setFormData({ ...formData, weight: e.target.value })}
                  className="admin-input disabled:bg-gray-100 disabled:text-gray-500"
                  placeholder="e.g., 2.5 kg"
                />
              </div>
              <div>
                <label className="admin-label">Material (Optional)</label>
                <input
                  type="text"
                  value={formData.material || ''}
                  onChange={e => setFormData({ ...formData, material: e.target.value })}
                  className="admin-input"
                  placeholder="e.g., 999 Pure Silver"
                />
              </div>
              <div>
                <label className="admin-label">Display Order (Optional)</label>
                <input
                  type="number"
                  value={formData.orderIndex ?? ''}
                  onChange={e => setFormData({ ...formData, orderIndex: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                  className="admin-input"
                  placeholder="Lowest numbers first"
                />
              </div>
            </div>

            {/* Row 4: Description */}
            <div>
              <label className="admin-label required">Description</label>
              <textarea
                required rows={4}
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="admin-input resize-none"
                placeholder="Enter detailed product description, materials used, and care instructions..."
              />
            </div>

            {/* Images */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="admin-label required">Thumbnail Image (3:4 Portrait)</label>
                <ImageDropzone
                  value={formData.imageFile || ''}
                  onChange={(url) => setFormData({ ...formData, imageFile: url })}
                />
              </div>

              <div>
                <label className="admin-label">Product Images (4:3 Landscape)</label>
                <div className="grid grid-cols-1 gap-6">
                  {(formData.additionalImages || []).map((img, idx) => (
                    <ImageDropzone
                      key={idx}
                      value={img}
                      onChange={(url) => {
                        const newImages = [...(formData.additionalImages || [])]
                        if (url) {
                          newImages[idx] = url
                        } else {
                          newImages.splice(idx, 1)
                        }
                        setFormData({ ...formData, additionalImages: newImages })
                      }}
                    />
                  ))}
                  {(formData.additionalImages || []).length < 4 && (
                    <ImageDropzone
                      value=""
                      onChange={(url) => {
                        if (url) {
                          setFormData({ ...formData, additionalImages: [...(formData.additionalImages || []), url] })
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4 mt-12">
              <button type="button" onClick={handleCancel} className="admin-btn-outline px-6">
                Cancel
              </button>
              <button type="submit" className="admin-btn-primary">
                {editingId ? 'Update Product' : 'Save Product'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Table ─── */}
      {!isFormOpen && (
        loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-6 py-4 text-sm font-semibold text-gray-500">Image</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-500">Product / SKU</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-500 whitespace-nowrap">Category</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-500">Variants</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-500">Purities</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-500">Weight</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const allSizes = getSizeMatrix(item)
                    const allPurities = [...(item.standardPurities || []), ...(item.customPurities || [])]
                    return (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="px-6 py-4">
                          {item.imageFile ? (
                            <Image unoptimized width={48} height={64} src={item.imageFile.startsWith('http') ? item.imageFile : `/assets/${item.imageFile}`} alt="Product" className="w-12 h-auto aspect-[3/4] object-cover rounded-lg bg-[#f5f5f7]" />
                          ) : (
                            <div className="w-12 h-auto aspect-[3/4] bg-[#f5f5f7] rounded-lg flex items-center justify-center">
                              <Box size={20} className="text-gray-400" />
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-black">{item.name}</div>
                          <div className="text-xs text-gray-500 mt-1">{item.sku} · /{item.id}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-lg whitespace-nowrap">{item.category}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {allSizes.length > 0 ? allSizes.map(s => (
                              <span key={s} className="text-xs border border-gray-200 px-1.5 py-0.5 rounded">{s}</span>
                            )) : <span className="text-xs text-gray-400">—</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {allPurities.length > 0 ? allPurities.map(p => (
                              <span key={p} className="text-xs border border-gray-200 px-1.5 py-0.5 rounded">{p}{p !== '—' && !p.endsWith('%') ? '%' : ''}</span>
                            )) : <span className="text-xs text-gray-400">—</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-black">{item.weight ? item.weight : <span className="text-gray-400">—</span>}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => handleEdit(item)} className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97] p-2 flex items-center justify-center" title="Edit">
                              <Edit2 size={18} />
                            </button>
                            <button onClick={() => confirmDelete(item.id)} className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97] p-2 flex items-center justify-center" title="Delete">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-500">No products found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Product"
        description="Are you sure you want to delete this product? The live site might take a moment to reflect the change as caches clear."
        confirmText="Delete"
        onClose={() => setDeleteId(null)}
        onConfirm={executeDelete}
      />
    </div>
  )
}
