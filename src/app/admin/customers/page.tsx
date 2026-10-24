'use client'

import React, { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  UserPlus,
  Download,
  Phone,
  Calendar,
  AlertCircle,
  Clock,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Filter,
  Loader2,
  X
} from 'lucide-react'
import { Customer } from '@/lib/types'
import { getCustomers, exportCustomersCSV } from '@/lib/services/customers.service'
import { usePermissions } from '@/lib/context/PermissionsContext'
import { formatINR } from '@/lib/utils/money'
import { auth } from '@/lib/firebase/auth'
import { toast } from 'sonner'
import CustomerForm from '@/components/customer-form'

type LastVisitFilter = 'all' | '30' | '90' | '365' | 'never'

function formatRelativeDate(rawDate?: string | null): { relative: string; exact: string } {
  if (!rawDate) return { relative: 'Never', exact: 'No recorded visits' }
  const parts = rawDate.split('-')
  if (parts.length !== 3) return { relative: rawDate, exact: rawDate }
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  const now = new Date()
  const diffTime = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  const exact = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

  if (diffDays <= 0) return { relative: 'Today', exact }
  if (diffDays === 1) return { relative: 'Yesterday', exact }
  if (diffDays < 30) return { relative: `${diffDays} days ago`, exact }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return { relative: `${months} ${months === 1 ? 'month' : 'months'} ago`, exact }
  }
  const years = Math.floor(diffDays / 365)
  return { relative: `${years} ${years === 1 ? 'year' : 'years'} ago`, exact }
}

export default function CustomersPage() {
  const { hasPermission, isSuperAdmin } = usePermissions()
  const canAdd = hasPermission('customers', 'add')
  const canExport = hasPermission('customers', 'export') || isSuperAdmin

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [lastVisitFilter, setLastVisitFilter] = useState<LastVisitFilter>('all')
  const [hasFollowUpOnly, setHasFollowUpOnly] = useState(false)
  const [baseTimestamp] = useState(() => Date.now())

  const [customers, setCustomers] = useState<Customer[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('new') === 'true') {
      return true
    }
    return false
  })

  // 150ms debounced search per Emil Kowalski responsiveness rule
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 150)
    return () => clearTimeout(timer)
  }, [query])

  // Fetch initial / filtered customers from server query
  useEffect(() => {
    let ignore = false
    async function load() {
      try {
        setLoading(true)
        const res = await getCustomers({
          q: debouncedQuery.trim() || undefined,
          lastVisit: lastVisitFilter,
          hasFollowUp: hasFollowUpOnly,
          limit: 30
        })
        if (!ignore) {
          setCustomers(res.customers || [])
          setCursor(res.nextCursor)
          setHasMore(res.hasMore)
          setLoading(false)
        }
      } catch (err: unknown) {
        if (!ignore) {
          console.error('Failed to fetch customers:', err)
          const msg = err instanceof Error ? err.message : 'Unable to load customer directory'
          toast.error(msg)
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [debouncedQuery, lastVisitFilter, hasFollowUpOnly])

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await getCustomers({
        q: debouncedQuery.trim() || undefined,
        lastVisit: lastVisitFilter,
        hasFollowUp: hasFollowUpOnly,
        cursor,
        limit: 30
      })
      setCustomers((prev) => [...prev, ...(res.customers || [])])
      setCursor(res.nextCursor)
      setHasMore(res.hasMore)
    } catch (err: unknown) {
      console.error('Failed to load more customers:', err)
      toast.error('Unable to load more customers')
    } finally {
      setLoadingMore(false)
    }
  }

  // Server query covers all customers; rendered list is customers
  const filteredCustomers = customers

  // Export CSV Handler (calls server export route which guarantees masked PAN)
  const handleExportCSV = async () => {
    if (!canExport || exporting) return
    try {
      setExporting(true)
      await exportCustomersCSV()
      toast.success('Customer CSV exported successfully')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to export customer CSV'
      toast.error(msg)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight flex items-center gap-2">
            <span>Customer Directory</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-mono">
              {filteredCustomers.length}
            </span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage customer relationships, visit timelines, statutory records, and purchase history.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canExport && (
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={exporting}
              className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 hover:text-black hover:bg-gray-50 rounded-lg text-xs font-semibold shadow-2xs transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 size={13} className="animate-spin text-gray-400" />
              ) : (
                <Download size={13} className="text-gray-500" />
              )}
              <span>Export CSV</span>
            </button>
          )}

          {canAdd && (
            <button
              type="button"
              onClick={() => setIsNewCustomerOpen((prev) => !prev)}
              className="h-9 px-4 inline-flex items-center gap-1.5 bg-black text-white hover:bg-gray-800 rounded-lg text-xs font-semibold shadow-xs transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              <UserPlus size={14} />
              <span>New Customer</span>
            </button>
          )}
        </div>
      </div>

      {/* New Customer Modal Panel */}
      <AnimatePresence>
        {isNewCustomerOpen && (
          <motion.div
            initial={{ opacity: 0, transform: 'scale(0.97) translateY(8px)' }}
            animate={{ opacity: 1, transform: 'scale(1) translateY(0px)' }}
            exit={{ opacity: 0, transform: 'scale(0.97) translateY(8px)' }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6 p-6 bg-white border border-gray-200 rounded-2xl shadow-sm relative z-30"
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center shrink-0 shadow-xs">
                  <UserPlus size={16} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-black">Create Customer Profile</h2>
                  <p className="text-xs text-gray-500">
                    Add a new customer to track visits, purchase history, and statutory identity details.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewCustomerOpen(false)}
                className="p-1 text-gray-400 hover:text-black rounded-md transition-[color,transform] active:scale-[0.97]"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <CustomerForm
              onSuccess={(newCust) => {
                toast.success(`Customer ${newCust.displayName} created successfully`)
                setCustomers((prev) => [newCust, ...prev.filter((c) => c.id !== newCust.id)])
                setIsNewCustomerOpen(false)
              }}
              onCancel={() => setIsNewCustomerOpen(false)}
              submitLabel="Create Customer Profile"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search & Filter Toolbar */}
      <div className="p-3.5 bg-white border border-gray-200 rounded-xl shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* 150ms debounced search bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by customer name, mobile, or city..."
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black focus:bg-white transition-[background-color,border-color] duration-150"
            />
          </div>

          {/* Open Follow-up quick toggle */}
          <button
            type="button"
            onClick={() => setHasFollowUpOnly(!hasFollowUpOnly)}
            className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold border transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] shrink-0 ${
              hasFollowUpOnly
                ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Clock size={13} />
            <span>Open Follow-ups</span>
          </button>
        </div>

        {/* Last Visit Recency Filter Pills */}
        <div className="flex items-center gap-2 pt-1 border-t border-gray-100 flex-wrap text-xs">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 mr-1">
            <Filter size={12} />
            Last Visit:
          </span>
          {(
            [
              { key: 'all', label: 'All' },
              { key: '30', label: 'Past 30 Days' },
              { key: '90', label: 'Past 90 Days' },
              { key: '365', label: 'Past 1 Year' },
              { key: 'never', label: 'Never Visited' }
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setLastVisitFilter(item.key)}
              className={`px-2.5 py-1 rounded-md font-medium text-xs transition-[background-color,color,border-color] duration-150 active:scale-[0.97] ${
                lastVisitFilter === item.key
                  ? 'bg-black text-white shadow-2xs font-semibold'
                  : 'bg-gray-100/70 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase font-semibold text-[10px] tracking-wider sticky top-0 z-10">
              <tr>
                <th className="px-5 py-3.5">Customer Name</th>
                <th className="px-5 py-3.5">Mobile</th>
                <th className="px-5 py-3.5">City</th>
                <th className="px-5 py-3.5">Last Visit</th>
                <th className="px-5 py-3.5 text-center">Visits</th>
                <th className="px-5 py-3.5 text-right">Lifetime Value</th>
                <th className="px-5 py-3.5 text-center">PAN on File</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                // Skeleton loading state
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4">
                      <div className="h-3.5 bg-gray-200 rounded w-36 mb-1.5" />
                      <div className="h-2.5 bg-gray-100 rounded w-20" />
                    </td>
                    <td className="px-5 py-4"><div className="h-3 bg-gray-100 rounded w-24" /></td>
                    <td className="px-5 py-4"><div className="h-3 bg-gray-100 rounded w-16" /></td>
                    <td className="px-5 py-4"><div className="h-3 bg-gray-100 rounded w-20" /></td>
                    <td className="px-5 py-4 text-center"><div className="h-4 bg-gray-100 rounded-full w-8 mx-auto" /></td>
                    <td className="px-5 py-4 text-right"><div className="h-3.5 bg-gray-100 rounded w-20 ml-auto" /></td>
                    <td className="px-5 py-4 text-center"><div className="h-4 bg-gray-100 rounded w-10 mx-auto" /></td>
                    <td className="px-5 py-4 text-right"><div className="h-4 bg-gray-100 rounded w-12 ml-auto" /></td>
                  </tr>
                ))
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-gray-700">No customers found</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {query.trim() || hasFollowUpOnly || lastVisitFilter !== 'all'
                        ? 'Try adjusting your search query or filter pills.'
                        : 'Get started by creating your first customer profile.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => {
                  const visitDateInfo = formatRelativeDate(customer.stats?.lastVisitAt)
                  const hasPan = Boolean(customer.hasPan)
                  const openFollowUps = customer.stats?.openFollowUps || 0

                  return (
                    <tr
                      key={customer.id}
                      className="hover:bg-gray-50/80 transition-[background-color] duration-150 group"
                    >
                      {/* Name & Tags */}
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/customers/${customer.id}`}
                          className="font-semibold text-black group-hover:text-black group-hover:underline transition-[color] duration-150 inline-flex items-center gap-1.5"
                        >
                          <span>{customer.displayName}</span>
                          {customer.stats?.orderCount >= 5 && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                              VIP
                            </span>
                          )}
                        </Link>
                        {customer.source && customer.source !== 'walk_in' && (
                          <div className="text-[11px] text-gray-500 font-normal capitalize">
                            {customer.source.replace('_', ' ')}
                          </div>
                        )}
                      </td>

                      {/* Mobile with tel: link */}
                      <td className="px-5 py-4 font-mono text-gray-700">
                        {customer.mobile ? (
                          <a
                            href={`tel:${customer.mobile.e164}`}
                            className="inline-flex items-center gap-1 hover:text-black transition-[color] duration-150"
                            title={`Call ${customer.mobile.e164}`}
                          >
                            <Phone size={11} className="text-gray-400" />
                            <span>
                              {customer.mobile.countryCode} {customer.mobile.number}
                            </span>
                          </a>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* City */}
                      <td className="px-5 py-4 text-gray-600">
                        {customer.address?.city || <span className="text-gray-300">—</span>}
                      </td>

                      {/* Last Visit with Hover Tooltip */}
                      <td className="px-5 py-4">
                        <span
                          title={visitDateInfo.exact}
                          className="cursor-help border-b border-dotted border-gray-300 text-gray-700 font-medium inline-flex items-center gap-1"
                        >
                          <Calendar size={11} className="text-gray-400" />
                          <span>{visitDateInfo.relative}</span>
                        </span>
                        {openFollowUps > 0 && (
                          <span
                            title={`${openFollowUps} follow-up pending`}
                            className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800"
                          >
                            <Clock size={10} />
                            <span>{openFollowUps}</span>
                          </span>
                        )}
                      </td>

                      {/* Visits Count */}
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-800 tabular-nums">
                          {customer.stats?.visitCount || 0}
                        </span>
                      </td>

                      {/* Lifetime Value */}
                      <td className="px-5 py-4 text-right tabular-nums font-bold text-black">
                        {formatINR(customer.stats?.lifetimeValuePaise || 0)}
                      </td>

                      {/* PAN on File */}
                      <td className="px-5 py-4 text-center">
                        {hasPan ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={11} />
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-50 text-gray-400 border border-gray-200">
                            <XCircle size={11} />
                            No
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/admin/customers/${customer.id}`}
                          className="w-7 h-7 inline-flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                          title="View customer profile"
                        >
                          <ChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Load More Controls */}
        <div className="px-5 py-3.5 bg-gray-50/70 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <span>
            Showing <strong className="text-black font-semibold">{filteredCustomers.length}</strong>{' '}
            customers
          </span>
          {hasMore ? (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="h-8 px-3 inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 hover:text-black hover:bg-gray-50 shadow-2xs transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:opacity-50"
            >
              {loadingMore ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Loading...
                </>
              ) : (
                'Load More'
              )}
            </button>
          ) : (
            <span className="text-[11px] text-gray-400 font-mono">End of directory</span>
          )}
        </div>
      </div>
    </div>
  )
}
