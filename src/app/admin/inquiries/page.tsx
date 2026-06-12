"use client"

import { useState, useEffect } from 'react'
import { collection, deleteDoc, updateDoc, doc, getDocs, orderBy, query, limit, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore/lite'
import { db } from '@/lib/firebase/config'
import { Trash2, MessageSquare, CheckCircle, Circle } from 'lucide-react'

interface Inquiry {
  id: string;
  name: string;
  email: string;
  company: string;
  message: string;
  inquiryType: string;
  status?: 'unread' | 'read' | 'handled';
  createdAt?: unknown;
}

const ITEMS_PER_PAGE = 10;

export default function AdminInquiries() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [hasMore, setHasMore] = useState(true)

  const fetchInquiries = async () => {
    try {
      const q = query(collection(db, 'inquiries'), orderBy('createdAt', 'desc'), limit(ITEMS_PER_PAGE))
      const querySnapshot = await getDocs(q)
      const items: Inquiry[] = []
      querySnapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Inquiry)
      })
      
      setInquiries(items)
      if (querySnapshot.docs.length > 0) {
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1])
      }
      setHasMore(querySnapshot.docs.length === ITEMS_PER_PAGE)
    } catch (err) {
      console.error("Error fetching inquiries", err)
    } finally {
      setLoading(false)
    }
  }

  const loadMore = async () => {
    if (!lastVisible) return
    setLoadingMore(true)
    try {
      const q = query(
        collection(db, 'inquiries'), 
        orderBy('createdAt', 'desc'), 
        startAfter(lastVisible),
        limit(ITEMS_PER_PAGE)
      )
      const querySnapshot = await getDocs(q)
      const items: Inquiry[] = []
      querySnapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Inquiry)
      })
      
      setInquiries(prev => [...prev, ...items])
      if (querySnapshot.docs.length > 0) {
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1])
      }
      setHasMore(querySnapshot.docs.length === ITEMS_PER_PAGE)
    } catch (err) {
      console.error("Error loading more inquiries", err)
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const handleStatusChange = async (id: string, newStatus: 'unread' | 'read' | 'handled') => {
    try {
      await updateDoc(doc(db, 'inquiries', id), { status: newStatus })
      setInquiries(inquiries.map(i => i.id === id ? { ...i, status: newStatus } : i))
    } catch (err) {
      console.error("Error updating status", err)
    }
  }

  const formatDate = (timestamp: unknown) => {
    if (!timestamp) return 'Unknown'
    const ts = timestamp as { toDate: () => Date };
    if (ts.toDate) {
      return ts.toDate().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
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
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Status</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Date (IST)</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Contact</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Type</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Message</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map((inquiry) => {
                  const isHandled = inquiry.status === 'handled';
                  const isUnread = !inquiry.status || inquiry.status === 'unread';

                  return (
                    <tr key={inquiry.id} className={`border-b border-gray-100 align-top transition-colors ${isHandled ? 'bg-gray-50 opacity-60' : isUnread ? 'bg-blue-50/30' : 'hover:bg-gray-50/50'}`}>
                      <td className="px-6 py-4">
                        <select 
                          value={inquiry.status || 'unread'}
                          onChange={(e) => handleStatusChange(inquiry.id, e.target.value as Inquiry['status'] ?? 'unread')}
                          className="text-sm bg-transparent border border-gray-200 rounded px-2 py-1 outline-none focus:border-black"
                        >
                          <option value="unread">Unread</option>
                          <option value="read">Read</option>
                          <option value="handled">Handled</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {formatDate(inquiry.createdAt)}
                      </td>
                      <td className="px-6 py-4">
                        <div className={`font-medium ${isUnread ? 'text-black' : 'text-gray-700'}`}>{inquiry.name}</div>
                        <div className="text-sm text-gray-500 mt-1">{inquiry.email}</div>
                        {inquiry.company && <div className="text-xs text-gray-400 mt-1">{inquiry.company}</div>}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-md border border-gray-200 font-medium">
                          {inquiry.inquiryType}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600 text-sm max-w-sm whitespace-pre-wrap">
                        {inquiry.message}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleDelete(inquiry.id)}
                          className="text-gray-400 hover:text-red-600 transition-[color,transform] active:scale-95 p-2"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {inquiries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      No inquiries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {hasMore && inquiries.length > 0 && (
            <div className="p-4 border-t border-gray-100 flex justify-center bg-gray-50/50">
              <button 
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
