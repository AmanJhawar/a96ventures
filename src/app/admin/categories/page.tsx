"use client"

import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, collection, query, where, getDocs, writeBatch, getFirestore } from 'firebase/firestore/lite'
import { app } from '@/lib/firebase/config'
import { Tags, Trash2, Edit2, X, Check } from 'lucide-react'
import { DEFAULT_CATEGORIES } from '@/lib/types'
import { ConfirmModal } from '@/components/confirm-modal'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const db = getFirestore(app)

const addCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').trim()
})
type AddCategoryValues = z.infer<typeof addCategorySchema>

export default function AdminCategories() {
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editInput, setEditInput] = useState('')
  const [deleteCategory, setDeleteCategory] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<AddCategoryValues>({
    resolver: zodResolver(addCategorySchema),
    defaultValues: { name: '' }
  })

  useEffect(() => {
    const fetchCategories = async () => {
    try {
        const catDoc = await getDoc(doc(db, 'settings', 'categories'))
        if (catDoc.exists() && catDoc.data().list) {
          setCategories(catDoc.data().list)
        } else {
          setCategories(DEFAULT_CATEGORIES)
          await setDoc(doc(db, 'settings', 'categories'), { list: DEFAULT_CATEGORIES })
        }
      } catch (err) {
        console.error("Error fetching categories", err)
      } finally {
        setLoading(false)
      }
    }
    fetchCategories()
  }, [])

  const onAddCategory = async (data: AddCategoryValues) => {
    const val = data.name
    if (categories.some(c => c.toLowerCase() === val.toLowerCase())) {
      alert("Category already exists (case-insensitive).")
      return
    }

    const newCategories = [...categories, val]
    setCategories(newCategories)
    reset()

    try {
      await setDoc(doc(db, 'settings', 'categories'), { list: newCategories }, { merge: true })
    } catch (err) {
      console.error("Failed to add category", err)
      alert("Failed to save category. Please check your permissions.")
    }
  }

  const confirmRemove = (cat: string) => setDeleteCategory(cat)

  const executeRemove = async () => {
    if (!deleteCategory) return
    const newCategories = categories.filter(c => c !== deleteCategory)
    setCategories(newCategories)

    try {
      await setDoc(doc(db, 'settings', 'categories'), { list: newCategories }, { merge: true })
    } catch (err) {
      console.error("Failed to remove category", err)
      alert("Failed to delete category. Please check your permissions.")
    } finally {
      setDeleteCategory(null)
    }
  }

  const startEdit = (idx: number, currentName: string) => {
    setEditingIndex(idx)
    setEditInput(currentName)
  }

  const cancelEdit = () => {
    setEditingIndex(null)
    setEditInput('')
  }

  const saveEdit = async (idx: number, oldName: string) => {
    const val = editInput.trim()
    if (!val || val === oldName) {
      cancelEdit()
      return
    }
    
    // Check if another category already has this name
    if (categories.some((c, i) => i !== idx && c.toLowerCase() === val.toLowerCase())) {
      alert("Another category with this name already exists.")
      return
    }

    const newCategories = [...categories]
    newCategories[idx] = val
    setCategories(newCategories)
    setEditingIndex(null)

    try {
      // 1. Update the categories list in settings
      await setDoc(doc(db, 'settings', 'categories'), { list: newCategories }, { merge: true })
      
      // 2. Batch update any products that have the old category name
      const q = query(collection(db, 'catalog'), where('category', '==', oldName))
      const snapshot = await getDocs(q)
      if (!snapshot.empty) {
        const batch = writeBatch(db)
        snapshot.forEach(docSnap => {
          batch.update(docSnap.ref, { category: val })
        })
        await batch.commit()
      }
    } catch (err) {
      console.error("Failed to update category", err)
      alert("Failed to completely update category. Please check your permissions.")
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-black mb-2 tracking-tight flex items-center gap-3">
            <Tags size={28} />
            Categories
          </h1>
          <p className="text-gray-500">Manage the product categories displayed on the storefront.</p>
        </div>
      </div>

      <div className="bg-white p-6 md:p-8 rounded-xl border border-gray-200 shadow-sm w-full">
        <div className="mb-8">
          <form onSubmit={handleSubmit(onAddCategory)} className="flex gap-4 items-start">
            <div className="flex-1">
              <input
                type="text"
                {...register('name')}
                placeholder="New Category Name..."
                className={`admin-input w-full ${errors.name ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
              />
              {errors.name && <p className="text-gray-500 font-medium text-sm mt-1">{errors.name.message}</p>}
            </div>
            <button type="submit" disabled={isSubmitting} className="admin-btn-primary whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100">
              {isSubmitting ? 'Adding...' : 'Add Category'}
            </button>
          </form>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {categories.map((cat, idx) => (
              <div key={`${cat}-${idx}`} className="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                {editingIndex === idx ? (
                  <div className="flex items-center gap-3 flex-1">
                    <input 
                      type="text" 
                      value={editInput}
                      onChange={e => setEditInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(idx, cat); if (e.key === 'Escape') cancelEdit(); }}
                      className="admin-input py-1 text-sm flex-1"
                      autoFocus
                    />
                    <div className="flex items-center gap-1 w-16 justify-end shrink-0">
                      <button onClick={() => saveEdit(idx, cat)} className="text-gray-400 hover:text-black p-2 transition-[color,transform] active:scale-[0.97]" title="Save">
                        <Check size={18} />
                      </button>
                      <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-500 p-2 transition-[color,transform] active:scale-[0.97]" title="Cancel">
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between flex-1 gap-3">
                    <span className="font-medium text-black flex-1 truncate">{cat}</span>
                    <div className="flex items-center gap-1 w-16 justify-end shrink-0">
                      <button
                        onClick={() => startEdit(idx, cat)}
                        className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97] p-2"
                        title="Edit Category"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => confirmRemove(cat)}
                        className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97] p-2"
                        title="Remove Category"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-gray-500 text-center py-6">No categories found. Add one above.</p>
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deleteCategory}
        title="Delete Category"
        description={`Are you sure you want to remove the category "${deleteCategory}"? Products in this category will not be deleted but may be orphaned in the UI.`}
        confirmText="Delete"
        onClose={() => setDeleteCategory(null)}
        onConfirm={executeRemove}
      />
    </div>
  )
}
