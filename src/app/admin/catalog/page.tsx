"use client"

import { useState, useEffect, useRef } from 'react'
import { collection, setDoc, deleteDoc, doc, getDocs, getDoc, getFirestore } from 'firebase/firestore/lite'
import { app } from '@/lib/firebase/config'

const db = getFirestore(app)
import { Trash2, Plus, Box, Edit2, X, ChevronDown } from 'lucide-react'
import { ImageDropzone } from '@/components/image-dropzone'
import { ConfirmModal } from '@/components/confirm-modal'

const STANDARD_SIZES = ['4cm', '7cm', '10cm', '12.5cm']
const STANDARD_PURITIES = ['92.5', '80.0']
const STANDARD_STONES = [
  'White Quartz',
  'Aventurine Quartz',
  'Rose Quartz',
  'Lapis Lazuli',
  'Tiger Eye',
  'Black Tourmaline',
  'Amethyst',
  'Blue Agate'
]
const STANDARD_WEIGHTS = ['10g', '20g', '50g', '100g']
const isNoPurityCategory = (category?: string) => {
  return category?.includes('Marble') || category?.includes('Bullion')
}
import { DEFAULT_CATEGORIES } from '@/lib/types'

interface InventoryItem {
  id: string
  sku: string
  name: string
  category: string
  hasVariants: boolean
  standardSizes: string[]
  customSizes: string[]
  standardPurities: string[]
  customPurities: string[]
  weight: string
  material?: string
  additionalImages?: string[]
  description: string
  imageFile: string
  variantSkus?: Record<string, string>
  variantWeights?: Record<string, string>
  orderIndex?: number
}

const emptyForm: Partial<InventoryItem> = {
  id: '', sku: '', name: '', category: '', hasVariants: false,
  standardSizes: [], customSizes: [], standardPurities: [], customPurities: [],
  variantSkus: {},
  variantWeights: {},
  weight: '', material: '', description: '', imageFile: '',
  orderIndex: 0
}

export default function AdminInventory() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<InventoryItem>>({ ...emptyForm })
  const [customSizeInput, setCustomSizeInput] = useState('')
  const [customPurityInput, setCustomPurityInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryFocusedIndex, setCategoryFocusedIndex] = useState(-1)
  const categoryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) setCategoryOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (categoryOpen) {
      const idx = categories.findIndex(c => c === formData.category)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCategoryFocusedIndex(idx >= 0 ? idx : 0)
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCategoryFocusedIndex(-1)
    }
  }, [categoryOpen, formData.category, categories])

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
      case ' ': e.preventDefault(); if (categoryFocusedIndex >= 0 && categoryFocusedIndex < categories.length) { setFormData({ ...formData, category: categories[categoryFocusedIndex] }); setCategoryOpen(false) }; break
    }
  }

  const fetchData = async () => {
    try {
      // Fetch categories
      const catDoc = await getDoc(doc(db, 'settings', 'categories'))
      if (catDoc.exists() && catDoc.data().list) {
        setCategories(catDoc.data().list)
      } else {
        setCategories(DEFAULT_CATEGORIES)
        await setDoc(doc(db, 'settings', 'categories'), { list: DEFAULT_CATEGORIES })
      }

      // Fetch inventory items
      const snap = await getDocs(collection(db, 'catalog'))
      const fetched: InventoryItem[] = []
      snap.forEach((d) => fetched.push({ ...d.data(), id: d.id } as InventoryItem))
      setItems(fetched)
    } catch (err) {
      console.error("Error fetching data", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [])

  const confirmDelete = (id: string) => setDeleteId(id)

  const executeDelete = async () => {
    if (!deleteId) return

    try {
      await deleteDoc(doc(db, 'catalog', deleteId))

      // Trigger dynamic path revalidation in background
      fetch(`/api/revalidate?path=${encodeURIComponent('/catalog')}`).catch(err => console.error(err))
      fetch(`/api/revalidate?path=${encodeURIComponent(`/catalog/${deleteId}`)}`).catch(err => console.error(err))

      setItems(items.filter(i => i.id !== deleteId))
    } catch (err) {
      console.error("Error deleting", err)
      alert("Failed to delete product. Please check your permissions.")
    } finally {
      setDeleteId(null)
    }
  }

  const handleEdit = (item: InventoryItem) => {
    const noPurity = isNoPurityCategory(item.category)
    const hasSizes = (item.standardSizes?.length > 0 || item.customSizes?.length > 0)
    const hasPurities = (item.standardPurities?.length > 0 || item.customPurities?.length > 0)
    const hasVariants = noPurity ? hasSizes : (hasSizes && hasPurities)
    const sanitizedWeights: Record<string, string> = {}
    if (item.variantWeights) {
      Object.entries(item.variantWeights).forEach(([key, val]) => {
        sanitizedWeights[key] = val.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1')
      })
    }
    setFormData({
      ...item,
      hasVariants,
      variantSkus: item.variantSkus || {},
      variantWeights: sanitizedWeights
    })
    setEditingId(item.id)
    setIsFormOpen(true)
  }

  const handleCancel = () => {
    setIsFormOpen(false)
    setEditingId(null)
    setFormData({ ...emptyForm })
    setCustomSizeInput('')
    setCustomPurityInput('')
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.id) { alert("ID is required!"); return }
    const docId = editingId || formData.id

    try {
      // Uniqueness check for new products
      if (!editingId) {
        const existingDoc = await getDoc(doc(db, 'catalog', docId))
        if (existingDoc.exists()) {
          alert(`A product with the ID "${docId}" already exists. Please choose a unique ID.`)
          return
        }
      }

      const { id, hasVariants: formHasVariants, ...payload } = formData

      let totalSize = payload.imageFile ? payload.imageFile.length * 0.75 : 0
      if (payload.additionalImages) {
        payload.additionalImages.forEach(img => {
          totalSize += img.length * 0.75
        })
      }
      if (totalSize > 1000000) {
        alert("Total image size exceeds the 1MB Firestore limit. Please remove or compress images before saving.")
        return
      }

      if (formHasVariants) {
        const noPurity = isNoPurityCategory(formData.category)
        const sizes = [...(payload.standardSizes || []), ...(payload.customSizes || [])]
        const purities = noPurity ? [] : [...(payload.standardPurities || []), ...(payload.customPurities || [])]

        if (sizes.length === 0 || (!noPurity && purities.length === 0)) {
          alert(noPurity
            ? `You must select at least one ${formData.category?.includes('Marble') ? 'Stone' : 'Weight'} to configure variant SKUs.`
            : "You must select at least one Size and one Purity to configure variant SKUs."
          )
          return
        }

        const combos: string[] = []
        if (noPurity) {
          sizes.forEach(s => combos.push(s))
          payload.standardPurities = []
          payload.customPurities = []
        } else {
          sizes.forEach(s => purities.forEach(p => combos.push(`${s} | ${p}`)))
        }

        const cleanVariantSkus: Record<string, string> = {}
        const cleanVariantWeights: Record<string, string> = {}

        for (const combo of combos) {
          if (!payload.variantSkus?.[combo] || payload.variantSkus[combo].trim() === '') {
            alert(`Variant SKU for "${combo}" is required.`)
            return
          }
          if (!payload.variantWeights?.[combo] || payload.variantWeights[combo].trim() === '') {
            alert(`Variant Weight for "${combo}" is required.`)
            return
          }
          cleanVariantSkus[combo] = payload.variantSkus[combo].trim()
          cleanVariantWeights[combo] = payload.variantWeights[combo].trim()
        }

        payload.variantSkus = cleanVariantSkus
        payload.variantWeights = cleanVariantWeights
        // Clear global weight when variants are configured
        payload.weight = ''
      } else {
        payload.standardSizes = []; payload.customSizes = []
        payload.standardPurities = []; payload.customPurities = []
        payload.variantSkus = {}
        payload.variantWeights = {}
      }

      await setDoc(doc(db, 'catalog', docId), payload)

      // Trigger dynamic path revalidation in background
      fetch(`/api/revalidate?path=${encodeURIComponent('/catalog')}`).catch(err => console.error(err))
      fetch(`/api/revalidate?path=${encodeURIComponent(`/catalog/${docId}`)}`).catch(err => console.error(err))

      if (editingId) {
        setItems(items.map(i => i.id === editingId ? { id: docId, ...payload } as InventoryItem : i))
      } else {
        setItems([...items, { id: docId, ...payload } as InventoryItem])
      }
      handleCancel()
    } catch (err) {
      console.error("Error saving product:", err)
      alert("Failed to save product. Please check your connection and permissions.")
    }
  }

  const toggleSize = (size: string) => {
    const current = formData.standardSizes || []
    setFormData({ ...formData, standardSizes: current.includes(size) ? current.filter(s => s !== size) : [...current, size] })
  }

  const togglePurity = (p: string) => {
    const current = formData.standardPurities || []
    setFormData({ ...formData, standardPurities: current.includes(p) ? current.filter(x => x !== p) : [...current, p] })
  }

  const addCustomSize = () => {
    const v = customSizeInput.trim()
    if (!v) return
    const current = formData.customSizes || []
    if (!current.includes(v)) {
      setFormData({ ...formData, customSizes: [...current, v] })
    }
    setCustomSizeInput('')
  }

  const removeCustomSize = (s: string) => {
    setFormData({ ...formData, customSizes: (formData.customSizes || []).filter(x => x !== s) })
  }

  const addCustomPurity = () => {
    const val = customPurityInput.trim()
    if (!val) return
    const newCustoms = [...(formData.customPurities || []), val]
    setFormData({ ...formData, customPurities: Array.from(new Set(newCustoms)) })
    setCustomPurityInput('')
  }

  const removeCustomPurity = (p: string) => {
    setFormData({ ...formData, customPurities: (formData.customPurities || []).filter(x => x !== p) })
  }



  const numericFilter = (val: string) => val.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1')

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-black mb-2 tracking-tight flex items-center gap-3">
            <Box size={28} />
            Catalog Manager
          </h1>
          <p className="text-gray-500">Manage catalog products, sizes and purity variants.</p>
        </div>
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="admin-input flex-1 sm:w-64"
          />
          <button
            onClick={() => isFormOpen ? handleCancel() : setIsFormOpen(true)}
            className="admin-btn-primary flex items-center gap-2 whitespace-nowrap"
          >
            <Plus size={18} className={isFormOpen ? "rotate-45 transition-transform" : "transition-transform"} />
            {isFormOpen ? 'Cancel' : 'Add Product'}
          </button>
        </div>
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm mb-8 animate-[fadeInUp_300ms_var(--ease-out)_forwards]">
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
                  type="text" required={!formData.hasVariants} disabled={formData.hasVariants}
                  value={formData.hasVariants ? 'Variant SKUs Configured Below' : (formData.sku || '')}
                  onChange={e => setFormData({ ...formData, sku: e.target.value })}
                  className="admin-input disabled:bg-gray-100 disabled:text-gray-500"
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
                              onClick={() => { setFormData({ ...formData, category: cat }); setCategoryOpen(false) }}
                              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${categoryFocusedIndex === idx ? 'bg-gray-100' : ''
                                } ${formData.category === cat ? 'bg-black text-white' : 'text-gray-700 hover:bg-gray-50'
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
            <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
              <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-5">Inventory Configuration</p>

              <label className="admin-checkbox mb-6">
                <input
                  type="checkbox"
                  checked={formData.hasVariants || false}
                  onChange={e => setFormData({ ...formData, hasVariants: e.target.checked })}
                />
                <span className="admin-checkbox-box" />
                <span className="text-sm font-medium text-gray-900 tracking-wide uppercase">Product Has Variants</span>
              </label>

              {formData.hasVariants && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
                    {/* ── Size Column ── */}
                    <div className={isNoPurityCategory(formData.category) ? 'md:col-span-2' : ''}>
                      <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-4">
                        {formData.category?.includes('Marble') ? 'Available Stones' : formData.category?.includes('Bullion') ? 'Available Weights' : 'Available Sizes'}
                      </p>
                      <div className="flex flex-wrap gap-2 mb-6">
                        {(formData.category?.includes('Marble')
                          ? STANDARD_STONES
                          : formData.category?.includes('Bullion')
                            ? STANDARD_WEIGHTS
                            : STANDARD_SIZES
                        ).map(opt => (
                          <button
                            key={opt} type="button"
                            onClick={() => toggleSize(opt)}
                            className={`admin-pill ${(formData.standardSizes || []).includes(opt) ? 'admin-pill-active' : ''}`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>

                      {/* Custom sizes already added */}
                      {(formData.customSizes || []).length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {(formData.customSizes || []).map(s => (
                            <span key={s} className="admin-pill admin-pill-active flex items-center gap-1.5">
                              {s}
                              <button type="button" onClick={() => removeCustomSize(s)} className="opacity-60 hover:opacity-100 transition-[opacity,transform] active:scale-95"><X size={12} /></button>
                            </span>
                          ))}
                        </div>
                      )}

                      <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-3">
                        {formData.category?.includes('Marble') ? 'Custom Stone' : formData.category?.includes('Bullion') ? 'Custom Weight' : 'Custom Size'}
                      </p>
                      <div className="flex items-end gap-3 max-w-sm">
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            value={customSizeInput}
                            onChange={e => setCustomSizeInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSize() } }}
                            className="admin-input-underline"
                            placeholder={formData.category?.includes('Marble') ? "e.g., Rose Quartz" : formData.category?.includes('Bullion') ? "e.g., 100g" : "e.g., 20cm"}
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
                        <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-4">Available Purities</p>
                        <div className="flex flex-wrap gap-2 mb-6">
                          {STANDARD_PURITIES.map(p => (
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
                                <button type="button" onClick={() => removeCustomPurity(p)} className="opacity-60 hover:opacity-100 transition-[opacity,transform] active:scale-95"><X size={12} /></button>
                              </span>
                            ))}
                          </div>
                        )}

                        <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-3">Custom Purity</p>
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

                  {/* Variant SKUs Matrix */}
                  {(() => {
                    const noPurity = isNoPurityCategory(formData.category)
                    const sizes = [...(formData.standardSizes || []), ...(formData.customSizes || [])]
                    const purities = noPurity ? [] : [...(formData.standardPurities || []), ...(formData.customPurities || [])]
                    const combos: string[] = []
                    if (sizes.length > 0 && (noPurity || purities.length > 0)) {
                      if (noPurity) {
                        sizes.forEach(s => combos.push(s))
                      } else {
                        sizes.forEach(s => purities.forEach(p => combos.push(`${s} | ${p}`)))
                      }
                    }

                    if (combos.length === 0) return (
                      <div className="mt-8 pt-6 border-t border-gray-200">
                        <p className="text-sm text-gray-500 italic">
                          {noPurity
                            ? `Select at least one ${formData.category?.includes('Marble') ? 'Stone' : 'Weight'} to configure variant SKUs and weights.`
                            : 'Select at least one Size and one Purity to configure variant SKUs and weights.'}
                        </p>
                      </div>
                    )

                    return (
                      <div className="mt-8 pt-6 border-t border-gray-200">
                        <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-4">Variant SKUs & Approx Weights</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {combos.map(combo => (
                            <div key={combo} className="p-4 bg-white rounded-xl border border-gray-200 space-y-3">
                              <span className="text-xs font-semibold text-black uppercase tracking-wider block">{combo}</span>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">SKU</label>
                                  <input
                                    type="text"
                                    value={formData.variantSkus?.[combo] || ''}
                                    onChange={(e) => setFormData({
                                      ...formData,
                                      variantSkus: { ...(formData.variantSkus || {}), [combo]: e.target.value }
                                    })}
                                    className="admin-input text-sm py-2"
                                    placeholder="SKU"
                                    required
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Approx Weight</label>
                                  <input
                                    type="text"
                                    value={formData.variantWeights?.[combo] || ''}
                                    onChange={(e) => setFormData({
                                      ...formData,
                                      variantWeights: { ...(formData.variantWeights || {}), [combo]: numericFilter(e.target.value) }
                                    })}
                                    className="admin-input text-sm py-2"
                                    placeholder="e.g., 50"
                                    required
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </>
              )}
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
              />
            </div>

            {/* Images */}
            <div>
              <label className="admin-label required">Primary Image</label>
              <ImageDropzone
                value={formData.imageFile || ''}
                onChange={(url) => setFormData({ ...formData, imageFile: url })}
              />
            </div>

            <div>
              <label className="admin-label">Additional Images (Optional)</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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

            <button type="submit" className="admin-btn-primary">
              {editingId ? 'Update Product' : 'Save Product'}
            </button>
          </form>
        </div>
      )}

      {/* ─── Table ─── */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Image</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Product / SKU</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Category</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Sizes</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Purities</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items
                  .filter(i =>
                    i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    i.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    i.category.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((item) => {
                    const allSizes = [...(item.standardSizes || []), ...(item.customSizes || [])]
                    const allPurities = [...(item.standardPurities || []), ...(item.customPurities || [])]
                    return (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="px-6 py-4">
                          {item.imageFile ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.imageFile.startsWith('data:') || item.imageFile.startsWith('http') ? item.imageFile : `/assets/${item.imageFile}`} alt="Product" className="w-12 h-12 object-cover rounded-md bg-gray-100" />
                          ) : (
                            <div className="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center">
                              <Box size={20} className="text-gray-400" />
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-black">{item.name}</div>
                          <div className="text-xs text-gray-500 mt-1">{item.sku} · /{item.id}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md">{item.category}</span>
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
                              <span key={p} className="text-xs border border-gray-200 px-1.5 py-0.5 rounded">{p}</span>
                            )) : <span className="text-xs text-gray-400">—</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button onClick={() => handleEdit(item)} className="text-gray-400 hover:text-black transition-[color,transform] active:scale-95 p-2" title="Edit">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => confirmDelete(item.id)} className="text-gray-400 hover:text-black transition-[color,transform] active:scale-95 p-2" title="Delete">
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">No products found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
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
