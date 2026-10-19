"use client"

import { useState, useEffect, useRef } from 'react'
import { Trash2, ChevronDown, Lock } from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ConfirmModal } from '@/components/confirm-modal'
import { getInquiriesPage, deleteInquiry, updateInquiryStatus } from '@/lib/services/inquiry.service'
import { Inquiry } from '@/lib/types'
import { EASE_OUT } from '@/components/motion-transitions'
import { usePermissions } from '@/lib/context/PermissionsContext'

function StatusDropdown({
  status,
  onChange,
  disabled = false
}: {
  status: Inquiry['status'],
  onChange: (newStatus: 'unread' | 'read' | 'handled') => void,
  disabled?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const options = [
    { value: 'unread', label: 'Unread' },
    { value: 'read', label: 'Read' },
    { value: 'handled', label: 'Handled' },
  ] as const

  const currentOption = options.find(o => o.value === (status || 'unread'))

  if (disabled) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 capitalize border border-gray-200">
        {currentOption?.label}
      </span>
    )
  }

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 w-28 text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-200 transition-[border-color,transform] active:scale-[0.97]"
      >
        <span className="capitalize">{currentOption?.label}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, transform: shouldReduceMotion ? "none" : "scale(0.95) translateY(-4px)" }}
            animate={{ opacity: 1, transform: shouldReduceMotion ? "none" : "scale(1) translateY(0px)" }}
            exit={{ opacity: 0, transform: shouldReduceMotion ? "none" : "scale(0.95) translateY(-4px)" }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
            className="absolute z-10 mt-1 w-full bg-white border border-gray-100 rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.06)] overflow-hidden origin-top"
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value)
                  setIsOpen(false)
                }}
                className={`block w-full text-left px-3 py-2 text-sm transition-colors ${
                  status === opt.value ? 'bg-gray-50 font-medium text-black' : 'text-gray-500 hover:bg-gray-50 hover:text-black'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const ITEMS_PER_PAGE = 10;

export default function AdminInquiries() {
  const { hasPermission, isSuperAdmin, userIdentity } = usePermissions()
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const fetchInquiries = async () => {
    try {
      const { items, nextCursor: newCursor } = await getInquiriesPage(ITEMS_PER_PAGE)
      setInquiries(items)
      setNextCursor(newCursor)
      setHasMore(!!newCursor)
    } catch (err) {
      console.error("Error fetching inquiries", err)
    } finally {
      setLoading(false)
    }
  }

  const loadMore = async () => {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const { items, nextCursor: newCursor } = await getInquiriesPage(ITEMS_PER_PAGE, nextCursor)
      setInquiries(prev => [...prev, ...items])
      setNextCursor(newCursor)
      setHasMore(!!newCursor)
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

  const confirmDelete = (id: string) => setDeleteId(id)

  const executeDelete = async () => {
    if (!deleteId) return
    const inq = inquiries.find(i => i.id === deleteId)
    const contactName = inq ? (inq.firstName ? `${inq.firstName} ${inq.lastName}` : inq.name || inq.email || inq.mobile) : deleteId
    try {
      await deleteInquiry(deleteId, userIdentity ? { id: userIdentity.id, email: userIdentity.email } : undefined, contactName)
      setInquiries(inquiries.filter(i => i.id !== deleteId))
    } catch (err) {
      console.error("Error deleting", err)
    } finally {
      setDeleteId(null)
    }
  }

  const handleStatusChange = async (id: string, newStatus: 'unread' | 'read' | 'handled') => {
    const inq = inquiries.find(i => i.id === id)
    const contactName = inq ? (inq.firstName ? `${inq.firstName} ${inq.lastName}` : inq.name || inq.email || inq.mobile) : id
    try {
      await updateInquiryStatus(id, newStatus, userIdentity ? { id: userIdentity.id, email: userIdentity.email } : undefined, contactName)
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

  if (!isSuperAdmin && !hasPermission('inquiries', 'view')) {
    return (
      <div className="w-full py-20 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-black">
          <Lock size={22} />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-black mb-2">Access Restricted</h2>
        <p className="text-sm text-gray-500 max-w-md">
          You do not have permission to view customer inquiries.
        </p>
      </div>
    )
  }

  return (
    <div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-black mb-1">Inquiries</h1>
          <p className="text-gray-500 text-sm">View contact submissions from the public site.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500">Status</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500">Date (IST)</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500">Contact</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500">Type</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500">Message</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map((inquiry) => {
                  const isHandled = inquiry.status === 'handled';
                  const isUnread = !inquiry.status || inquiry.status === 'unread';

                  return (
                    <tr key={inquiry.id} className={`border-b border-gray-100 align-top transition-colors ${isHandled ? 'bg-gray-50 opacity-60' : isUnread ? 'bg-gray-50/50' : 'hover:bg-gray-50/50'}`}>
                      <td className="px-6 py-4">
                        <StatusDropdown 
                          status={inquiry.status || 'unread'} 
                          disabled={!hasPermission('inquiries', 'edit')}
                          onChange={(newStatus) => handleStatusChange(inquiry.id, newStatus)} 
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {formatDate(inquiry.createdAt)}
                      </td>
                      <td className="px-6 py-4">
                        <div className={`font-medium ${isUnread ? 'text-black' : 'text-gray-500'}`}>
                          {inquiry.firstName ? `${inquiry.firstName} ${inquiry.middleName ? inquiry.middleName + ' ' : ''}${inquiry.lastName}` : inquiry.name}
                        </div>
                        {(inquiry.countryCode || inquiry.mobile) && (
                          <div className="text-sm text-gray-500 mt-1">{inquiry.countryCode} {inquiry.mobile}</div>
                        )}
                        {inquiry.email && <div className="text-sm text-gray-500 mt-1">{inquiry.email}</div>}
                        {inquiry.company && <div className="text-xs text-gray-400 mt-1">{inquiry.company}</div>}
                        {inquiry.gstinPan && <div className="text-xs text-gray-400 mt-1 uppercase">GST/PAN: {inquiry.gstinPan}</div>}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-lg border border-gray-200 font-medium">
                          {inquiry.inquiryType}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-sm max-w-sm whitespace-pre-wrap">
                        {inquiry.message}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {hasPermission('inquiries', 'delete') && (
                          <button 
                            onClick={() => confirmDelete(inquiry.id)}
                            className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97] p-2"
                            title="Delete Inquiry"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
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
            <div className="p-4 flex justify-center bg-gray-50/50">
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

      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Inquiry"
        description="Are you sure you want to delete this inquiry? This action cannot be undone."
        confirmText="Delete"
        onClose={() => setDeleteId(null)}
        onConfirm={executeDelete}
      />
    </div>
  )
}
