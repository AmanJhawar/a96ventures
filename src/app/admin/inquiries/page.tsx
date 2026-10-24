"use client"

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  Trash2,
  ChevronDown,
  Lock,
  UserPlus,
  ExternalLink,
  CheckCircle2,
  X,
  MapPin
} from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ConfirmModal } from '@/components/confirm-modal'
import CustomerForm from '@/components/customer-form'
import {
  getInquiriesPage,
  deleteInquiry,
  updateInquiryStatus,
  linkInquiryToCustomer
} from '@/lib/services/inquiry.service'
import { logVisit, CreateVisitInput } from '@/lib/services/visits.service'
import { getLocations } from '@/lib/services/inventory.service'
import { Inquiry, Customer, Location } from '@/lib/types'
import { isValidPan } from '@/lib/utils/pan'
import { getTodayIST } from '@/lib/utils/date'
import { EASE_OUT } from '@/components/motion-transitions'
import { usePermissions } from '@/lib/context/PermissionsContext'
import { toast } from 'sonner'

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
  const { hasPermission, isSuperAdmin, userIdentity, adminUser } = usePermissions()
  const canAddCustomer = hasPermission('customers', 'add')
  const canEditPan = hasPermission('customers', 'editPan')
  const userAssignedLocationId = adminUser?.assignedLocationId

  const [locations, setLocations] = useState<Location[]>([])
  const [conversionLocationId, setConversionLocationId] = useState('')

  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Customer conversion modal state
  const [convertingInquiry, setConvertingInquiry] = useState<Inquiry | null>(null)

  useEffect(() => {
    if (!userAssignedLocationId) {
      getLocations()
        .then((locs) => {
          setLocations(locs)
          if (locs.length > 0 && !conversionLocationId) {
            setConversionLocationId(locs[0].id)
          }
        })
        .catch((err) => console.error('Failed to load locations', err))
    }
  }, [userAssignedLocationId, conversionLocationId])

  useEffect(() => {
    let ignore = false
    async function load() {
      try {
        const { items, nextCursor: newCursor } = await getInquiriesPage(ITEMS_PER_PAGE)
        if (!ignore) {
          setInquiries(items)
          setNextCursor(newCursor)
          setHasMore(!!newCursor)
          setLoading(false)
        }
      } catch (err) {
        if (!ignore) {
          console.error("Error fetching inquiries", err)
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
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

  const confirmDelete = (id: string) => setDeleteId(id)

  const executeDelete = async () => {
    if (!deleteId) return
    const inq = inquiries.find(i => i.id === deleteId)
    const contactName = inq ? (inq.firstName ? `${inq.firstName} ${inq.lastName}` : inq.name || inq.email || inq.mobile) : deleteId
    try {
      await deleteInquiry(deleteId, userIdentity ? { id: userIdentity.id, email: userIdentity.email } : undefined, contactName)
      setInquiries(inquiries.filter(i => i.id !== deleteId))
      toast.success('Inquiry deleted')
    } catch (err) {
      console.error("Error deleting", err)
      toast.error('Failed to delete inquiry')
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
      toast.error('Failed to update inquiry status')
    }
  }

  const formatDate = (timestamp: unknown) => {
    if (!timestamp) return 'Unknown'
    const ts = timestamp as { toDate?: () => Date };
    if (typeof ts.toDate === 'function') {
      return ts.toDate().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    }
    return 'Unknown'
  }

  // Pre-fill CustomerForm inputs from inquiry details
  const getInitialValuesForInquiry = (inquiry: Inquiry) => {
    let firstName = inquiry.firstName || ''
    let middleName = inquiry.middleName || ''
    let lastName = inquiry.lastName || ''

    if (!firstName && inquiry.name) {
      const parts = inquiry.name.trim().split(/\s+/)
      firstName = parts[0] || ''
      if (parts.length === 2) {
        lastName = parts[1] || ''
      } else if (parts.length > 2) {
        middleName = parts.slice(1, -1).join(' ')
        lastName = parts[parts.length - 1]
      }
    }

    let pan: string | undefined = undefined
    let notes: string | undefined = undefined

    if (inquiry.gstinPan) {
      const val = inquiry.gstinPan.trim().toUpperCase()
      if (val.length === 10 && isValidPan(val) && canEditPan) {
        pan = val
      } else if (val.length === 15) {
        notes = `GSTIN: ${val}`
      } else if (val) {
        notes = `Tax ID: ${val}`
      }
    }

    return {
      firstName,
      middleName,
      lastName,
      countryCode: inquiry.countryCode || '+91',
      mobile: inquiry.mobile || '',
      email: inquiry.email || '',
      pan,
      notes,
      source: 'inquiry' as const,
      inquiryId: inquiry.id
    }
  }

  // Handle successful customer save & inquiry linking
  const handleCustomerConverted = async (customer: Customer) => {
    if (!convertingInquiry) return
    const currentInq = convertingInquiry

    const effectiveLocationId = userAssignedLocationId || conversionLocationId
    if (!effectiveLocationId) {
      toast.error('Store location is required to log the visit record')
      return
    }

    try {
      // 1. Link inquiry in Firestore
      await linkInquiryToCustomer(
        currentInq.id,
        customer.id,
        customer.displayName,
        userIdentity ? { id: userIdentity.id, email: userIdentity.email } : undefined
      )

      // 2. Extract date for visit from inquiry.createdAt
      let visitDate = getTodayIST()
      if (currentInq.createdAt) {
        const ts = currentInq.createdAt as { toDate?: () => Date }
        if (typeof ts.toDate === 'function') {
          const d = ts.toDate()
          visitDate = d.toISOString().split('T')[0]
        }
      }

      // 3. Write visit of kind inquiry dated at inquiry's createdAt
      try {
        const visitPayload: CreateVisitInput = {
          customerId: customer.id,
          locationId: effectiveLocationId,
          kind: 'inquiry',
          at: visitDate,
          note: currentInq.message || 'Converted from online inquiry',
          inquiryId: currentInq.id
        }
        await logVisit(visitPayload)
      } catch (visitErr) {
        console.error('Failed to log visit for inquiry:', visitErr)
        toast.error(visitErr instanceof Error ? visitErr.message : 'Failed to record visit for inquiry')
        throw visitErr
      }

      // 4. Update local state
      setInquiries((prev) =>
        prev.map((i) =>
          i.id === currentInq.id
            ? {
                ...i,
                customerId: customer.id,
                customerDisplayName: customer.displayName,
                status: 'handled'
              }
            : i
        )
      )

      toast.success(`Inquiry linked to ${customer.displayName}`)
    } catch (err: unknown) {
      console.error('Error linking inquiry:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to finalize inquiry conversion')
    } finally {
      setConvertingInquiry(null)
    }
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
          <p className="text-gray-500 text-sm">Customer submissions and leads.</p>
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
                    <tr key={inquiry.id} className={`border-b border-gray-100 align-top transition-colors ${isHandled ? 'bg-gray-50 opacity-70' : isUnread ? 'bg-gray-50/50' : 'hover:bg-gray-50/50'}`}>
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

                        {/* Linked Customer Badge */}
                        {inquiry.customerId && (
                          <div className="mt-2">
                            <Link
                              href={`/admin/customers/${inquiry.customerId}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                              title="View linked customer CRM profile"
                            >
                              <CheckCircle2 size={12} className="text-emerald-500" />
                              <span>Linked to {inquiry.customerDisplayName || 'Customer'}</span>
                              <ExternalLink size={10} className="text-emerald-400" />
                            </Link>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-lg border border-gray-200 font-medium">
                          {inquiry.inquiryType}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-sm max-w-sm whitespace-pre-wrap">
                        {inquiry.message}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {!inquiry.customerId && canAddCustomer && (
                            <button
                              type="button"
                              onClick={() => setConvertingInquiry(inquiry)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-black text-white hover:bg-black/85 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                              title="Convert lead into customer profile"
                            >
                              <UserPlus size={13} />
                              <span>Convert to customer</span>
                            </button>
                          )}
                          {hasPermission('inquiries', 'delete') && (
                            <button 
                              type="button"
                              onClick={() => confirmDelete(inquiry.id)}
                              className="text-gray-400 hover:text-black transition-[color,transform] duration-150 active:scale-[0.97] p-2"
                              title="Delete Inquiry"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
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
                type="button"
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

      {/* Convert Inquiry to Customer Modal */}
      {convertingInquiry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-black tracking-tight">Convert Inquiry to Customer</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Create or link a Customer profile for this inquiry. An interaction visit will be logged automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConvertingInquiry(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-black hover:bg-gray-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            {!userAssignedLocationId && (
              <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <MapPin size={13} className="text-gray-500" />
                  <span>Store Location for Visit Record <span className="text-red-500">*</span></span>
                </label>
                <select
                  value={conversionLocationId}
                  onChange={(e) => setConversionLocationId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black focus:outline-none focus:border-black transition-[border-color] duration-150"
                >
                  <option value="">Select store location</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <CustomerForm
              initialValues={getInitialValuesForInquiry(convertingInquiry)}
              onSuccess={handleCustomerConverted}
              onCancel={() => setConvertingInquiry(null)}
              submitLabel="Convert to Customer"
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
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
