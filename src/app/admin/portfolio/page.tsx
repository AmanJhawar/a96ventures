"use client"

import { useState, useEffect } from 'react'
import { collection, setDoc, deleteDoc, doc, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { PortfolioCompany } from '@/data/portfolio'
import { Trash2, Plus, Briefcase, Edit2 } from 'lucide-react'

export default function AdminPortfolio() {
  const [companies, setCompanies] = useState<(PortfolioCompany & { id: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState<Partial<PortfolioCompany>>({
    name: '', slug: '', description: '', stage: '', sector: ''
  })

  const fetchCompanies = async () => {
    setLoading(true)
    try {
      const querySnapshot = await getDocs(collection(db, 'portfolio'))
      const items: (PortfolioCompany & { id: string })[] = []
      querySnapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as (PortfolioCompany & { id: string }))
      })
      setCompanies(items)
    } catch (err) {
      console.error("Error fetching companies", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCompanies()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this company?')) return
    try {
      await deleteDoc(doc(db, 'portfolio', id))
      setCompanies(companies.filter(c => c.id !== id))
    } catch (err) {
      console.error("Error deleting", err)
    }
  }

  const handleEdit = (company: PortfolioCompany & { id: string }) => {
    setFormData(company)
    setEditingId(company.id)
    setIsFormOpen(true)
  }

  const handleCancel = () => {
    setIsFormOpen(false)
    setEditingId(null)
    setFormData({ name: '', slug: '', description: '', stage: '', sector: '' })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!formData.slug) {
        alert("Slug is required!")
        return
      }
      
      // If we change the slug, we would technically need to create a new doc and delete the old one.
      // For simplicity in this edit flow, we use the existing editingId as the document reference if we are editing.
      // But actually, let's just restrict changing the slug or handle it by making a new one and deleting old.
      // I'll just restrict changing the slug during edit to keep it simple.
      const docId = editingId || formData.slug
      const docRef = doc(db, 'portfolio', docId)
      
      await setDoc(docRef, formData)
      
      if (editingId) {
        setCompanies(companies.map(c => c.id === editingId ? { id: docId, ...formData } as (PortfolioCompany & { id: string }) : c))
      } else {
        setCompanies([...companies, { id: docId, ...formData } as (PortfolioCompany & { id: string })])
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
            <Briefcase size={28} />
            Portfolio Manager
          </h1>
          <p className="text-gray-500">Manage your portfolio companies and case studies.</p>
        </div>
        <button 
          onClick={() => isFormOpen ? handleCancel() : setIsFormOpen(true)}
          className="admin-btn-primary flex items-center gap-2"
        >
          <Plus size={18} className={isFormOpen ? "rotate-45 transition-transform" : "transition-transform"} />
          {isFormOpen ? 'Cancel' : 'Add Company'}
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm mb-8 animate-[fadeInUp_300ms_var(--ease-out)_forwards]">
          <h2 className="text-xl font-semibold mb-6">{editingId ? 'Edit Company' : 'Add New Company'}</h2>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="admin-label">Company Name</label>
                <input 
                  type="text" required
                  value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                  className="admin-input"
                />
              </div>
              <div>
                <label className="admin-label">URL Slug</label>
                <input 
                  type="text" required
                  disabled={!!editingId}
                  value={formData.slug} onChange={e => setFormData({...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')})}
                  className="admin-input disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="admin-label">Stage</label>
                <input 
                  type="text" required
                  value={formData.stage} onChange={e => setFormData({...formData, stage: e.target.value})}
                  className="admin-input"
                  placeholder="e.g., Seed, Series A"
                />
              </div>
              <div>
                <label className="admin-label">Sector</label>
                <input 
                  type="text" required
                  value={formData.sector} onChange={e => setFormData({...formData, sector: e.target.value})}
                  className="admin-input"
                />
              </div>
            </div>
            
            <div>
              <label className="admin-label">Description</label>
              <textarea 
                required rows={3}
                value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                className="admin-input resize-none"
              />
            </div>

            <button type="submit" className="admin-btn-primary">
              {editingId ? 'Update Company' : 'Save Company'}
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
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Company Name</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Slug</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Stage</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Sector</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-medium text-black">{company.name}</td>
                    <td className="px-6 py-4 text-gray-600 text-sm">{company.slug}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md">{company.stage}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm">{company.sector}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button 
                        onClick={() => handleEdit(company)}
                        className="text-gray-400 hover:text-blue-600 transition-colors p-2"
                        title="Edit"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(company.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors p-2"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {companies.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      No companies found.
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
