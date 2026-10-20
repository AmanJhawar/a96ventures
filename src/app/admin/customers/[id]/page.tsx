'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  Plus,
  Calendar,
  Clock,
  ShoppingBag,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Loader2,
  X
} from 'lucide-react'
import { Customer, Order, Visit, PaymentMode } from '@/lib/types'
import { getCustomerById, archiveCustomer, revealCustomerPan } from '@/lib/services/customers.service'
import { usePermissions } from '@/lib/context/PermissionsContext'
import { formatINR } from '@/lib/utils/money'
import { formatMgToGrams } from '@/lib/utils/weight'
import { ConfirmModal } from '@/components/confirm-modal'
import CustomerForm from '@/components/customer-form'
import LogVisitSheet from '@/components/log-visit-sheet'
import { toast } from 'sonner'

function formatISTDate(isoOrDateStr?: string | null): string {
  if (!isoOrDateStr) return '—'
  // If it's YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDateStr)) {
    const [y, m, d] = isoOrDateStr.split('-').map(Number)
    const dateObj = new Date(y, m - 1, d)
    return dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  const d = new Date(isoOrDateStr)
  if (isNaN(d.getTime())) return isoOrDateStr
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

function formatRelativeTime(isoStr?: string | null): string {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return isoStr
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diffSec < 60) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getPaymentBadgeClass(mode: PaymentMode): string {
  switch (mode) {
    case 'cash':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    case 'upi':
      return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
    case 'card':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
    case 'bank':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    case 'old_metal':
      return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20'
    default:
      return 'bg-secondary text-secondary-foreground border-border'
  }
}

export default function CustomerDetailPage() {
  const params = useParams()
  const customerId = params?.id as string
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeTab = searchParams.get('tab') || 'timeline'

  const { hasPermission, isSuperAdmin } = usePermissions()
  const canEdit = hasPermission('customers', 'edit')
  const canArchive = hasPermission('customers', 'delete') || isSuperAdmin
  const canViewPan = hasPermission('customers', 'viewPan') || isSuperAdmin
  const canAddVisit = hasPermission('visits', 'add')
  const canEditVisit = hasPermission('visits', 'edit')

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modals & Sheets
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false)
  const [isLogVisitOpen, setIsLogVisitOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)

  // PAN Reveal State & Timer
  const [revealedPan, setRevealedPan] = useState<string | null>(null)
  const [panCountdown, setPanCountdown] = useState(0)
  const [isRevealingPan, setIsRevealingPan] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // UI helpers
  const [copiedPhone, setCopiedPhone] = useState(false)
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let ignore = false
    async function load() {
      try {
        const data = await getCustomerById(customerId)
        if (!ignore) {
          setCustomer(data.customer)
          setOrders((data.orders || []) as unknown as Order[])
          setVisits((data.visits || []) as unknown as Visit[])
          setLoading(false)
        }
      } catch (err: unknown) {
        if (!ignore) {
          console.error('Failed to load customer:', err)
          setError(err instanceof Error ? err.message : 'Customer profile not found')
          setLoading(false)
        }
      }
    }
    if (customerId) {
      load()
    }
    return () => {
      ignore = true
    }
  }, [customerId])

  // Clear PAN timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const handleRevealPan = async () => {
    if (revealedPan) {
      // User manually toggles hide
      if (timerRef.current) clearInterval(timerRef.current)
      setRevealedPan(null)
      setPanCountdown(0)
      return
    }

    try {
      setIsRevealingPan(true)
      const res = await revealCustomerPan(customerId)
      setRevealedPan(res.fullPan)
      setPanCountdown(30)
      toast.info('PAN revealed for 30 seconds', { duration: 3000 })

      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        setPanCountdown((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current)
            setRevealedPan(null)
            toast.info('PAN auto-masked for security')
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reveal PAN')
    } finally {
      setIsRevealingPan(false)
    }
  }

  const handleCopyPhone = () => {
    if (!customer) return
    navigator.clipboard.writeText(customer.mobile.e164)
    setCopiedPhone(true)
    toast.success('Mobile copied to clipboard')
    setTimeout(() => setCopiedPhone(false), 2000)
  }

  const handleArchive = async () => {
    if (!customer) return
    setArchiving(true)
    try {
      await archiveCustomer(customer.id)
      toast.success('Customer archived successfully')
      router.push('/admin/customers')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive customer')
      setArchiving(false)
      setIsArchiveModalOpen(false)
    }
  }

  const handleMarkFollowUpDone = async (visitId: string) => {
    try {
      const res = await fetch(`/api/admin/visits/${visitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpDone: true })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update follow-up')
      }
      toast.success('Follow-up marked as completed')
      // Update local visits state
      setVisits((prev) =>
        prev.map((v) => (v.id === visitId ? { ...v, followUpDone: true } : v))
      )
      // Decrement open follow-ups in customer stat
      if (customer) {
        setCustomer({
          ...customer,
          stats: {
            ...customer.stats,
            openFollowUps: Math.max(0, (customer.stats.openFollowUps || 1) - 1)
          }
        })
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to complete follow-up')
    }
  }

  const toggleOrderAccordion = (orderId: string) => {
    setExpandedOrders((prev) => ({
      ...prev,
      [orderId]: !prev[orderId]
    }))
  }

  // Combined timeline items
  const timelineItems = useMemo(() => {
    type FeedItem =
      | { type: 'order'; timestamp: string; data: Order }
      | { type: 'visit'; timestamp: string; data: Visit }

    const combined: FeedItem[] = [
      ...orders.map((o) => ({
        type: 'order' as const,
        timestamp: o.createdAt || o.date,
        data: o
      })),
      ...visits.map((v) => ({
        type: 'visit' as const,
        timestamp: v.at,
        data: v
      }))
    ]

    return combined.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }, [orders, visits])

  // Open follow-ups
  const openFollowUps = useMemo(() => {
    return visits.filter((v) => v.followUpOn && !v.followUpDone)
  }, [visits])

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-secondary/60 rounded-md animate-pulse" />
        <div className="h-44 bg-card border border-border rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !customer) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center space-y-4 py-16">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 mx-auto flex items-center justify-center">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Customer Not Found</h2>
        <p className="text-sm text-muted-foreground">{error || 'Unable to locate this customer record.'}</p>
        <Link
          href="/admin/customers"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary/80 transition-[background-color,transform] duration-150 active:scale-[0.97]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Customers
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Top Navigation Breadcrumb & Back */}
      <div className="flex items-center justify-between">
        <Link
          href="/admin/customers"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-[color,transform] duration-150 active:scale-[0.97]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Customer Directory
        </Link>
      </div>

      {/* Header Profile Card */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {customer.displayName}
              </h1>
              {customer.stats.orderCount >= 5 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <Sparkles className="w-3 h-3" />
                  VIP Client
                </span>
              )}
              {customer.source && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-secondary text-muted-foreground capitalize">
                  {customer.source.replace('_', ' ')}
                </span>
              )}
            </div>

            {/* Contact Details Grid */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              {/* Phone */}
              <div className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                <a
                  href={`tel:${customer.mobile.e164}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {customer.mobile.e164}
                </a>
                <button
                  type="button"
                  onClick={handleCopyPhone}
                  title="Copy Phone"
                  className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copiedPhone ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>

              {/* Email */}
              {customer.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                  <a
                    href={`mailto:${customer.email}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {customer.email}
                  </a>
                </div>
              )}

              {/* Address */}
              {customer.address && (customer.address.city || customer.address.line1) && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>
                    {[
                      customer.address.line1,
                      customer.address.city,
                      customer.address.state,
                      customer.address.pincode
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </div>
              )}
            </div>

            {/* PAN Card Section */}
            <div className="pt-2 flex items-center gap-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50 border border-border text-xs">
                <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-mono text-muted-foreground font-medium">PAN:</span>
                {customer.hasPan && customer.pan ? (
                  <span className="font-mono font-bold tracking-wider text-foreground">
                    {revealedPan || customer.pan.masked}
                  </span>
                ) : (
                  <span className="text-muted-foreground italic">No PAN on file</span>
                )}

                {/* Reveal Button */}
                {customer.hasPan && canViewPan && (
                  <button
                    type="button"
                    onClick={handleRevealPan}
                    disabled={isRevealingPan}
                    className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline transition-colors disabled:opacity-50"
                  >
                    {isRevealingPan ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : revealedPan ? (
                      <>
                        <EyeOff className="w-3 h-3" />
                        <span>Hide ({panCountdown}s)</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3" />
                        <span>Reveal</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {canAddVisit && (
              <button
                type="button"
                onClick={() => setIsLogVisitOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-[background-color,transform] duration-150 active:scale-[0.97]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Log Visit</span>
              </button>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-xs font-semibold hover:bg-secondary/60 transition-[background-color,transform] duration-150 active:scale-[0.97]"
              >
                <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Edit</span>
              </button>
            )}

            {canArchive && (
              <button
                type="button"
                onClick={() => setIsArchiveModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-rose-500 text-xs font-semibold hover:bg-rose-500/10 hover:border-rose-500/20 transition-[background-color,transform] duration-150 active:scale-[0.97]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Archive</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stat Strip (8 KPI Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* First Visit */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            First Visit
          </p>
          <p className="text-xs font-bold text-foreground">
            {formatISTDate(customer.stats.firstVisitAt)}
          </p>
        </div>

        {/* Last Visit */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Last Visit
          </p>
          <p className="text-xs font-bold text-foreground">
            {formatISTDate(customer.stats.lastVisitAt)}
          </p>
        </div>

        {/* Visits Count */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Visits
          </p>
          <p className="text-base font-bold text-foreground">
            {customer.stats.visitCount ?? 0}
          </p>
        </div>

        {/* Bills Count */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Bills
          </p>
          <p className="text-base font-bold text-foreground">
            {customer.stats.orderCount ?? 0}
          </p>
        </div>

        {/* Lifetime Value */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Lifetime Value
          </p>
          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
            {formatINR(customer.stats.lifetimeValuePaise ?? 0)}
          </p>
        </div>

        {/* Average Bill */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Avg Bill
          </p>
          <p className="text-sm font-bold text-foreground">
            {customer.stats.orderCount > 0
              ? formatINR(Math.round(customer.stats.lifetimeValuePaise / customer.stats.orderCount))
              : '₹0'}
          </p>
        </div>

        {/* Gold Bought */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Gold Bought
          </p>
          <p className="text-xs font-bold font-mono text-amber-600 dark:text-amber-400">
            {formatMgToGrams(customer.stats.lifetimeWeightMg?.Gold ?? 0)}
          </p>
        </div>

        {/* Silver Bought */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Silver Bought
          </p>
          <p className="text-xs font-bold font-mono text-slate-500 dark:text-slate-400">
            {formatMgToGrams(customer.stats.lifetimeWeightMg?.Silver ?? 0)}
          </p>
        </div>
      </div>

      {/* Tabs Switcher: Timeline vs Bills */}
      <div className="border-b border-border">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => router.replace(`?tab=timeline`, { scroll: false })}
            className={`pb-3 text-xs font-semibold border-b-2 transition-[color,border-color] duration-150 relative ${
              activeTab === 'timeline'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Activity Timeline ({timelineItems.length})
          </button>
          <button
            type="button"
            onClick={() => router.replace(`?tab=bills`, { scroll: false })}
            className={`pb-3 text-xs font-semibold border-b-2 transition-[color,border-color] duration-150 relative ${
              activeTab === 'bills'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Bills & Purchases ({orders.length})
          </button>
        </div>
      </div>

      {/* Pinned Open Follow-Ups (Visible on Timeline Tab) */}
      {activeTab === 'timeline' && openFollowUps.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Open Follow-Up Required ({openFollowUps.length})
            </h3>
          </div>
          <div className="space-y-2">
            {openFollowUps.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between p-3 bg-card border border-amber-500/20 rounded-lg text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      Due: {formatISTDate(v.followUpOn)}
                    </span>
                    <span className="text-muted-foreground">· Logged by {v.staffName}</span>
                  </div>
                  {v.note && (
                    <p className="text-muted-foreground italic text-[11px]">
                      &quot;{v.note}&quot;
                    </p>
                  )}
                </div>
                {canEditVisit && (
                  <button
                    type="button"
                    onClick={() => handleMarkFollowUpDone(v.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-amber-500 text-white dark:text-neutral-950 font-semibold text-[11px] hover:bg-amber-600 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Mark Done</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Content: Timeline */}
      {activeTab === 'timeline' && (
        <div className="space-y-3">
          {timelineItems.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-xl space-y-2">
              <Calendar className="w-8 h-8 text-muted-foreground mx-auto opacity-50" />
              <p className="text-xs font-medium text-muted-foreground">
                No activity history found for this customer.
              </p>
              {canAddVisit && (
                <button
                  type="button"
                  onClick={() => setIsLogVisitOpen(true)}
                  className="mt-2 text-xs font-semibold text-primary hover:underline"
                >
                  Log first store visit
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {timelineItems.map((item) => {
                if (item.type === 'order') {
                  const order = item.data
                  const isExpanded = expandedOrders[order.id] || false
                  return (
                    <div
                      key={`order-${order.id}`}
                      className="bg-card border border-border rounded-xl p-4 shadow-2xs space-y-3 transition-[background-color] duration-150"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <ShoppingBag className="w-4 h-4" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold font-mono text-foreground">
                                {order.orderNo}
                              </span>
                              {order.isReversed ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                  <RotateCcw className="w-2.5 h-2.5" />
                                  Reversed
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  Bill Paid
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="text-xs text-muted-foreground">
                                {formatISTDate(order.date)} ({formatRelativeTime(order.createdAt)})
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              {order.payments?.map((p, idx) => (
                                <span
                                  key={idx}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border uppercase tracking-wider ${getPaymentBadgeClass(
                                    p.mode
                                  )}`}
                                >
                                  {p.mode.replace('_', ' ')} · {formatINR(p.amountPaise)}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold font-mono text-foreground">
                            {formatINR(order.totals.amountPaise)}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleOrderAccordion(order.id)}
                            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Line Items Accordion */}
                      {isExpanded && (
                        <div className="pt-3 border-t border-border space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Purchased Items ({order.lines?.length || 0})
                          </p>
                          <div className="divide-y divide-border bg-secondary/30 rounded-lg p-2">
                            {order.lines?.map((line, idx) => (
                              <div
                                key={idx}
                                className="py-2 flex items-center justify-between text-xs"
                              >
                                <div>
                                  <p className="font-semibold text-foreground">
                                    {line.productName}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {line.category} · {line.metal} · {line.qty} {line.qty === 1 ? 'unit' : 'units'}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-foreground">
                                    {formatINR(line.lineTotalPaise)}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    @{formatINR(line.unitPricePaise)}/unit
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }

                // Visit item
                const visit = item.data
                return (
                  <div
                    key={`visit-${visit.id}`}
                    className="bg-card border border-border rounded-xl p-4 shadow-2xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 uppercase tracking-wider">
                              {visit.kind}
                            </span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(visit.at)} by {visit.staffName}
                            </span>
                          </div>
                          {visit.note && (
                            <p className="text-xs text-foreground font-normal leading-relaxed">
                              {visit.note}
                            </p>
                          )}
                          {visit.followUpOn && (
                            <div className="flex items-center gap-2 pt-1 text-[11px]">
                              <span
                                className={`inline-flex items-center gap-1 font-medium ${
                                  visit.followUpDone
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-amber-600 dark:text-amber-400'
                                }`}
                              >
                                {visit.followUpDone ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Follow-up completed</span>
                                  </>
                                ) : (
                                  <>
                                    <Clock className="w-3 h-3" />
                                    <span>Follow-up due: {formatISTDate(visit.followUpOn)}</span>
                                  </>
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Bills & Purchases */}
      {activeTab === 'bills' && (
        <div className="space-y-3">
          {orders.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-xl space-y-2">
              <ShoppingBag className="w-8 h-8 text-muted-foreground mx-auto opacity-50" />
              <p className="text-xs font-medium text-muted-foreground">
                No orders or bills recorded for this customer yet.
              </p>
              <Link
                href="/admin/sales"
                className="inline-block mt-2 text-xs font-semibold text-primary hover:underline"
              >
                Go to Sales Terminal
              </Link>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-secondary/40 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Invoice #</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3">Payment Modes</th>
                    <th className="px-4 py-3 text-right">Total Amount</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="hover:bg-secondary/30 transition-colors"
                    >
                      <td className="px-4 py-3.5 font-bold font-mono text-foreground">
                        {order.orderNo}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {formatISTDate(order.date)}
                      </td>
                      <td className="px-4 py-3.5 text-foreground max-w-xs truncate">
                        {order.lines?.map((l) => `${l.qty}x ${l.productName}`).join(', ')}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {order.payments?.map((p, idx) => (
                            <span
                              key={idx}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium border uppercase tracking-wider ${getPaymentBadgeClass(
                                p.mode
                              )}`}
                            >
                              {p.mode.replace('_', ' ')}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold font-mono text-foreground">
                        {formatINR(order.totals.amountPaise)}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {order.isReversed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            Reversed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Active
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Customer Modal */}
      {isEditModalOpen && customer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-black">Edit Customer Profile</h2>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 text-gray-400 hover:text-black rounded-md transition-[color,transform] active:scale-[0.97]"
              >
                <X size={18} />
              </button>
            </div>
            <CustomerForm
              initialCustomer={customer}
              onSuccess={(updated) => {
                setCustomer(updated)
                setIsEditModalOpen(false)
                toast.success('Customer profile updated')
              }}
              onCancel={() => setIsEditModalOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Archive Customer Modal */}
      <ConfirmModal
        isOpen={isArchiveModalOpen}
        title="Archive Customer Profile"
        description="Are you sure you want to archive this customer? The profile will be removed from customer searches and directory listings. Their past orders and receipts remain intact."
        confirmText={archiving ? 'Archiving...' : 'Archive Customer'}
        disabled={archiving}
        onConfirm={handleArchive}
        onClose={() => setIsArchiveModalOpen(false)}
      />

      {/* Log Visit Slide-Over Sheet */}
      <LogVisitSheet
        isOpen={isLogVisitOpen}
        customerId={customer.id}
        customerName={customer.displayName}
        onClose={() => setIsLogVisitOpen(false)}
        onSuccess={(newVisit) => {
          setIsLogVisitOpen(false)
          setVisits((prev) => [newVisit, ...prev])
          // Increment visits count in local customer stat
          setCustomer((prev) =>
            prev
              ? {
                  ...prev,
                  stats: {
                    ...prev.stats,
                    visitCount: (prev.stats.visitCount || 0) + 1,
                    lastVisitAt: newVisit.at,
                    openFollowUps:
                      newVisit.followUpOn && !newVisit.followUpDone
                        ? (prev.stats.openFollowUps || 0) + 1
                        : prev.stats.openFollowUps
                  }
                }
              : prev
          )
          toast.success('Visit logged successfully')
        }}
      />
    </div>
  )
}
