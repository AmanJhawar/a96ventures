'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Calendar, Clock, MessageSquare, AlertCircle, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { EASE_OUT } from '@/components/motion-transitions'
import { Visit, VisitKind } from '@/lib/types'
import { getTodayIST } from '@/lib/utils/date'
import CustomDatePicker from '@/components/custom-date-picker'
import { toast } from 'sonner'

export interface LogVisitSheetProps {
  isOpen: boolean
  customerId: string
  customerName: string
  onClose: () => void
  onSuccess: (visit: Visit) => void
}

const VISIT_KINDS: { kind: VisitKind; label: string; description: string }[] = [
  { kind: 'walk_in', label: 'Walk-in Visit', description: 'General in-store visit or consultation' },
  { kind: 'inquiry', label: 'Inquiry', description: 'Product, rate, or catalog query' },
  { kind: 'purchase', label: 'Store Purchase', description: 'In-store purchase interaction' },
  { kind: 'repair', label: 'Service & Repair', description: 'Cleaning, sizing, testing, maintenance' },
  { kind: 'follow_up', label: 'Follow-up', description: 'Scheduled follow-up contact' },
  { kind: 'return', label: 'Return / Exchange', description: 'Item return or exchange discussion' }
]

export default function LogVisitSheet({
  isOpen,
  customerId,
  customerName,
  onClose,
  onSuccess
}: LogVisitSheetProps) {
  const [kind, setKind] = useState<VisitKind | ''>('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [hasFollowUp, setHasFollowUp] = useState(false)
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpNote, setFollowUpNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sheetRef = useRef<HTMLDivElement>(null)

  const resetForm = useCallback(() => {
    setKind('')
    setDate('')
    setNotes('')
    setHasFollowUp(false)
    setFollowUpDate('')
    setFollowUpNote('')
    setError(null)
    setSubmitting(false)
  }, [])

  const handleClose = useCallback(() => {
    resetForm()
    onClose()
  }, [resetForm, onClose])

  // Escape key handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!kind) {
      setError('Please select an interaction type')
      return
    }
    if (!date) {
      setError('Please select a visit date')
      return
    }
    if (!notes.trim()) {
      setError('Please enter a note for this visit or interaction')
      return
    }
    if (hasFollowUp && !followUpDate) {
      setError('Please select a follow-up date')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const payload = {
        customerId,
        kind,
        date,
        notes: notes.trim(),
        followUpDate: hasFollowUp && followUpDate ? followUpDate : undefined,
        followUpNote: hasFollowUp && followUpNote.trim() ? followUpNote.trim() : undefined
      }

      const res = await fetch('/api/admin/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to log visit')
      }

      toast.success('Visit logged successfully')
      resetForm()
      onSuccess(data.visit)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to log visit'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          />

          {/* Slide-over Drawer */}
          <motion.div
            ref={sheetRef}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 border-l border-gray-200"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-black tracking-tight">Log Customer Visit</h3>
                <p className="text-xs text-gray-500 mt-0.5 font-medium truncate max-w-[280px]">
                  {customerName}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-black hover:bg-gray-100 transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between overflow-y-auto">
              <div className="p-6 space-y-5">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs font-medium text-red-700">
                    <AlertCircle size={14} className="shrink-0 text-red-500" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Visit Kind Selector */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-2">
                    Interaction Type <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {VISIT_KINDS.map((item) => (
                      <button
                        key={item.kind}
                        type="button"
                        onClick={() => setKind(item.kind)}
                        className={`w-full text-left p-2.5 rounded-lg border text-xs transition-[background-color,border-color,transform] duration-150 active:scale-[0.99] flex items-center justify-between ${
                          kind === item.kind
                            ? 'bg-black text-white border-black shadow-xs font-semibold'
                            : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50'
                        }`}
                      >
                        <div>
                          <div className="font-semibold">{item.label}</div>
                          <div className={`text-[10px] mt-0.5 ${kind === item.kind ? 'text-gray-300' : 'text-gray-400'}`}>
                            {item.description}
                          </div>
                        </div>
                        <span className={`w-2 h-2 rounded-full ${kind === item.kind ? 'bg-white' : 'bg-transparent'}`} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date Picker */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Calendar size={13} className="text-gray-500" />
                    <span>Visit Date</span>
                  </label>
                  <CustomDatePicker
                    value={date}
                    onChange={setDate}
                    placeholder="Select visit date"
                  />
                </div>

                {/* Interaction Note */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <MessageSquare size={13} className="text-gray-500" />
                    <span>Notes / Discussion Details <span className="text-red-500">*</span></span>
                  </label>
                  <textarea
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Inquired about 20g Lakshmi silver idol, planning anniversary purchase next week..."
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                  />
                </div>

                {/* Optional Follow-up Section */}
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-black flex items-center gap-1.5 cursor-pointer">
                      <Clock size={13} className="text-gray-500" />
                      <span>Schedule Follow-up</span>
                    </label>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={hasFollowUp}
                      onClick={() => setHasFollowUp(!hasFollowUp)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-[background-color] duration-150 focus:outline-none ${
                        hasFollowUp ? 'bg-black' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-[transform] duration-150 ${
                          hasFollowUp ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {hasFollowUp && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.16, ease: EASE_OUT }}
                      className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3"
                    >
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                          Follow-up Date <span className="text-red-500">*</span>
                        </label>
                        <CustomDatePicker
                          value={followUpDate}
                          onChange={setFollowUpDate}
                          placeholder="Select follow-up date"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                          Follow-up Task (Optional)
                        </label>
                        <input
                          type="text"
                          value={followUpNote}
                          onChange={(e) => setFollowUpNote(e.target.value)}
                          placeholder="e.g. Call back with silver rate quotation"
                          className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                        />
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Sheet Footer */}
              <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !notes.trim()}
                  className="px-5 py-2 text-xs font-semibold text-white bg-black hover:bg-black/85 rounded-lg shadow-xs transition-[background-color,opacity,transform] duration-150 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Visit'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
