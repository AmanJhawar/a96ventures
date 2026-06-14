"use client"

import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, collection, query, where, getDocs, writeBatch, getFirestore } from 'firebase/firestore/lite'
import { app } from '@/lib/firebase/config'
import { Tags, Trash2, Edit2, X, Check } from 'lucide-react'
import { DEFAULT_CATEGORIES } from '@/lib/types'
import { ConfirmModal } from '@/components/confirm-modal'

const db = getFirestore(app)

export default function AdminCategories() {
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [newCategoryInput, setNewCategoryInput] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editInput, setEditInput] = useState('')
  const [deleteCategory, setDeleteCategory] = useState<string | null>(null)

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

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = newCategoryInput.trim()
    if (!val || categories.some(c => c.toLowerCase() === val.toLowerCase())) {
      if (val) alert("Category already exists (case-insensitive).")
      return
    }

    const newCategories = [...categories, val]
    setCategories(newCategories)
    setNewCategoryInput('')

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

      <div className="bg-white p-6 md:p-8 rounded-2xl border border-gray-200 shadow-sm max-w-2xl">
        <form onSubmit={handleAddCategory} className="flex gap-4 mb-8">
          <input
            type="text"
            value={newCategoryInput}
            onChange={e => setNewCategoryInput(e.target.value)}
            placeholder="New Category Name..."
            className="admin-input flex-1"
          />
          <button type="submit" className="admin-btn-primary whitespace-nowrap px-8">
            Add Category
          </button>
        </form>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {categories.map((cat, idx) => (
              <div key={`${cat}-${idx}`} className="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                {editingIndex === idx ? (
                  <div className="flex items-center gap-3 flex-1 mr-4">
                    <input 
                      type="text" 
                      value={editInput}
                      onChange={e => setEditInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(idx, cat); if (e.key === 'Escape') cancelEdit(); }}
                      className="admin-input py-1 text-sm flex-1"
                      autoFocus
                    />
                    <button onClick={() => saveEdit(idx, cat)} className="text-gray-400 hover:text-black p-1 transition-[color,transform] active:scale-[0.97]" title="Save">
                      <Check size={18} />
                    </button>
                    <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600 p-1 transition-[color,transform] active:scale-[0.97]" title="Cancel">
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="font-medium text-gray-800">{cat}</span>
                    <div className="flex items-center gap-1">
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
                  </>
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

