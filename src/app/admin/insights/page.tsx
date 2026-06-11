"use client"

import { useState, useEffect } from 'react'
import { collection, setDoc, deleteDoc, doc, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { Insight } from '@/data/insights'
import { Trash2, Plus, FileText, Edit2 } from 'lucide-react'

export default function AdminInsights() {
  const [insights, setInsights] = useState<(Insight & { id: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState<Partial<Insight>>({
    title: '', date: '', category: '', excerpt: '', readTime: ''
  })

  const fetchInsights = async () => {
    setLoading(true)
    try {
      const querySnapshot = await getDocs(collection(db, 'insights'))
      const items: (Insight & { id: string })[] = []
      querySnapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as (Insight & { id: string }))
      })
      setInsights(items)
    } catch (err) {
      console.error("Error fetching insights", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInsights()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this insight?')) return
    try {
      await deleteDoc(doc(db, 'insights', id))
      setInsights(insights.filter(i => i.id !== id))
    } catch (err) {
      console.error("Error deleting", err)
    }
  }

  const handleEdit = (insight: Insight & { id: string }) => {
    setFormData(insight)
    setEditingId(insight.id)
    setIsFormOpen(true)
  }

  const handleCancel = () => {
    setIsFormOpen(false)
    setEditingId(null)
    setFormData({ title: '', date: '', category: '', excerpt: '', readTime: '' })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!formData.title) return
      
      const docId = editingId || formData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const docRef = doc(db, 'insights', docId)
      
      await setDoc(docRef, formData)
      
      if (editingId) {
        setInsights(insights.map(i => i.id === editingId ? { id: docId, ...formData } as (Insight & { id: string }) : i))
      } else {
        setInsights([...insights, { id: docId, ...formData } as (Insight & { id: string })])
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
            <FileText size={28} />
            Insights Manager
          </h1>
          <p className="text-gray-500">Publish and manage blog posts and insights.</p>
        </div>
        <button 
          onClick={() => isFormOpen ? handleCancel() : setIsFormOpen(true)}
          className="admin-btn-primary flex items-center gap-2"
        >
          <Plus size={18} className={isFormOpen ? "rotate-45 transition-transform" : "transition-transform"} />
          {isFormOpen ? 'Cancel' : 'Add Insight'}
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm mb-8 animate-[fadeInUp_300ms_var(--ease-out)_forwards]">
          <h2 className="text-xl font-semibold mb-6">{editingId ? 'Edit Insight' : 'Create New Insight'}</h2>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="admin-label required">Title</label>
                <input 
                  type="text" required
                  value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})}
                  className="admin-input"
                />
              </div>
              <div>
                <label className="admin-label required">Category</label>
                <input 
                  type="text" required
                  value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}
                  className="admin-input"
                />
              </div>
              <div>
                <label className="admin-label required">Date</label>
                <input 
                  type="text" required
                  value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})}
                  className="admin-input"
                  placeholder="e.g., January 15, 2026"
                />
              </div>
              <div>
                <label className="admin-label required">Read Time</label>
                <input 
                  type="text" required
                  value={formData.readTime} onChange={e => setFormData({...formData, readTime: e.target.value})}
                  className="admin-input"
                  placeholder="e.g., 5 min read"
                />
              </div>
            </div>
            
            <div>
              <label className="admin-label required">Excerpt</label>
              <textarea 
                required rows={3}
                value={formData.excerpt} onChange={e => setFormData({...formData, excerpt: e.target.value})}
                className="admin-input resize-none"
              />
            </div>

            <button type="submit" className="admin-btn-primary">
              {editingId ? 'Update Insight' : 'Publish Insight'}
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
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Title</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Category</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Date</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {insights.map((insight) => (
                  <tr key={insight.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-medium text-black max-w-md truncate">{insight.title}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md">{insight.category}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm">{insight.date}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button 
                        onClick={() => handleEdit(insight)}
                        className="text-gray-400 hover:text-blue-600 transition-colors p-2"
                        title="Edit"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(insight.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors p-2"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {insights.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                      No insights found.
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
