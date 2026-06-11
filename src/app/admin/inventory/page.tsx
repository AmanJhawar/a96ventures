"use client"

import { useState, useEffect } from 'react'
import { collection, setDoc, deleteDoc, doc, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { Trash2, Plus, Box, Edit2 } from 'lucide-react'
import { ImageDropzone } from '@/components/image-dropzone'

export interface InventoryItem {
  id: string; // slug is used as id
  slug: string;
  sku: string;
  name: string;
  hasSizeVariants: boolean;
  standardSizes: string[];
  customSizes: string;
  weight: string;
  description: string;
  imageFile: string;
}

const STANDARD_SIZES_OPTIONS = ['4cm', '7cm', '10cm', '12.5cm']

export default function AdminInventory() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState<Partial<InventoryItem>>({
    slug: '', sku: '', name: '', hasSizeVariants: false, standardSizes: [], customSizes: '', weight: '', description: '', imageFile: ''
  })

  const fetchItems = async () => {
    setLoading(true)
    try {
      const querySnapshot = await getDocs(collection(db, 'catalog'))
      const fetched: InventoryItem[] = []
      querySnapshot.forEach((docSnap) => {
        fetched.push({ id: docSnap.id, ...docSnap.data() } as InventoryItem)
      })
      setItems(fetched)
    } catch (err) {
      console.error("Error fetching inventory", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return
    try {
      await deleteDoc(doc(db, 'catalog', id))
      setItems(items.filter(i => i.id !== id))
    } catch (err) {
      console.error("Error deleting", err)
    }
  }

  const handleEdit = (item: InventoryItem) => {
    setFormData(item)
    setEditingId(item.id)
    setIsFormOpen(true)
  }

  const handleCancel = () => {
    setIsFormOpen(false)
    setEditingId(null)
    setFormData({ slug: '', sku: '', name: '', hasSizeVariants: false, standardSizes: [], customSizes: '', weight: '', description: '', imageFile: '' })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!formData.slug) {
        alert("Slug is required!")
        return
      }

      const docId = editingId || formData.slug
      const docRef = doc(db, 'catalog', docId)
      
      const payload = { ...formData }
      if (!payload.hasSizeVariants) {
        payload.standardSizes = []
        payload.customSizes = ''
      }

      await setDoc(docRef, payload)
      
      if (editingId) {
        setItems(items.map(i => i.id === editingId ? { id: docId, ...payload } as InventoryItem : i))
      } else {
        setItems([...items, { id: docId, ...payload } as InventoryItem])
      }
      
      handleCancel()
    } catch (err) {
      console.error("Error saving", err)
    }
  }

  const toggleSize = (size: string) => {
    const current = formData.standardSizes || []
    if (current.includes(size)) {
      setFormData({ ...formData, standardSizes: current.filter(s => s !== size) })
    } else {
      setFormData({ ...formData, standardSizes: [...current, size] })
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-black mb-2 tracking-tight flex items-center gap-3">
            <Box size={28} />
            Inventory Manager
          </h1>
          <p className="text-gray-500">Manage catalog products and sizing variants.</p>
        </div>
        <button 
          onClick={() => isFormOpen ? handleCancel() : setIsFormOpen(true)}
          className="bg-black text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
        >
          <Plus size={18} className={isFormOpen ? "rotate-45 transition-transform" : "transition-transform"} />
          {isFormOpen ? 'Cancel' : 'Add Product'}
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm mb-8 animate-[fadeInUp_300ms_var(--ease-out)_forwards]">
          <h2 className="text-xl font-semibold mb-6">{editingId ? 'Edit Product' : 'Add New Product'}</h2>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">URL Slug</label>
                <input 
                  type="text" required
                  disabled={!!editingId}
                  value={formData.slug} onChange={e => setFormData({...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '')})}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100 disabled:text-gray-500"
                  placeholder="e.g., modern-chair"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">SKU (Internal Code)</label>
                <input 
                  type="text" required
                  value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="e.g., A96-001"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Product Name</label>
              <input 
                type="text" required
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div className="bg-gray-50 p-5 rounded-xl border border-gray-100">
              <label className="flex items-center cursor-pointer mb-4">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 rounded border-gray-300 text-black focus:ring-black mr-3"
                  checked={formData.hasSizeVariants}
                  onChange={e => setFormData({...formData, hasSizeVariants: e.target.checked})}
                />
                <span className="font-medium text-gray-900">Enable Size Variants</span>
              </label>

              {formData.hasSizeVariants && (
                <div className="pl-8 space-y-4 border-l-2 border-gray-200 ml-2 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Standard Sizes</label>
                    <div className="flex flex-wrap gap-3">
                      {STANDARD_SIZES_OPTIONS.map(size => (
                        <label key={size} className="flex items-center">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded border-gray-300 text-black focus:ring-black mr-2"
                            checked={(formData.standardSizes || []).includes(size)}
                            onChange={() => toggleSize(size)}
                          />
                          <span className="text-sm text-gray-700">{size}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Custom Sizes (comma separated)</label>
                    <input 
                      type="text"
                      value={formData.customSizes} onChange={e => setFormData({...formData, customSizes: e.target.value})}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                      placeholder="e.g., 15cm, 20cm"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Approx Weight</label>
                <input 
                  type="text" required
                  value={formData.weight} onChange={e => setFormData({...formData, weight: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="e.g., 2.5 kg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea 
                  required rows={4}
                  value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Product Image</label>
              <ImageDropzone 
                value={formData.imageFile || ''} 
                onChange={(url) => setFormData({...formData, imageFile: url})} 
                path="catalog" 
              />
            </div>

            <button type="submit" className="bg-black text-white px-6 py-2.5 rounded-lg font-medium hover:bg-gray-800">
              {editingId ? 'Update Product' : 'Save Product'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Image</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Product Name / Slug</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">SKU</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Variants</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
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
                      <div className="text-xs text-gray-500 mt-1">{item.slug}</div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-600">{item.sku}</td>
                    <td className="px-6 py-4">
                      {item.hasSizeVariants ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-md font-medium">Enabled</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md">None</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button 
                        onClick={() => handleEdit(item)}
                        className="text-gray-400 hover:text-blue-600 transition-colors p-2"
                        title="Edit"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(item.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors p-2"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      No products found.
                    </td>
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
