"use client"

import { useState, useEffect, useRef, useMemo } from 'react'
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
const hasStonesCategory = (category?: string) => {
  if (!category) return false
  const c = category.toLowerCase()
  return c.includes('marble') || c.includes('photoframe')
}

const isNoPurityCategory = (category?: string) => {
  if (!category) return false
  return hasStonesCategory(category) || category.includes('Bullion')
}

const getSizeMatrix = (item: Partial<InventoryItem>) => {
  if (hasStonesCategory(item.category)) return [...(item.standardStones || []), ...(item.customStones || [])]
  if (item.category?.includes('Bullion')) return [...(item.standardWeights || []), ...(item.customWeights || [])]
  return [...(item.standardSizes || []), ...(item.customSizes || [])]
}

const getStandardSizeMatrix = (item: Partial<InventoryItem>) => {
  if (hasStonesCategory(item.category)) return item.standardStones || []
  if (item.category?.includes('Bullion')) return item.standardWeights || []
  return item.standardSizes || []
}

const getCustomSizeMatrix = (item: Partial<InventoryItem>) => {
  if (hasStonesCategory(item.category)) return item.customStones || []
  if (item.category?.includes('Bullion')) return item.customWeights || []
  return item.customSizes || []
}

// A variant combination derived from the selected dimensions.
// `attrs` is the structured definition stored against each SKU.
// `key` is a stable string used only to key the live form state while editing.
// `label` is what the admin sees on the variant card.
type VariantCombo = { key: string; label: string; attrs: VariantDetail }

const buildVariantCombos = (item: Partial<InventoryItem>): VariantCombo[] => {
  const stones = hasStonesCategory(item.category)
  const bullion = !!item.category?.includes('Bullion')
  const noPurity = stones || bullion

  if (stones) {
    const all = [...(item.standardStones || []), ...(item.customStones || [])]
    return all.map(s => ({ key: `stone:${s}`, label: s, attrs: { stone: s } }))
  }

  if (bullion) {
    const all = [...(item.standardWeights || []), ...(item.customWeights || [])]
    return all.map(w => ({ key: `weight:${w}`, label: w, attrs: { weight: w } }))
  }

  const sizes = [...(item.standardSizes || []), ...(item.customSizes || [])]
  const purities = noPurity ? [] : [...(item.standardPurities || []), ...(item.customPurities || [])]
  if (sizes.length === 0 || purities.length === 0) return []

  const combos: VariantCombo[] = []
  sizes.forEach(s =>
    purities.forEach(p =>
      combos.push({ key: `size:${s}|purity:${p}`, label: `${s} | ${p}`, attrs: { size: s, purity: p } })
    )
  )
  return combos
}
import { DEFAULT_CATEGORIES, type VariantDetail } from '@/lib/types'

interface InventoryItem {
  id: string
  sku: string
  name: string
  category: string
  hasVariants: boolean
  standardSizes?: string[]
  customSizes?: string[]
  standardPurities?: string[]
  customPurities?: string[]
  standardWeights?: string[]
  customWeights?: string[]
  standardStones?: string[]
  customStones?: string[]
  variantSkus?: Record<string, VariantDetail>
  variantImages?: Record<string, string[]>
  weight: string
  material?: string
  additionalImages?: string[]
  description: string
  imageFile: string
  orderIndex?: number
}

const emptyForm: Partial<InventoryItem> = {
  id: '', sku: '', name: '', category: '', hasVariants: false,
  standardSizes: [], customSizes: [], standardPurities: [], customPurities: [],
  standardWeights: [], customWeights: [], standardStones: [], customStones: [],
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
  // Transient per-variant entry, keyed by the stable combo key (not the SKU,
  // which would churn on every keystroke). Serialised to variantSkus on save.
  const [variantSkuInputs, setVariantSkuInputs] = useState<Record<string, string>>({})
  const [variantWeightInputs, setVariantWeightInputs] = useState<Record<string, string>>({})
  const [variantImageInputs, setVariantImageInputs] = useState<Record<string, string[]>>({})
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

  const combos = useMemo(() => buildVariantCombos(formData), [formData])

  // Clean up orphaned variant inputs when attributes are deselected
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!isFormOpen) return
    const validKeys = new Set(combos.map(c => c.key))
    
    setVariantSkuInputs(prev => {
      let changed = false
      const next = { ...prev }
      for (const k in next) if (!validKeys.has(k)) { delete next[k]; changed = true }
      return changed ? next : prev
    })
    
    setVariantWeightInputs(prev => {
      let changed = false
      const next = { ...prev }
      for (const k in next) if (!validKeys.has(k)) { delete next[k]; changed = true }
      return changed ? next : prev
    })

    setVariantImageInputs(prev => {
      let changed = false
      const next = { ...prev }
      for (const k in next) if (!validKeys.has(k)) { delete next[k]; changed = true }
      return changed ? next : prev
    })
  }, [combos, isFormOpen])

  const handleEdit = (item: InventoryItem) => {
    setFormData({
      ...item,
      orderIndex: item.orderIndex || 0
    })
    // Rebuild the transient combo-keyed maps from the stored SKU-keyed data so
    // each variant card repopulates its SKU and weight fields.
    const skuInputs: Record<string, string> = {}
    const weightInputs: Record<string, string> = {}
    const combos = buildVariantCombos(item)
    if (item.variantSkus) {
      for (const [sku, detail] of Object.entries(item.variantSkus)) {
        const match = combos.find(c =>
          c.attrs.size === detail.size &&
          c.attrs.purity === detail.purity &&
          c.attrs.stone === detail.stone
        )
        if (match) {
          skuInputs[match.key] = sku
          weightInputs[match.key] = detail.weight || ''
        }
      }
    }
    setVariantSkuInputs(skuInputs)
    setVariantWeightInputs(weightInputs)
    setVariantImageInputs(item.variantImages || {})
    setEditingId(item.id)
    setIsFormOpen(true)
  }

  const handleCancel = () => {
    setIsFormOpen(false)
    setEditingId(null)
    setFormData({ ...emptyForm })
    setCustomSizeInput('')
    setCustomPurityInput('')
    setVariantSkuInputs({})
    setVariantWeightInputs({})
    setVariantImageInputs({})
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

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, ...payload } = formData

      let totalSize = payload.imageFile ? payload.imageFile.length : 0
      if (payload.additionalImages) {
        payload.additionalImages.forEach(img => {
          totalSize += img.length
        })
      }
      if (totalSize > 900000) {
        alert("Total image size exceeds the Firestore limit. Please remove or compress images before saving.")
        return
      }

      if (!formData.hasVariants) {
        payload.standardSizes = []; payload.customSizes = []; payload.standardWeights = []; payload.customWeights = []; payload.standardStones = []; payload.customStones = []
        payload.standardPurities = []; payload.customPurities = []
        payload.variantSkus = {}
        payload.variantImages = {}
      } else {
        const combos = buildVariantCombos(formData)
        if (combos.length === 0) {
          alert('Select the variant options (sizes/purities, stones, or weights) before saving.')
          return
        }

        // Bullion variants are keyed by weight, so the weight field is implied
        // by the combo itself and is not collected separately.
        const isBullion = !!formData.category?.includes('Bullion')
        const variantSkus: Record<string, VariantDetail> = {}
        const seenSkus = new Set<string>()

        for (const combo of combos) {
          const sku = (variantSkuInputs[combo.key] || '').trim()
          if (!sku) {
            alert(`Variant SKU for "${combo.label}" is required.`)
            return
          }
          if (seenSkus.has(sku)) {
            alert(`Duplicate variant SKU "${sku}". Each variant must have a unique SKU.`)
            return
          }
          seenSkus.add(sku)

          const detail: VariantDetail = { ...combo.attrs }
          if (!isBullion) {
            const w = numericFilter(variantWeightInputs[combo.key] || '').trim()
            if (!w) {
              alert(`Approx weight for "${combo.label}" is required.`)
              return
            }
            detail.weight = w
          }
          variantSkus[sku] = detail
        }

        payload.variantSkus = variantSkus
        
        // Serialize variant images, filtering out empty arrays and empty URLs
        const cleanedImages: Record<string, string[]> = {}
        for (const [key, imgs] of Object.entries(variantImageInputs)) {
          const valid = imgs.filter(Boolean)
          if (valid.length > 0) cleanedImages[key] = valid
        }
        payload.variantImages = cleanedImages
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

  const getMatrixFields = () => {
    if (hasStonesCategory(formData.category)) return ['standardStones', 'customStones'] as const
    if (formData.category?.includes('Bullion')) return ['standardWeights', 'customWeights'] as const
    return ['standardSizes', 'customSizes'] as const
  }

  const toggleSize = (size: string) => {
    const [stdKey] = getMatrixFields()
    const current = (formData[stdKey] as string[]) || []
    setFormData({ ...formData, [stdKey]: current.includes(size) ? current.filter(s => s !== size) : [...current, size] })
  }

  const togglePurity = (p: string) => {
    const current = formData.standardPurities || []
    setFormData({ ...formData, standardPurities: current.includes(p) ? current.filter(x => x !== p) : [...current, p] })
  }

  const addCustomSize = () => {
    const v = customSizeInput.trim()
    if (!v) return
    if (!/^\d+(\.\d+)?$/.test(v)) {
      alert('Only numeric values are allowed for custom sizes/weights.')
      return
    }
    const [, cstKey] = getMatrixFields()
    const current = (formData[cstKey] as string[]) || []
    if (!current.includes(v)) {
      setFormData({ ...formData, [cstKey]: [...current, v] })
    }
    setCustomSizeInput('')
  }

  const removeCustomSize = (s: string) => {
    const [, cstKey] = getMatrixFields()
    setFormData({ ...formData, [cstKey]: ((formData[cstKey] as string[]) || []).filter(x => x !== s) })
  }

  const addCustomPurity = () => {
    const val = customPurityInput.trim()
    if (!val) return
    if (!/^\d+(\.\d)?$/.test(val)) {
      alert('Only numeric values with up to one decimal point are allowed for purity.')
      return
    }
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
                              onClick={() => { setFormData({ ...formData, category: cat }); setCategoryOpen(false) }}
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
                  onClick={() => setFormData({ ...formData, hasVariants: !formData.hasVariants })}
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
                              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                                {hasStonesCategory(formData.category) || isBullion ? 'Image Overrides (All)' : 'Image Override (Last Image)'}
                              </label>
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
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
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
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.imageFile.startsWith('data:') || item.imageFile.startsWith('http') ? item.imageFile : `/assets/${item.imageFile}`} alt="Product" className="w-12 h-auto aspect-[3/4] object-cover rounded-md bg-[#f5f5f7]" />
                          ) : (
                            <div className="w-12 h-auto aspect-[3/4] bg-[#f5f5f7] rounded-md flex items-center justify-center">
                              <Box size={20} className="text-gray-400" />
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-black">{item.name}</div>
                          <div className="text-xs text-gray-500 mt-1">{item.sku} · /{item.id}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-md whitespace-nowrap">{item.category}</span>
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
