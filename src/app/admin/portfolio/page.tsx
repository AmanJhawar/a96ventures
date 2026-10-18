"use client"

import { useState, useEffect } from 'react'
import { collection, setDoc, deleteDoc, doc, getDocs, getFirestore } from 'firebase/firestore/lite'
import { app } from '@/lib/firebase/config'
const db = getFirestore(app)
import { PortfolioCompany } from '@/lib/types'
import { Trash2, Plus, Briefcase, Edit2, Lock } from 'lucide-react'
import { ConfirmModal } from '@/components/confirm-modal'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from '@/components/motion-transitions'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePermissions } from '@/lib/context/PermissionsContext'
import { toast } from 'sonner'
import { recordAuditLog } from '@/lib/services/audit.service'

const portfolioSchema = z.object({
  id: z.string().min(1, 'URL Key (ID) is required').regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens'),
  name: z.string().min(1, 'Company name is required'),
  stage: z.string().min(1, 'Stage is required'),
  sector: z.string().min(1, 'Sector is required'),
  description: z.string().min(1, 'Description is required')
})

type PortfolioValues = z.infer<typeof portfolioSchema>

export default function AdminPortfolio() {
  const { hasPermission, isSuperAdmin } = usePermissions()
  const [companies, setCompanies] = useState<(PortfolioCompany & { id: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<PortfolioValues>({
    resolver: zodResolver(portfolioSchema),
    defaultValues: { id: '', name: '', stage: '', sector: '', description: '' }
  })

  useEffect(() => {
    let active = true
    const fetchCompanies = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'portfolio'))
        if (!active) return
        const items: (PortfolioCompany & { id: string })[] = []
        querySnapshot.forEach((docSnap) => {
          items.push({ ...docSnap.data(), id: docSnap.id } as (PortfolioCompany & { id: string }))
        })
        setCompanies(items)
      } catch (err) {
        console.error("Error fetching companies", err)
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchCompanies()
    return () => { active = false }
  }, [])

  const confirmDelete = (id: string) => setDeleteId(id)

  const executeDelete = async () => {
    if (!deleteId) return
    const targetCompany = companies.find(c => c.id === deleteId)
    try {
      await deleteDoc(doc(db, 'portfolio', deleteId))
      
      // Trigger dynamic path revalidation in background
      fetch(`/api/revalidate?path=${encodeURIComponent('/portfolio')}`).catch(err => console.error(err))
      fetch(`/api/revalidate?path=${encodeURIComponent(`/portfolio/${deleteId}`)}`).catch(err => console.error(err))
      
      setCompanies(companies.filter(c => c.id !== deleteId))
      await recordAuditLog({
        action: 'delete',
        entityType: 'portfolio',
        entityId: deleteId,
        entityName: targetCompany?.name || deleteId,
        description: `Deleted portfolio company "${targetCompany?.name || deleteId}"`
      }).catch((auditErr) => console.warn('Audit error:', auditErr))
      toast.success('Portfolio company deleted successfully')
    } catch (err: unknown) {
      console.error("Error deleting", err)
      const msg = err instanceof Error ? err.message : 'Failed to delete portfolio company'
      toast.error(msg)
    } finally {
      setDeleteId(null)
    }
  }

  const handleEdit = (company: PortfolioCompany & { id: string }) => {
    setEditingId(company.id)
    reset({
      id: company.id,
      name: company.name,
      stage: company.stage,
      sector: company.sector,
      description: company.description
    })
    setIsFormOpen(true)
  }

  const handleCancel = () => {
    setIsFormOpen(false)
    setEditingId(null)
    reset({ id: '', name: '', stage: '', sector: '', description: '' })
  }

  const handleAddNew = () => {
    reset({ id: '', name: '', stage: '', sector: '', description: '' })
    setEditingId(null)
    setIsFormOpen(true)
  }

  const onSubmit = async (data: PortfolioValues) => {
    try {
      const docId = editingId || data.id
      const docRef = doc(db, 'portfolio', docId)
      
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _, ...saveData } = data
      await setDoc(docRef, saveData)
      
      // Trigger dynamic path revalidation in background
      fetch(`/api/revalidate?path=${encodeURIComponent('/portfolio')}`).catch(err => console.error(err))
      fetch(`/api/revalidate?path=${encodeURIComponent(`/portfolio/${docId}`)}`).catch(err => console.error(err))

      if (editingId) {
        setCompanies(companies.map(c => c.id === editingId ? { id: docId, ...saveData } as (PortfolioCompany & { id: string }) : c))
        await recordAuditLog({
          action: 'update',
          entityType: 'portfolio',
          entityId: docId,
          entityName: data.name,
          description: `Updated portfolio company "${data.name}" (${data.stage || data.sector})`,
          metadata: { sector: data.sector, stage: data.stage }
        }).catch((auditErr) => console.warn('Audit error:', auditErr))
        toast.success('Portfolio company updated successfully')
      } else {
        setCompanies([...companies, { id: docId, ...saveData } as (PortfolioCompany & { id: string })])
        await recordAuditLog({
          action: 'create',
          entityType: 'portfolio',
          entityId: docId,
          entityName: data.name,
          description: `Added portfolio company "${data.name}" (${data.stage || data.sector})`,
          metadata: { sector: data.sector, stage: data.stage }
        }).catch((auditErr) => console.warn('Audit error:', auditErr))
        toast.success('Portfolio company created successfully')
      }
      handleCancel()
    } catch (err: unknown) {
      console.error("Error saving", err)
      const msg = err instanceof Error ? err.message : 'Failed to save portfolio company'
      toast.error(msg)
    }
  }

  const shouldReduceMotion = useReducedMotion()

  if (!isSuperAdmin && !hasPermission('portfolio', 'view')) {
    return (
      <div className="w-full py-20 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-black">
          <Lock size={22} />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-black mb-2">Access Restricted</h2>
        <p className="text-sm text-gray-500 max-w-md">
          You do not have permission to view venture portfolio companies.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-black mb-1">Portfolio Manager</h1>
          <p className="text-gray-500 text-sm">Manage your portfolio companies and case studies.</p>
        </div>
        {!isFormOpen && hasPermission('portfolio', 'add') && (
          <button 
            onClick={handleAddNew}
            className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-black text-white hover:bg-gray-800 rounded-lg text-xs font-semibold transition-[background-color,transform] duration-150 active:scale-[0.97]"
          >
            <Plus size={14} />
            Add Company
          </button>
        )}
      </div>

      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ opacity: 0, transform: shouldReduceMotion ? "none" : "scale(0.97) translateY(8px)" }}
            animate={{ opacity: 1, transform: shouldReduceMotion ? "none" : "scale(1) translateY(0px)" }}
            exit={{ opacity: 0, transform: shouldReduceMotion ? "none" : "scale(0.97) translateY(8px)" }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-8"
          >
            <h2 className="text-xl font-semibold mb-6">{editingId ? 'Edit Company' : 'Add New Company'}</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="admin-label required">Company Name</label>
                  <input 
                    type="text" 
                    {...register('name')}
                    className={`admin-input ${errors.name ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                    placeholder="e.g., Milemax"
                  />
                  {errors.name && <p className="text-gray-500 font-medium text-sm mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="admin-label required">URL Key (ID)</label>
                  <input 
                    type="text" 
                    {...register('id', {
                      onChange: (e) => {
                        e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                        setValue('id', e.target.value)
                      }
                    })}
                    disabled={!!editingId}
                    className={`admin-input disabled:bg-gray-100 ${errors.id ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                    placeholder="e.g. milemax"
                  />
                  {errors.id && <p className="text-gray-500 font-medium text-sm mt-1">{errors.id.message}</p>}
                </div>
                <div>
                  <label className="admin-label required">Stage</label>
                  <input 
                    type="text" 
                    {...register('stage')}
                    className={`admin-input ${errors.stage ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                    placeholder="e.g., Seed, Series A"
                  />
                  {errors.stage && <p className="text-gray-500 font-medium text-sm mt-1">{errors.stage.message}</p>}
                </div>
                <div>
                  <label className="admin-label required">Sector</label>
                  <input 
                    type="text" 
                    {...register('sector')}
                    className={`admin-input ${errors.sector ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                    placeholder="e.g., Logistics, Fintech"
                  />
                  {errors.sector && <p className="text-gray-500 font-medium text-sm mt-1">{errors.sector.message}</p>}
                </div>
              </div>
              
              <div>
                <label className="admin-label required">Description</label>
                <textarea 
                  rows={3}
                  {...register('description')}
                  className={`admin-input resize-none ${errors.description ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                  placeholder="Overview of the company, challenge, and solution..."
                />
                {errors.description && <p className="text-gray-500 font-medium text-sm mt-1">{errors.description.message}</p>}
              </div>

              <div className="flex justify-end gap-4 mt-12">
                <button type="button" onClick={handleCancel} className="admin-btn-outline px-6">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="admin-btn-primary disabled:opacity-50">
                  {isSubmitting ? 'Saving...' : (editingId ? 'Update Company' : 'Save Company')}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
        </div>
      ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500">Company Name</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500">URL Key (ID)</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500">Stage</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500">Sector</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-medium text-black">{company.name}</td>
                    <td className="px-6 py-4 text-gray-500 text-sm">{company.id}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-lg">{company.stage}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-sm">{company.sector}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {hasPermission('portfolio', 'edit') && (
                        <button 
                          onClick={() => handleEdit(company)}
                          className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97] p-2"
                          title="Edit"
                        >
                          <Edit2 size={18} />
                        </button>
                      )}
                      {hasPermission('portfolio', 'delete') && (
                        <button 
                          onClick={() => confirmDelete(company.id)}
                          className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97] p-2"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
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

      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Portfolio Company"
        description="Are you sure you want to delete this company? This action cannot be undone."
        confirmText="Delete"
        onClose={() => setDeleteId(null)}
        onConfirm={executeDelete}
      />
    </div>
  )
}
