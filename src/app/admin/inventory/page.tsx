"use client"

import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, getDocs, collection, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { Trash2, Plus, Box, Edit2, X, ChevronDown, Settings } from 'lucide-react'
import { ImageDropzone } from '@/components/image-dropzone'

const STANDARD_SIZES = ['4cm', '7cm', '10cm', '12.5cm']
const STANDARD_PURITIES = ['92.5', '80.0']
const DEFAULT_CATEGORIES = ['Silver Idols', 'Silver Animals', 'Marble Photoframes', 'MMTC Bullions']

interface InventoryItem {
  id: string
  slug: string
  sku: string
  name: string
  category: string
  hasVariants: boolean
  standardSizes: string[]
  customSizes: string[]
  standardPurities: string[]
  customPurities: string[]
  weight: string
  description: string
  imageFile: string
}

const emptyForm: Partial<InventoryItem> = {
  slug: '', sku: '', name: '', category: '', hasVariants: false,
  standardSizes: [], customSizes: [], standardPurities: [], customPurities: [],
  weight: '', description: '', imageFile: ''
}

export default function AdminInventory() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<InventoryItem>>({ ...emptyForm })
  const [customSizeInput, setCustomSizeInput] = useState('')
  const [customPurityInput, setCustomPurityInput] = useState('')
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false)
  const [newCategoryInput, setNewCategoryInput] = useState('')

  const fetchData = async () => {
    setLoading(true)
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
      snap.forEach((d) => fetched.push({ id: d.id, ...d.data() } as InventoryItem))
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

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product?')) return
    await deleteDoc(doc(db, 'catalog', id))
    setItems(items.filter(i => i.id !== id))
  }

  const handleEdit = (item: InventoryItem) => {
    setFormData(item)
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
    if (!formData.slug) { alert("Slug is required!"); return }
    const docId = editingId || formData.slug
    const payload = { ...formData }
    if (!payload.hasVariants) {
      payload.standardSizes = []; payload.customSizes = []
      payload.standardPurities = []; payload.customPurities = []
    }
    await setDoc(doc(db, 'catalog', docId), payload)
    if (editingId) {
      setItems(items.map(i => i.id === editingId ? { id: docId, ...payload } as InventoryItem : i))
    } else {
      setItems([...items, { id: docId, ...payload } as InventoryItem])
    }
    handleCancel()
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
    const formatted = `${v}cm`
    if (!current.includes(formatted)) {
      setFormData({ ...formData, customSizes: [...current, formatted] })
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

  // --- Category Management ---
  const handleAddCategory = async () => {
    const val = newCategoryInput.trim()
    if (!val || categories.includes(val)) return
    
    const newCategories = [...categories, val]
    setCategories(newCategories)
    setNewCategoryInput('')
    
    try {
      await setDoc(doc(db, 'settings', 'categories'), { list: newCategories }, { merge: true })
    } catch (err) {
      console.error("Failed to add category", err)
    }
  }

  const handleRemoveCategory = async (cat: string) => {
    if (!confirm(`Are you sure you want to remove the category "${cat}"?`)) return
    const newCategories = categories.filter(c => c !== cat)
    setCategories(newCategories)
    
    try {
      await setDoc(doc(db, 'settings', 'categories'), { list: newCategories }, { merge: true })
    } catch (err) {
      console.error("Failed to remove category", err)
    }
  }

  const numericFilter = (val: string) => val.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1')

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-black mb-2 tracking-tight flex items-center gap-3">
            <Box size={28} />
            Inventory Manager
          </h1>
          <p className="text-gray-500">Manage catalog products, sizes and purity variants.</p>
        </div>
        <button
          onClick={() => isFormOpen ? handleCancel() : setIsFormOpen(true)}
          className="admin-btn-primary flex items-center gap-2"
        >
          <Plus size={18} className={isFormOpen ? "rotate-45 transition-transform" : "transition-transform"} />
          {isFormOpen ? 'Cancel' : 'Add Product'}
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm mb-8 animate-[fadeInUp_300ms_var(--ease-out)_forwards]">
          <h2 className="text-xl font-semibold mb-6">{editingId ? 'Edit Product' : 'Add New Product'}</h2>
          <form onSubmit={handleSave} className="space-y-6">
            {/* Row 1: Slug + SKU */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="admin-label required">URL Slug</label>
                <input
                  type="text" required disabled={!!editingId}
                  value={formData.slug}
                  onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '') })}
                  className="admin-input disabled:bg-gray-100 disabled:text-gray-500"
                  placeholder="e.g., modern-chair"
                />
              </div>
              <div>
                <label className="admin-label required">SKU (Internal Code)</label>
                <input
                  type="text" required
                  value={formData.sku}
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
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="admin-label required mb-0">Category</label>
                  <button 
                    type="button" 
                    onClick={() => setIsManageCategoriesOpen(!isManageCategoriesOpen)}
                    className="text-[0.65rem] uppercase font-bold tracking-wider text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <Settings size={12} />
                    Manage
                  </button>
                </div>
                
                {isManageCategoriesOpen ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 animate-[fadeInUp_200ms_var(--ease-out)_forwards]">
                    <div className="flex flex-wrap gap-2 mb-4">
                      {categories.map(cat => (
                        <span key={cat} className="admin-pill admin-pill-active flex items-center gap-1.5 text-xs">
                          {cat}
                          <button type="button" onClick={() => handleRemoveCategory(cat)} className="opacity-60 hover:opacity-100"><X size={12} /></button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={newCategoryInput}
                        onChange={e => setNewCategoryInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory() } }}
                        placeholder="New category..."
                        className="admin-input py-1.5 px-3 text-sm flex-1"
                      />
                      <button type="button" onClick={handleAddCategory} className="admin-btn-primary py-1.5 px-3 text-xs">Add</button>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
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
                        {categories.map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => { setFormData({ ...formData, category: cat }); setCategoryOpen(false) }}
                            className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                              formData.category === cat
                                ? 'bg-black text-white'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
                <span className="text-sm font-medium text-gray-900 tracking-wide uppercase">Product Has Variants (Size, Purity)</span>
              </label>

              {formData.hasVariants && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
                  {/* ── Size Column ── */}
                  <div>
                    <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-4">Available Sizes</p>
                    <div className="flex flex-wrap gap-2 mb-6">
                      {STANDARD_SIZES.map(size => (
                        <button
                          key={size} type="button"
                          onClick={() => toggleSize(size)}
                          className={`admin-pill ${(formData.standardSizes || []).includes(size) ? 'admin-pill-active' : ''}`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>

                    {/* Custom sizes already added */}
                    {(formData.customSizes || []).length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {(formData.customSizes || []).map(s => (
                          <span key={s} className="admin-pill admin-pill-active flex items-center gap-1.5">
                            {s}
                            <button type="button" onClick={() => removeCustomSize(s)} className="opacity-60 hover:opacity-100"><X size={12} /></button>
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-3">Custom Size (cm)</p>
                    <div className="flex items-end gap-3">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={customSizeInput}
                          onChange={e => setCustomSizeInput(numericFilter(e.target.value))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSize() } }}
                          className="admin-input-underline"
                          placeholder="e.g., 20"
                        />
                      </div>
                      <button type="button" onClick={addCustomSize} className="admin-btn-outline">
                        ADD
                      </button>
                    </div>
                  </div>

                  {/* ── Purity Column ── */}
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
                            <button type="button" onClick={() => removeCustomPurity(p)} className="opacity-60 hover:opacity-100"><X size={12} /></button>
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
                          placeholder="99.9"
                        />
                      </div>
                      <button type="button" onClick={addCustomPurity} className="admin-btn-outline">
                        ADD
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Row 3: Weight + Description */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="admin-label required">Approx Weight</label>
                <input
                  type="text" required
                  value={formData.weight}
                  onChange={e => setFormData({ ...formData, weight: e.target.value })}
                  className="admin-input"
                  placeholder="e.g., 2.5 kg"
                />
              </div>
              <div>
                <label className="admin-label required">Description</label>
                <textarea
                  required rows={4}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="admin-input resize-none"
                />
              </div>
            </div>

            {/* Image */}
            <div>
              <label className="admin-label required">Product Image</label>
              <ImageDropzone
                value={formData.imageFile || ''}
                onChange={(url) => setFormData({ ...formData, imageFile: url })}
                path="catalog"
              />
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
                {items.map((item) => {
                  const allSizes = [...(item.standardSizes || []), ...(item.customSizes || [])]
                  const allPurities = [...(item.standardPurities || []), ...(item.customPurities || [])]
                  return (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="px-6 py-4">
                        {item.imageFile ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.imageFile} alt="Product" className="w-12 h-12 object-cover rounded-md bg-gray-100" />
                        ) : (
                          <div className="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center">
                            <Box size={20} className="text-gray-400" />
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-black">{item.name}</div>
                        <div className="text-xs text-gray-500 mt-1">{item.sku} · /{item.slug}</div>
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
                        <button onClick={() => handleEdit(item)} className="text-gray-400 hover:text-blue-600 transition-colors p-2" title="Edit">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="text-gray-400 hover:text-red-600 transition-colors p-2" title="Delete">
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
    </div>
  )
}
