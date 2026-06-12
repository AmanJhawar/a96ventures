"use client"

import { useState, useEffect } from 'react'
import { collection, addDoc, setDoc, deleteDoc, doc, getDocs } from 'firebase/firestore/lite'
import { db } from '@/lib/firebase/config'
import { Brand } from '@/lib/types'
import { Trash2, Plus, Bookmark, Edit2 } from 'lucide-react'
import { ImageDropzone } from '@/components/image-dropzone'

export default function AdminBrands() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<Brand>>({
    name: '', sector: '', description: '', logoFile: ''
  })

  const fetchBrands = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'brands'))
      const items: Brand[] = []
      querySnapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Brand)
      })
      setBrands(items)
    } catch (err) {
      console.error("Error fetching brands", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBrands()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this brand?')) return
    try {
      await deleteDoc(doc(db, 'brands', id))
      setBrands(brands.filter(t => t.id !== id))
    } catch (err) {
      console.error("Error deleting", err)
    }
  }

  const handleEdit = (brand: Brand) => {
    setFormData(brand)
    setEditingId(brand.id)
    setIsFormOpen(true)
  }

  const handleCancel = () => {
    setIsFormOpen(false)
    setEditingId(null)
    setFormData({ name: '', sector: '', description: '', logoFile: '' })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingId) {
        await setDoc(doc(db, 'brands', editingId), formData)
        setBrands(brands.map(b => b.id === editingId ? { id: editingId, ...formData } as Brand : b))
      } else {
        const docRef = await addDoc(collection(db, 'brands'), formData)
        setBrands([...brands, { id: docRef.id, ...formData } as Brand])
      }
      handleCancel()
    } catch (err) {
      console.error("Error saving", err)
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-black mb-2 tracking-tight flex items-center gap-3">
            <Bookmark size={28} />
            Brands Manager
          </h1>
          <p className="text-gray-500">Add or remove portfolio brands.</p>
        </div>
        <button 
          onClick={() => isFormOpen ? handleCancel() : setIsFormOpen(true)}
          className="admin-btn-primary flex items-center gap-2"
        >
          <Plus size={18} className={isFormOpen ? "rotate-45 transition-transform" : "transition-transform"} />
          {isFormOpen ? 'Cancel' : 'Add Brand'}
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm mb-8 animate-[fadeInUp_300ms_var(--ease-out)_forwards]">
          <h2 className="text-xl font-semibold mb-6">{editingId ? 'Edit Brand' : 'Add New Brand'}</h2>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="admin-label required">Name</label>
                <input 
                  type="text" required
                  value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                  className="admin-input"
                />
              </div>
              <div>
                <label className="admin-label required">Sector</label>
                <input 
                  type="text" required
                  value={formData.sector} onChange={e => setFormData({...formData, sector: e.target.value})}
                  className="admin-input"
                />
              </div>
            </div>
            
            <div>
              <label className="admin-label required">Brand Logo</label>
              <ImageDropzone 
                value={formData.logoFile || ''} 
                onChange={(url) => setFormData({...formData, logoFile: url})} 
              />
            </div>

            <div>
              <label className="admin-label required">Description</label>
              <textarea 
                required rows={3}
                value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                className="admin-input resize-none"
              />
            </div>

            <button type="submit" className="admin-btn-primary">
              {editingId ? 'Update Brand' : 'Save Brand'}
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
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Name</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Sector</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Logo</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {brands.map((brand) => (
                  <tr key={brand.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-medium text-black">{brand.name}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md">{brand.sector}</span>
                    </td>
                    <td className="px-6 py-4">
                      {brand.logoFile ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={brand.logoFile.startsWith('data:') || brand.logoFile.startsWith('http') ? brand.logoFile : `/assets/${brand.logoFile}`} alt={brand.name} className="h-8 object-contain" />
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center text-gray-400">
                          <Bookmark size={16} />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button 
                        onClick={() => handleEdit(brand)}
                        className="text-gray-400 hover:text-blue-600 transition-colors p-2"
                        title="Edit"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(brand.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors p-2"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {brands.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                      No brands found.
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
