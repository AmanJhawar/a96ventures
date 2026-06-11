"use client"

import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { Tags, Trash2 } from 'lucide-react'

const DEFAULT_CATEGORIES = ['Silver Idols', 'Silver Animals', 'Marble Photoframes', 'MMTC Bullions']

export default function AdminCategories() {
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [newCategoryInput, setNewCategoryInput] = useState('')

  useEffect(() => {
    const fetchCategories = async () => {
      setLoading(true)
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
    if (!val || categories.includes(val)) return

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

  const handleRemoveCategory = async (cat: string) => {
    if (!confirm(`Are you sure you want to remove the category "${cat}"? Products in this category will not be deleted but may be orphaned in the UI.`)) return
    
    const newCategories = categories.filter(c => c !== cat)
    setCategories(newCategories)

    try {
      await setDoc(doc(db, 'settings', 'categories'), { list: newCategories }, { merge: true })
    } catch (err) {
      console.error("Failed to remove category", err)
      alert("Failed to delete category. Please check your permissions.")
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
            {categories.map((cat) => (
              <div key={cat} className="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                <span className="font-medium text-gray-800">{cat}</span>
                <button
                  onClick={() => handleRemoveCategory(cat)}
                  className="text-gray-400 hover:text-red-600 transition-colors p-2"
                  title="Remove Category"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-gray-500 text-center py-6">No categories found. Add one above.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
