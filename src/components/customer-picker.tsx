'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, UserCheck, UserPlus, UserX, X, ChevronDown, Loader2, Calendar } from 'lucide-react'
import { Customer } from '@/lib/types'
import { getCustomers } from '@/lib/services/customers.service'
import { usePermissions } from '@/lib/context/PermissionsContext'
import CustomerForm from '@/components/customer-form'

export interface CustomerPickerProps {
  selectedCustomer: Customer | null
  isWalkIn: boolean
  onSelectCustomer: (customer: Customer | null, isWalkIn?: boolean) => void
  onSelectWalkIn?: () => void
  onClear?: () => void
  disabled?: boolean
  className?: string
}

function formatDateDisplay(rawDate?: string) {
  if (!rawDate) return 'Never'
  const parts = rawDate.split('-')
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    }
  }
  return rawDate
}

export default function CustomerPicker({
  selectedCustomer,
  isWalkIn,
  onSelectCustomer,
  onSelectWalkIn,
  onClear,
  disabled = false,
  className = ''
}: CustomerPickerProps) {
  const { hasPermission } = usePermissions()
  const canAddCustomer = hasPermission('customers', 'add')

  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Close modal on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isRegisterModalOpen) {
        setIsRegisterModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isRegisterModalOpen])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Debounced search with 150ms timeout
  useEffect(() => {
    if (!isOpen) return

    const trimmed = query.trim()
    if (trimmed.length < 2) return

    setIsLoading(true)
    const timer = setTimeout(async () => {
      try {
        const { customers } = await getCustomers({
          q: trimmed,
          limit: 6
        })
        setResults(customers)
      } catch (err) {
        console.error('Customer search error:', err)
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }, 150)

    return () => clearTimeout(timer)
  }, [query, isOpen])

  const handleOpenDropdown = () => {
    if (disabled) return
    setIsOpen((prev) => !prev)
    if (!isOpen) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    }
  }

  const handleSelectCustomer = (customer: Customer) => {
    onSelectCustomer(customer, false)
    setIsOpen(false)
    setIsRegisterModalOpen(false)
    setQuery('')
  }

  const handleSelectWalkIn = () => {
    if (onSelectWalkIn) {
      onSelectWalkIn()
    } else {
      onSelectCustomer(null, true)
    }
    setIsOpen(false)
    setIsRegisterModalOpen(false)
    setQuery('')
  }

  const handleClearSelection = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onClear) {
      onClear()
    } else {
      onSelectCustomer(null, false)
    }
    setQuery('')
  }

  return (
    <div className={`relative ${className} ${isOpen ? 'z-50' : ''}`} ref={dropdownRef}>
      {/* Selected Customer / Trigger Bar - styled identically to CustomSelect and CustomDatePicker */}
      <button
        type="button"
        disabled={disabled}
        onClick={handleOpenDropdown}
        className={`w-full h-10 px-3.5 rounded-lg border bg-white text-left text-sm flex items-center justify-between gap-2 transition-[border-color,box-shadow,transform] duration-150 ease-[var(--ease-out)] focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 active:scale-[0.98] ${
          isOpen ? 'border-black ring-2 ring-black/10' : 'border-gray-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className="flex items-center gap-2 truncate min-w-0 flex-1">
          {selectedCustomer ? (
            <>
              <div className="w-5 h-5 rounded-full bg-black text-white flex items-center justify-center shrink-0">
                <UserCheck className="w-3 h-3" />
              </div>
              <div className="truncate text-left flex items-center gap-1.5 min-w-0">
                <span className="font-semibold text-black truncate">{selectedCustomer.displayName}</span>
                <span className="text-xs text-gray-500 shrink-0">
                  ({selectedCustomer.mobile?.countryCode} {selectedCustomer.mobile?.number})
                </span>
                {selectedCustomer.pan && (
                  <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 shrink-0 font-mono">
                    PAN: {selectedCustomer.pan.masked}
                  </span>
                )}
              </div>
            </>
          ) : isWalkIn ? (
            <>
              <div className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center shrink-0">
                <UserX className="w-3 h-3" />
              </div>
              <span className="text-sm font-medium text-black truncate">Walk-in Customer (No details recorded)</span>
            </>
          ) : (
            <>
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-gray-400 text-sm truncate">Search customer by mobile or name...</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {(selectedCustomer || isWalkIn) && !disabled ? (
            <span
              onClick={handleClearSelection}
              className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-black transition-[color,background-color] duration-150"
              title="Clear customer selection"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          ) : (
            <ChevronDown
              className={`w-4 h-4 text-gray-500 transition-transform duration-200 ease-[var(--ease-out)] ${
                isOpen ? 'rotate-180 text-black' : ''
              }`}
            />
          )}
        </div>
      </button>

      {/* Origin-Aware Dropdown Popover matching CustomSelect */}
      {isOpen && (
        <div
          className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-[0_10px_28px_rgba(0,0,0,0.08)] overflow-hidden origin-top min-w-[300px]"
          style={{ animation: 'popoverIn 160ms var(--ease-out) forwards' }}
        >
          {/* Search Header */}
          <div className="p-2 border-b border-gray-100 bg-gray-50/70 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0 ml-1.5" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                const val = e.target.value
                setQuery(val)
                if (val.trim().length < 2) {
                  setResults([])
                  setIsLoading(false)
                }
              }}
              placeholder="Type 2+ characters of mobile or name..."
              className="w-full bg-transparent text-xs text-black placeholder:text-gray-400 focus:outline-none py-1"
            />
            {isLoading && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin mr-1.5 shrink-0" />}
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto divide-y divide-gray-100">
            {/* Search Results */}
            {results.length > 0 && (
              <div className="py-1">
                {results.map((cust) => (
                  <button
                    key={cust.id}
                    type="button"
                    onClick={() => handleSelectCustomer(cust)}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-gray-50 flex items-center justify-between transition-[background-color] duration-100 active:scale-[0.99]"
                  >
                    <div>
                      <p className="text-sm font-semibold text-black">{cust.displayName}</p>
                      <p className="text-xs text-gray-500">
                        {cust.mobile?.countryCode} {cust.mobile?.number}
                        {cust.address?.city && ` • ${cust.address.city}`}
                      </p>
                    </div>
                    <div className="text-right text-[11px] text-gray-400">
                      <span className="flex items-center gap-1 justify-end">
                        <Calendar className="w-3 h-3" />
                        {formatDateDisplay(cust.stats?.lastVisitAt)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {query.trim().length >= 2 && results.length === 0 && !isLoading && (
              <div className="px-3 py-4 text-center text-xs text-gray-500 space-y-2">
                <p>No customers found matching &quot;{query}&quot;</p>
                {canAddCustomer && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false)
                      setIsRegisterModalOpen(true)
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white text-xs font-semibold hover:bg-gray-800 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                  >
                    <UserPlus size={13} />
                    <span>Register New Customer</span>
                  </button>
                )}
              </div>
            )}

            {/* Walk-in Option */}
            <button
              type="button"
              onClick={handleSelectWalkIn}
              className="w-full px-3.5 py-2.5 text-left hover:bg-gray-50 flex items-center gap-2.5 text-xs text-gray-600 hover:text-black transition-[background-color,color] duration-100 active:scale-[0.99]"
            >
              <UserX className="w-4 h-4 shrink-0 text-gray-400" />
              <div>
                <p className="font-semibold text-black">Walk-in, no details</p>
                <p className="text-[11px] text-gray-400">Proceed without linking a customer profile</p>
              </div>
            </button>

            {/* New Customer Option */}
            {canAddCustomer && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  setIsRegisterModalOpen(true)
                }}
                className="w-full px-3.5 py-2.5 text-left hover:bg-gray-50 flex items-center gap-2.5 text-xs text-black border-t border-gray-100 transition-[background-color] duration-100 active:scale-[0.99]"
              >
                <UserPlus className="w-4 h-4 shrink-0 text-black" />
                <div>
                  <p className="font-semibold text-black">New customer</p>
                  <p className="text-[11px] text-gray-500">Open registration dialog</p>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Real, centered New Customer Registration Modal Dialog via Portal */}
      {isRegisterModalOpen && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-[fadeIn_150ms_var(--ease-out)]"
          onClick={() => setIsRegisterModalOpen(false)}
        >
          <div
            className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto animate-[fadeInUp_180ms_var(--ease-out)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-5 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center shrink-0">
                  <UserPlus size={16} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-black">New Customer Registration</h2>
                  <p className="text-xs text-gray-500">
                    Register a new customer profile and link it immediately to this transaction.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRegisterModalOpen(false)}
                className="p-1 text-gray-400 hover:text-black rounded-md transition-[color,transform] active:scale-[0.97]"
                aria-label="Close registration modal"
              >
                <X size={18} />
              </button>
            </div>

            <CustomerForm
              asForm={false}
              onSuccess={(cust) => {
                handleSelectCustomer(cust)
                setIsRegisterModalOpen(false)
              }}
              onCancel={() => setIsRegisterModalOpen(false)}
              submitLabel="Save & Select Customer"
              initialValues={
                /^\d+$/.test(query.trim())
                  ? { mobile: query.trim() }
                  : { firstName: query.trim() }
              }
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
