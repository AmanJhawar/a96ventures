"use client"

import { useState, useEffect } from 'react'
import { collection, deleteDoc, doc, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { Trash2, MessageSquare } from 'lucide-react'

interface Inquiry {
  id: string;
  name: string;
  email: string;
  company: string;
  message: string;
  inquiryType: string;
  createdAt?: any;
}

export default function AdminInquiries() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchInquiries = async () => {
    setLoading(true)
    try {
      const q = query(collection(db, 'inquiries'), orderBy('createdAt', 'desc'))
      const querySnapshot = await getDocs(q)
      const items: Inquiry[] = []
      querySnapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Inquiry)
      })
      setInquiries(items)
    } catch (err) {
      console.error("Error fetching inquiries", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInquiries()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this inquiry?')) return
    try {
      await deleteDoc(doc(db, 'inquiries', id))
      setInquiries(inquiries.filter(i => i.id !== id))
    } catch (err) {
      console.error("Error deleting", err)
    }
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown'
    if (timestamp.toDate) {
      return timestamp.toDate().toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    }
    return 'Unknown'
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-black mb-2 tracking-tight flex items-center gap-3">
            <MessageSquare size={28} />
            Inquiries
          </h1>
          <p className="text-gray-500">View contact submissions from the public site.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Date</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Contact</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Type</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Message</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map((inquiry) => (
                  <tr key={inquiry.id} className="border-b border-gray-100 hover:bg-gray-50/50 align-top">
                    <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(inquiry.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-black">{inquiry.name}</div>
                      <div className="text-sm text-gray-500 mt-1">{inquiry.email}</div>
                      {inquiry.company && <div className="text-xs text-gray-400 mt-1">{inquiry.company}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-md border border-blue-100 font-medium">
                        {inquiry.inquiryType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm max-w-sm whitespace-pre-wrap">
                      {inquiry.message}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDelete(inquiry.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors p-2"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {inquiries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      No inquiries found.
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
