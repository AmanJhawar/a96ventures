"use client"

import { useState, useEffect, useRef } from 'react'
import { collection, setDoc, deleteDoc, doc, getDocs, getDoc, getFirestore } from 'firebase/firestore/lite'
import { app } from '@/lib/firebase/config'
const db = getFirestore(app)
import { Trash2, Plus, Box, Edit2, X, ChevronDown } from 'lucide-react'
import { ImageDropzone } from '@/components/image-dropzone'
import { ConfirmModal } from '@/components/confirm-modal'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

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

import { DEFAULT_CATEGORIES } from '@/lib/types'

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
  weight: string
  material?: string
  additionalImages?: string[]
  description: string
  imageFile: string
  orderIndex?: number
}

const inventorySchema = z.object({
  id: z.string().min(1, 'URL Key is required').regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens'),
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Product Name is required'),
  category: z.string().min(1, 'Category is required'),
  hasVariants: z.boolean(),
  weight: z.string().regex(/^\d+(\.\d+)?$/, 'Only numbers allowed').optional().or(z.literal('')),
  material: z.string().optional().or(z.literal('')),
  description: z.string().min(1, 'Description is required'),
  imageFile: z.string().min(1, 'Thumbnail image is required'),
  orderIndex: z.number().optional(),
  
  standardSizes: z.array(z.string()).optional(),
  customSizes: z.array(z.string()).optional(),
  standardPurities: z.array(z.string()).optional(),
  customPurities: z.array(z.string()).optional(),
  standardWeights: z.array(z.string()).optional(),
  customWeights: z.array(z.string()).optional(),
  standardStones: z.array(z.string()).optional(),
  customStones: z.array(z.string()).optional(),
  additionalImages: z.array(z.string()).optional()
})

type InventoryValues = z.infer<typeof inventorySchema>

const emptyForm: InventoryValues = {
  id: '', sku: '', name: '', category: '', hasVariants: false,
  standardSizes: [], customSizes: [], standardPurities: [], customPurities: [],
  standardWeights: [], customWeights: [], standardStones: [], customStones: [],
  weight: '', material: '', description: '', imageFile: '', additionalImages: []
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

export default function AdminInventory() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  
  const [customSizeInput, setCustomSizeInput] = useState('')
  const [customPurityInput, setCustomPurityInput] = useState('')
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryFocusedIndex, setCategoryFocusedIndex] = useState(-1)
  const categoryRef = useRef<HTMLDivElement>(null)

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<InventoryValues>({
    resolver: zodResolver(inventorySchema),
    defaultValues: emptyForm
  })

  const formValues = watch()
  const formCategory = watch('category')
  const formHasVariants = watch('hasVariants')

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) setCategoryOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (categoryOpen) {
      const idx = categories.findIndex(c => c === formCategory)
      setCategoryFocusedIndex(idx >= 0 ? idx : 0)
    } else {
      setCategoryFocusedIndex(-1)
    }
  }, [categoryOpen, formCategory, categories])

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
          setValue('category', categories[categoryFocusedIndex])
          setCategoryOpen(false) 
        }
        break
    }
  }

  const fetchData = async () => {
    try {
      const catDoc = await getDoc(doc(db, 'settings', 'categories'))
      if (catDoc.exists() && catDoc.data().list) {
        setCategories(catDoc.data().list)
      } else {
        setCategories(DEFAULT_CATEGORIES)
        await setDoc(doc(db, 'settings', 'categories'), { list: DEFAULT_CATEGORIES })
      }

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
    fetchData()
  }, [])

  const confirmDelete = (id: string) => setDeleteId(id)

  const executeDelete = async () => {
    if (!deleteId) return

    try {
      await deleteDoc(doc(db, 'catalog', deleteId))
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
    reset({
      ...item,
      weight: item.weight ? item.weight.replace(/[^\d.]/g, '') : '',
      orderIndex: item.orderIndex || undefined,
      standardSizes: item.standardSizes || [],
      customSizes: item.customSizes || [],
      standardPurities: item.standardPurities || [],
      customPurities: item.customPurities || [],
      standardWeights: item.standardWeights || [],
      customWeights: item.customWeights || [],
      standardStones: item.standardStones || [],
      customStones: item.customStones || [],
      additionalImages: item.additionalImages || []
    })
    setEditingId(item.id)
    setIsFormOpen(true)
  }

  const handleCancel = () => {
    setIsFormOpen(false)
    setEditingId(null)
    reset(emptyForm)
    setCustomSizeInput('')
    setCustomPurityInput('')
  }

  const handleAddNew = () => {
    reset(emptyForm)
    setEditingId(null)
    setIsFormOpen(true)
  }

  const onSubmit = async (data: InventoryValues) => {
    const docId = editingId || data.id

    try {
      if (!editingId) {
        const existingDoc = await getDoc(doc(db, 'catalog', docId))
        if (existingDoc.exists()) {
          alert(`A product with the ID "${docId}" already exists. Please choose a unique ID.`)
          return
        }
      }

      const { id: _id, ...payload } = data as any

      let totalSize = payload.imageFile ? payload.imageFile.length : 0
      if (payload.additionalImages) {
        payload.additionalImages.forEach((img: string) => {
          totalSize += img.length
        })
      }
      if (totalSize > 900000) {
        alert("Total image size exceeds the Firestore limit. Please remove or compress images before saving.")
        return
      }

      if (!payload.hasVariants) {
        payload.standardSizes = []; payload.customSizes = []; payload.standardWeights = []; payload.customWeights = []; payload.standardStones = []; payload.customStones = []
        payload.standardPurities = []; payload.customPurities = []
      }

      if (payload.weight) {
        payload.weight = payload.weight + 'g'
      }

      await setDoc(doc(db, 'catalog', docId), payload)

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
    if (hasStonesCategory(formCategory)) return ['standardStones', 'customStones'] as const
    if (formCategory?.includes('Bullion')) return ['standardWeights', 'customWeights'] as const
    return ['standardSizes', 'customSizes'] as const
  }

  const toggleSize = (size: string) => {
    const [stdKey] = getMatrixFields()
    const current = (formValues[stdKey] as string[]) || []
    setValue(stdKey, current.includes(size) ? current.filter(s => s !== size) : [...current, size])
  }

  const togglePurity = (p: string) => {
    const current = formValues.standardPurities || []
    setValue('standardPurities', current.includes(p) ? current.filter(x => x !== p) : [...current, p])
  }

  const addCustomSize = () => {
    const v = customSizeInput.trim()
    if (!v) return
    if (!/^\d+(\.\d+)?$/.test(v) && !hasStonesCategory(formCategory)) {
      alert('Only numeric values are allowed for custom sizes/weights.')
      return
    }
    const [, cstKey] = getMatrixFields()
    const current = (formValues[cstKey] as string[]) || []
    
    let finalV = v
    if (!hasStonesCategory(formCategory)) {
      finalV = formCategory?.includes('Bullion') ? `${v}g` : `${v}cm`
    }

    if (!current.includes(finalV)) {
      setValue(cstKey, [...current, finalV])
    }
    setCustomSizeInput('')
  }

  const removeCustomSize = (s: string) => {
    const [, cstKey] = getMatrixFields()
    setValue(cstKey, ((formValues[cstKey] as string[]) || []).filter(x => x !== s))
  }

  const addCustomPurity = () => {
    const val = customPurityInput.trim()
    if (!val) return
    if (!/^\d+(\.\d)?$/.test(val)) {
      alert('Only numeric values with up to one decimal point are allowed for purity.')
      return
    }
    const newCustoms = [...(formValues.customPurities || []), val]
    setValue('customPurities', Array.from(new Set(newCustoms)))
    setCustomPurityInput('')
  }

  const removeCustomPurity = (p: string) => {
    setValue('customPurities', (formValues.customPurities || []).filter(x => x !== p))
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
              onClick={handleAddNew}
              className="btn-primary flex items-center gap-2 whitespace-nowrap"
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
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="admin-label required">URL Key (ID)</label>
                <input
                  type="text"
                  {...register('id', {
                    onChange: (e) => {
                      e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '')
                      setValue('id', e.target.value)
                    }
                  })}
                  disabled={!!editingId}
                  className={`admin-input disabled:bg-gray-100 disabled:text-gray-500 ${errors.id ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                  placeholder="e.g., modern-chair"
                />
                {errors.id && <p className="text-gray-500 font-medium text-sm mt-1">{errors.id.message}</p>}
              </div>
              <div>
                <label className="admin-label required">SKU (Internal Code)</label>
                <input
                  type="text"
                  {...register('sku')}
                  className={`admin-input ${errors.sku ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                  placeholder="e.g., A96-001"
                />
                {errors.sku && <p className="text-gray-500 font-medium text-sm mt-1">{errors.sku.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="admin-label required">Product Name</label>
                <input
                  type="text"
                  {...register('name')}
                  className={`admin-input ${errors.name ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                  placeholder="e.g., Elegance Marble Vase"
                />
                {errors.name && <p className="text-gray-500 font-medium text-sm mt-1">{errors.name.message}</p>}
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
                    className={`admin-input flex items-center justify-between text-left ${errors.category ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                  >
                    <span className={formCategory ? 'text-black' : 'text-gray-400'}>
                      {formCategory || 'Select category'}
                    </span>
                    <ChevronDown size={16} className={`text-gray-400 transition-transform ${categoryOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {categoryOpen && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden origin-top animate-[fadeInUp_150ms_var(--ease-out)_forwards]">
                      <ul id="admin-category-listbox" role="listbox" className="m-0 p-0 list-none max-h-60 overflow-y-auto">
                        {categories.map((cat, idx) => (
                          <li key={cat} role="option" aria-selected={formCategory === cat}>
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => { setValue('category', cat, { shouldValidate: true }); setCategoryOpen(false) }}
                              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${categoryFocusedIndex === idx ? 'bg-gray-100' : ''
                                } ${formCategory === cat ? 'bg-gray-100 text-black font-semibold' : 'text-gray-500 hover:bg-gray-50'
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
                {errors.category && <p className="text-gray-500 font-medium text-sm mt-1">{errors.category.message}</p>}
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden transition-all duration-300">
              <div className={`p-5 flex items-center justify-between transition-colors duration-200 ${formHasVariants ? 'border-b border-gray-100 bg-gray-50/50' : ''}`}>
                <div>
                  <h3 className="text-sm font-semibold text-black">Inventory Variants</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Configure sizes, purities, or specific stones/weights.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formHasVariants}
                  onClick={() => setValue('hasVariants', !formHasVariants)}
                  className={`relative inline-flex h-[22px] w-[42px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out ${formHasVariants ? 'bg-black' : 'bg-gray-200'}`}
                >
                  <span className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${formHasVariants ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
                </button>
              </div>

              {formHasVariants && (
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 bg-white">
                  <div className={isNoPurityCategory(formCategory) ? 'md:col-span-2' : ''}>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">
                      {hasStonesCategory(formCategory) ? 'Available Stones' : formCategory?.includes('Bullion') ? 'Available Weights' : 'Available Sizes'}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-6">
                      {(hasStonesCategory(formCategory)
                        ? STANDARD_STONES
                        : formCategory?.includes('Bullion')
                          ? STANDARD_WEIGHTS
                          : STANDARD_SIZES
                      ).map(opt => (
                        <button
                          key={opt} type="button"
                          onClick={() => toggleSize(opt)}
                          className={`admin-pill ${getStandardSizeMatrix(formValues).includes(opt) ? 'admin-pill-active' : ''}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>

                    {getCustomSizeMatrix(formValues).length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {getCustomSizeMatrix(formValues).map(s => (
                          <span key={s} className="admin-pill admin-pill-active flex items-center gap-1.5">
                            {s}
                            <button type="button" onClick={() => removeCustomSize(s)} className="opacity-60 hover:opacity-100 transition-[opacity,transform] active:scale-[0.97]"><X size={12} /></button>
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
                      {hasStonesCategory(formCategory) ? 'Custom Stone' : formCategory?.includes('Bullion') ? 'Custom Weight' : 'Custom Size'}
                    </p>
                    <div className="flex items-end gap-3 max-w-sm">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={customSizeInput}
                          onChange={e => setCustomSizeInput(hasStonesCategory(formCategory) ? e.target.value : numericFilter(e.target.value))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSize() } }}
                          className="admin-input-underline"
                          placeholder={hasStonesCategory(formCategory) ? "e.g., Rose Quartz" : formCategory?.includes('Bullion') ? "e.g., 100" : "e.g., 20"}
                        />
                      </div>
                      <button type="button" onClick={addCustomSize} className="admin-btn-outline">
                        ADD
                      </button>
                    </div>
                  </div>

                  {!isNoPurityCategory(formCategory) && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Available Purities</p>
                      <div className="flex flex-wrap gap-2 mb-6">
                        {STANDARD_PURITIES.map(p => (
                          <button
                            key={p} type="button"
                            onClick={() => togglePurity(p)}
                            className={`admin-pill ${(formValues.standardPurities || []).includes(p) ? 'admin-pill-active' : ''}`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>

                      {(formValues.customPurities || []).length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {(formValues.customPurities || []).map(p => (
                            <span key={p} className="admin-pill admin-pill-active flex items-center gap-1.5">
                              {p}
                              <button type="button" onClick={() => removeCustomPurity(p)} className="opacity-60 hover:opacity-100 transition-[opacity,transform] active:scale-[0.97]"><X size={12} /></button>
                            </span>
                          ))}
                        </div>
                      )}

                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Custom Purity</p>
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="admin-label required">Approx Weight (in grams)</label>
                <input
                  type="text"
                  {...register('weight')}
                  disabled={formHasVariants}
                  className={`admin-input disabled:bg-gray-100 disabled:text-gray-500 ${errors.weight ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                  placeholder={formHasVariants ? 'Configured per variant' : 'e.g., 2500'}
                />
                {errors.weight && <p className="text-gray-500 font-medium text-sm mt-1">{errors.weight.message}</p>}
              </div>
              <div>
                <label className="admin-label">Material (Optional)</label>
                <input
                  type="text"
                  {...register('material')}
                  className={`admin-input ${errors.material ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                  placeholder="e.g., 999 Pure Silver"
                />
                {errors.material && <p className="text-gray-500 font-medium text-sm mt-1">{errors.material.message}</p>}
              </div>
              <div>
                <label className="admin-label">Display Order (Optional)</label>
                <input
                  type="number"
                  {...register('orderIndex', { valueAsNumber: true })}
                  className={`admin-input ${errors.orderIndex ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                  placeholder="Lowest numbers first"
                />
                {errors.orderIndex && <p className="text-gray-500 font-medium text-sm mt-1">{errors.orderIndex.message}</p>}
              </div>
            </div>

            <div>
              <label className="admin-label required">Description</label>
              <textarea
                rows={4}
                {...register('description')}
                className={`admin-input resize-none ${errors.description ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                placeholder="Enter detailed product description, materials used, and care instructions..."
              />
              {errors.description && <p className="text-gray-500 font-medium text-sm mt-1">{errors.description.message}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="admin-label required">Thumbnail Image (Portrait 2:3)</label>
                <Controller
                  name="imageFile"
                  control={control}
                  render={({ field }) => (
                    <ImageDropzone
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
                {errors.imageFile && <p className="text-gray-500 font-medium text-sm mt-1">{errors.imageFile.message}</p>}
              </div>

              <div>
                <label className="admin-label">Product Images (Landscape 3:2)</label>
                <Controller
                  name="additionalImages"
                  control={control}
                  render={({ field }) => {
                    const currentImages = field.value || []
                    return (
                      <div className="grid grid-cols-1 gap-6">
                        {currentImages.map((img, idx) => (
                          <ImageDropzone
                            key={idx}
                            value={img}
                            onChange={(url) => {
                              const newImages = [...currentImages]
                              if (url) {
                                newImages[idx] = url
                              } else {
                                newImages.splice(idx, 1)
                              }
                              field.onChange(newImages)
                            }}
                          />
                        ))}
                        {currentImages.length < 4 && (
                          <ImageDropzone
                            value=""
                            onChange={(url) => {
                              if (url) {
                                field.onChange([...currentImages, url])
                              }
                            }}
                          />
                        )}
                      </div>
                    )
                  }}
                />
              </div>
            </div>

            <div className="flex justify-end gap-4 mt-12">
              <button type="button" onClick={handleCancel} className="admin-btn-outline px-6">
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} className="btn-primary px-8 disabled:opacity-50">
                {isSubmitting ? 'Saving...' : (editingId ? 'Update Product' : 'Save Product')}
              </button>
            </div>
          </form>
        </div>
      )}

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
                    <th className="px-6 py-4 text-sm font-semibold text-gray-500">Sizes</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-500">Purities</th>
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
                            <img src={item.imageFile.startsWith('data:') || item.imageFile.startsWith('http') ? item.imageFile : `/assets/${item.imageFile}`} alt="Product" className="w-12 h-12 object-cover rounded-lg bg-[#f5f5f7]" />
                          ) : (
                            <div className="w-12 h-12 bg-[#f5f5f7] rounded-lg flex items-center justify-center">
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
                              <span key={p} className="text-xs border border-gray-200 px-1.5 py-0.5 rounded">{p}</span>
                            )) : <span className="text-xs text-gray-400">—</span>}
                          </div>
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
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">No products found.</td>
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
