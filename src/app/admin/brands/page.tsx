"use client"

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { collection, addDoc, setDoc, deleteDoc, doc, getDocs, getFirestore } from 'firebase/firestore/lite'
import { app } from '@/lib/firebase/config'
import { Brand } from '@/lib/types'
import { Trash2, Plus, Bookmark, Edit2 } from 'lucide-react'
import { ImageDropzone } from '@/components/image-dropzone'
import { ConfirmModal } from '@/components/confirm-modal'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const db = getFirestore(app)

const brandSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sector: z.string().min(1, 'Sector is required'),
  description: z.string().min(1, 'Description is required'),
  logoFile: z.string().min(1, 'Brand logo is required')
})

type BrandValues = z.infer<typeof brandSchema>

export default function AdminBrands() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<BrandValues>({
    resolver: zodResolver(brandSchema),
    defaultValues: { name: '', sector: '', description: '', logoFile: '' }
  })

  useEffect(() => {
    let active = true
    const fetchBrands = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'brands'))
        if (!active) return
        const items: Brand[] = []
        querySnapshot.forEach((docSnap) => {
          items.push({ ...docSnap.data(), id: docSnap.id } as Brand)
        })
        setBrands(items)
      } catch (err) {
        console.error("Error fetching brands", err)
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchBrands()
    return () => { active = false }
  }, [])

  const confirmDelete = (id: string) => setDeleteId(id)

  const executeDelete = async () => {
    if (!deleteId) return
    try {
      await deleteDoc(doc(db, 'brands', String(deleteId)))
      setBrands(brands.filter(t => t.id !== deleteId))
    } catch (err) {
      console.error("Error deleting", err)
    } finally {
      setDeleteId(null)
    }
  }

  const handleEdit = (brand: Brand) => {
    setEditingId(brand.id)
    reset({
      name: brand.name,
      sector: brand.sector,
      description: brand.description,
      logoFile: brand.logoFile || ''
    })
    setIsFormOpen(true)
  }

  const handleCancel = () => {
    setIsFormOpen(false)
    setEditingId(null)
    reset({ name: '', sector: '', description: '', logoFile: '' })
  }

  const onSubmit = async (data: BrandValues) => {
    try {
      if (editingId) {
        await setDoc(doc(db, 'brands', editingId), data)
        setBrands(brands.map(b => b.id === editingId ? { id: editingId, ...data } as Brand : b))
      } else {
        const docRef = await addDoc(collection(db, 'brands'), data)
        setBrands([...brands, { id: docRef.id, ...data } as Brand])
      }
      handleCancel()
    } catch (err) {
      console.error("Error saving", err)
    }
  }

  const handleAddNew = () => {
    reset({ name: '', sector: '', description: '', logoFile: '' })
    setEditingId(null)
    setIsFormOpen(true)
  }

  return (
    <div>
      {!isFormOpen && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-black mb-2 tracking-tight flex items-center gap-3">
              <Bookmark size={28} />
              Brands Manager
            </h1>
            <p className="text-gray-500">Add or remove portfolio brands.</p>
          </div>
          <button 
            onClick={handleAddNew}
            className="admin-btn-primary flex items-center gap-2"
          >
            <Plus size={18} className="transition-transform" />
            Add Brand
          </button>
        </div>
      )}

      {isFormOpen && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-8 animate-[fadeInUp_300ms_var(--ease-out)_forwards]">
          <h2 className="text-xl font-semibold mb-6">{editingId ? 'Edit Brand' : 'Add New Brand'}</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="admin-label required">Name</label>
                <input 
                  type="text"
                  {...register('name')}
                  className={`admin-input ${errors.name ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                  placeholder="e.g., Acme Corp"
                />
                {errors.name && <p className="text-gray-500 font-medium text-sm mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="admin-label required">Sector</label>
                <input 
                  type="text"
                  {...register('sector')}
                  className={`admin-input ${errors.sector ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                  placeholder="e.g., Technology"
                />
                {errors.sector && <p className="text-gray-500 font-medium text-sm mt-1">{errors.sector.message}</p>}
              </div>
            </div>
            
            <div>
              <label className="admin-label required">Brand Logo</label>
              <Controller
                name="logoFile"
                control={control}
                render={({ field }) => (
                  <ImageDropzone 
                    value={field.value} 
                    onChange={field.onChange} 
                  />
                )}
              />
              {errors.logoFile && <p className="text-gray-500 font-medium text-sm mt-1">{errors.logoFile.message}</p>}
            </div>

            <div>
              <label className="admin-label required">Description</label>
              <textarea 
                rows={3}
                {...register('description')}
                className={`admin-input resize-none ${errors.description ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                placeholder="Enter brand background and portfolio details..."
              />
              {errors.description && <p className="text-gray-500 font-medium text-sm mt-1">{errors.description.message}</p>}
            </div>

            <div className="flex justify-end gap-4 mt-12">
              <button type="button" onClick={handleCancel} className="admin-btn-outline px-6">
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} className="admin-btn-primary disabled:opacity-50">
                {isSubmitting ? 'Saving...' : (editingId ? 'Update Brand' : 'Save Brand')}
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
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500">Name</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500">Sector</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500">Logo</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {brands.map((brand) => (
                  <tr key={brand.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-medium text-black">{brand.name}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-lg">{brand.sector}</span>
                    </td>
                    <td className="px-6 py-4">
                      {brand.logoFile ? (
                        <Image width={120} height={32} unoptimized src={brand.logoFile.startsWith('http') ? brand.logoFile : `/assets/${brand.logoFile}`} alt={brand.name} className="h-8 w-auto object-contain" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                          <Bookmark size={16} />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button 
                        onClick={() => handleEdit(brand)}
                        className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97] p-2"
                        title="Edit"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => confirmDelete(brand.id)}
                        className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97] p-2"
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
        )
      )}
      
      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Brand"
        description="Are you sure you want to delete this brand? This action cannot be undone."
        confirmText="Delete"
        onClose={() => setDeleteId(null)}
        onConfirm={executeDelete}
      />
    </div>
  )
}
