"use client"

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { collection, addDoc, setDoc, deleteDoc, doc, getDocs, getFirestore } from 'firebase/firestore/lite'
import { app } from '@/lib/firebase/config'
const db = getFirestore(app)
import { TeamMember } from '@/lib/types'
import { getOptimizedUrl } from '@/lib/utils'
import { Trash2, Plus, Users, Edit2 } from 'lucide-react'
import { ImageDropzone } from '@/components/image-dropzone'
import { ConfirmModal } from '@/components/confirm-modal'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const teamSchema = z.object({
  name: z.string().min(1, 'Full name is required'),
  role: z.string().min(1, 'Role is required'),
  imageFile: z.string().min(1, 'Profile image is required'),
  linkedin: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  expertise: z.string().min(1, 'Expertise is required'),
  bio: z.string().min(1, 'Bio is required')
})

type TeamValues = z.infer<typeof teamSchema>

export default function AdminTeam() {
  const [team, setTeam] = useState<(TeamMember & { id: string })[]>([])
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
  } = useForm<TeamValues>({
    resolver: zodResolver(teamSchema),
    defaultValues: { name: '', role: '', bio: '', imageFile: '', linkedin: '', expertise: '' }
  })

  useEffect(() => {
    let active = true
    const fetchTeam = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'team'))
        if (!active) return
        const fetchedTeam: (TeamMember & { id: string })[] = []
        querySnapshot.forEach((docSnap) => {
          fetchedTeam.push({ ...docSnap.data(), id: docSnap.id } as (TeamMember & { id: string }))
        })
        setTeam(fetchedTeam)
      } catch (err) {
        console.error("Error fetching team", err)
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchTeam()
    return () => { active = false }
  }, [])

  const confirmDelete = (id: string) => setDeleteId(id)

  const executeDelete = async () => {
    if (!deleteId) return
    try {
      await deleteDoc(doc(db, 'team', deleteId))
      setTeam(team.filter(t => t.id !== deleteId))
    } catch (err) {
      console.error("Error deleting", err)
    } finally {
      setDeleteId(null)
    }
  }

  const handleEdit = (member: TeamMember & { id: string }) => {
    setEditingId(member.id)
    reset({
      name: member.name,
      role: member.role,
      bio: member.bio,
      imageFile: member.imageFile || '',
      linkedin: member.linkedin || '',
      expertise: (member.expertise || []).join(', ')
    })
    setIsFormOpen(true)
  }

  const handleCancel = () => {
    setIsFormOpen(false)
    setEditingId(null)
    reset({ name: '', role: '', bio: '', imageFile: '', linkedin: '', expertise: '' })
  }

  const handleAddNew = () => {
    reset({ name: '', role: '', bio: '', imageFile: '', linkedin: '', expertise: '' })
    setEditingId(null)
    setIsFormOpen(true)
  }

  const onSubmit = async (data: TeamValues) => {
    try {
      const parsedData: Partial<TeamMember> = {
        name: data.name,
        role: data.role,
        bio: data.bio,
        imageFile: data.imageFile,
        linkedin: data.linkedin || '',
        expertise: data.expertise.split(',').map(s => s.trim()).filter(Boolean)
      }

      if (editingId) {
        await setDoc(doc(db, 'team', editingId), parsedData)
        setTeam(team.map(t => t.id === editingId ? { id: editingId, ...parsedData } as (TeamMember & { id: string }) : t))
      } else {
        const docRef = await addDoc(collection(db, 'team'), parsedData)
        setTeam([...team, { id: docRef.id, ...parsedData } as (TeamMember & { id: string })])
      }
      handleCancel()
    } catch (err) {
      console.error("Error saving", err)
    }
  }

  return (
    <div>
      {!isFormOpen && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-black mb-2 tracking-tight flex items-center gap-3">
              <Users size={28} />
              Team Manager
            </h1>
            <p className="text-gray-500">Add, edit or remove team members from the public site.</p>
          </div>
          <button 
            onClick={handleAddNew}
            className="admin-btn-primary flex items-center gap-2"
          >
            <Plus size={18} className="transition-transform" />
            Add Member
          </button>
        </div>
      )}

      {isFormOpen && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-8 animate-[fadeInUp_300ms_var(--ease-out)_forwards]">
          <h2 className="text-xl font-semibold mb-6">{editingId ? 'Edit Team Member' : 'Add New Member'}</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="admin-label required">Full Name</label>
                <input 
                  type="text"
                  {...register('name')}
                  className={`admin-input ${errors.name ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                  placeholder="e.g., Jane Doe"
                />
                {errors.name && <p className="text-gray-500 font-medium text-sm mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="admin-label required">Role</label>
                <input 
                  type="text"
                  {...register('role')}
                  className={`admin-input ${errors.role ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                  placeholder="e.g., Chief Executive Officer"
                />
                {errors.role && <p className="text-gray-500 font-medium text-sm mt-1">{errors.role.message}</p>}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="admin-label required">Profile Image</label>
                <Controller
                  name="imageFile"
                  control={control}
                  render={({ field }) => (
                    <ImageDropzone 
                      value={field.value} 
                      onChange={field.onChange} 
                    />
                  )}
                />
                {errors.imageFile && <p className="text-gray-500 font-medium text-sm mt-1">{errors.imageFile.message}</p>}
              </div>
              <div>
                <label className="admin-label">LinkedIn URL (Optional)</label>
                <input 
                  type="url" 
                  {...register('linkedin')}
                  className={`admin-input ${errors.linkedin ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                  placeholder="https://linkedin.com/in/username"
                />
                {errors.linkedin && <p className="text-gray-500 font-medium text-sm mt-1">{errors.linkedin.message}</p>}
              </div>
            </div>

            <div>
              <label className="admin-label required">Expertise (comma separated)</label>
              <input 
                type="text"
                {...register('expertise')}
                className={`admin-input ${errors.expertise ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                placeholder="e.g., Sales Strategy, Design"
              />
              {errors.expertise && <p className="text-gray-500 font-medium text-sm mt-1">{errors.expertise.message}</p>}
            </div>

            <div>
              <label className="admin-label required">Bio</label>
              <textarea 
                rows={3}
                {...register('bio')}
                className={`admin-input resize-none ${errors.bio ? 'border-gray-900 focus:border-gray-900 focus:ring-black/10' : ''}`}
                placeholder="Short biography highlighting achievements and experience..."
              />
              {errors.bio && <p className="text-gray-500 font-medium text-sm mt-1">{errors.bio.message}</p>}
            </div>

            <div className="flex justify-end gap-4 mt-12">
              <button type="button" onClick={handleCancel} className="admin-btn-outline px-6">
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} className="admin-btn-primary disabled:opacity-50">
                {isSubmitting ? 'Saving...' : (editingId ? 'Update Member' : 'Save Member')}
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
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500">Role</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500">Image</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {team.map((member) => (
                  <tr key={member.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-medium text-black">{member.name}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-lg">{member.role}</span>
                    </td>
                    <td className="px-6 py-4">
                      {member.imageFile ? (
                        <Image width={40} height={40} unoptimized src={getOptimizedUrl(member.imageFile, 400)} alt={member.name} className="w-10 h-10 object-cover rounded-full bg-gray-100" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                          <Users size={16} />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button 
                        onClick={() => handleEdit(member)}
                        className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97] p-2"
                        title="Edit"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => confirmDelete(member.id)}
                        className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97] p-2"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {team.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                      No team members found.
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
        title="Delete Team Member"
        description="Are you sure you want to delete this team member? This action cannot be undone."
        confirmText="Delete"
        onClose={() => setDeleteId(null)}
        onConfirm={executeDelete}
      />
    </div>
  )
}
