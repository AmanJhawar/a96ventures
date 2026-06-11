"use client"

import { useState, useEffect } from 'react'
import { collection, setDoc, addDoc, deleteDoc, doc, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { TeamMember } from '@/data/team'
import { Trash2, Plus, Users, Edit2 } from 'lucide-react'
import { ImageDropzone } from '@/components/image-dropzone'

export default function AdminTeam() {
  const [team, setTeam] = useState<(TeamMember & { id: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState<Partial<TeamMember>>({
    name: '', role: '', bio: '', imageFile: '', linkedin: '', expertise: []
  })

  const fetchTeam = async () => {
    setLoading(true)
    try {
      const querySnapshot = await getDocs(collection(db, 'team'))
      const fetchedTeam: (TeamMember & { id: string })[] = []
      querySnapshot.forEach((docSnap) => {
        fetchedTeam.push({ id: docSnap.id, ...docSnap.data() } as (TeamMember & { id: string }))
      })
      setTeam(fetchedTeam)
    } catch (err) {
      console.error("Error fetching team", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTeam()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this team member?')) return
    try {
      await deleteDoc(doc(db, 'team', id))
      setTeam(team.filter(t => t.id !== id))
    } catch (err) {
      console.error("Error deleting", err)
    }
  }

  const handleEdit = (member: TeamMember & { id: string }) => {
    setFormData(member)
    setEditingId(member.id)
    setIsFormOpen(true)
  }

  const handleCancel = () => {
    setIsFormOpen(false)
    setEditingId(null)
    setFormData({ name: '', role: '', bio: '', imageFile: '', linkedin: '', expertise: [] })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingId) {
        await setDoc(doc(db, 'team', editingId), formData)
        setTeam(team.map(t => t.id === editingId ? { id: editingId, ...formData } as (TeamMember & { id: string }) : t))
      } else {
        const docRef = await addDoc(collection(db, 'team'), formData)
        setTeam([...team, { id: docRef.id, ...formData } as (TeamMember & { id: string })])
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
            <Users size={28} />
            Team Manager
          </h1>
          <p className="text-gray-500">Add, edit or remove team members from the public site.</p>
        </div>
        <button 
          onClick={() => isFormOpen ? handleCancel() : setIsFormOpen(true)}
          className="bg-black text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
        >
          <Plus size={18} className={isFormOpen ? "rotate-45 transition-transform" : "transition-transform"} />
          {isFormOpen ? 'Cancel' : 'Add Member'}
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm mb-8 animate-[fadeInUp_300ms_var(--ease-out)_forwards]">
          <h2 className="text-xl font-semibold mb-6">{editingId ? 'Edit Team Member' : 'Add New Member'}</h2>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input 
                  type="text" required
                  value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <input 
                  type="text" required
                  value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Profile Image</label>
                <ImageDropzone 
                  value={formData.imageFile || ''} 
                  onChange={(url) => setFormData({...formData, imageFile: url})} 
                  path="team" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">LinkedIn URL (Optional)</label>
                <input 
                  type="url" 
                  value={formData.linkedin || ''} onChange={e => setFormData({...formData, linkedin: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Expertise (comma separated)</label>
              <input 
                type="text" required
                value={(formData.expertise || []).join(', ')} onChange={e => setFormData({...formData, expertise: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="e.g., Sales Strategy, Design"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Bio</label>
              <textarea 
                required rows={3}
                value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <button type="submit" className="bg-black text-white px-6 py-2.5 rounded-lg font-medium hover:bg-gray-800">
              {editingId ? 'Update Member' : 'Save Member'}
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
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Role</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Image</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {team.map((member) => (
                  <tr key={member.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-medium text-black">{member.name}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md">{member.role}</span>
                    </td>
                    <td className="px-6 py-4">
                      {member.imageFile ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={member.imageFile} alt={member.name} className="w-10 h-10 object-cover rounded-full bg-gray-100" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                          <Users size={16} />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button 
                        onClick={() => handleEdit(member)}
                        className="text-gray-400 hover:text-blue-600 transition-colors p-2"
                        title="Edit"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(member.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors p-2"
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
      )}
    </div>
  )
}
