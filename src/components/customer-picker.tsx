'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Search, UserCheck, UserPlus, UserX, X, ChevronDown, Loader2, Calendar } from 'lucide-react'
import { Customer } from '@/lib/types'
import { getCustomers } from '@/lib/services/customers.service'
import { usePermissions } from '@/lib/context/PermissionsContext'
import CustomerForm from '@/components/customer-form'

export interface CustomerPickerProps {
  selectedCustomer: Customer | null
  isWalkIn: boolean
  onSelectCustomer: (customer: Customer | null, isWalkIn: boolean) => void
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
  disabled = false,
  className = ''
}: CustomerPickerProps) {
  const { hasPermission } = usePermissions()
  const canAddCustomer = hasPermission('customers', 'add')

  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showInlineForm, setShowInlineForm] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setShowInlineForm(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Debounced search with 150ms timeout
  useEffect(() => {
    if (!isOpen || showInlineForm) return

    const trimmed = query.trim()
    if (trimmed.length < 2) return

    let cancelled = false
    const timeout = setTimeout(async () => {
      try {
        setIsLoading(true)
        const res = await getCustomers({ q: trimmed, limit: 10 })
        if (!cancelled) {
          setResults(res.customers || [])
        }
      } catch (err) {
        console.error('Failed to search customers:', err)
        if (!cancelled) {
          setResults([])
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }, 150)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [query, isOpen, showInlineForm])

  const handleOpenDropdown = () => {
    if (disabled) return
    setIsOpen(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleSelectCustomer = (cust: Customer) => {
    onSelectCustomer(cust, false)
    setIsOpen(false)
    setShowInlineForm(false)
    setQuery('')
  }

  const handleSelectWalkIn = () => {
    onSelectCustomer(null, true)
    setIsOpen(false)
    setShowInlineForm(false)
    setQuery('')
  }

  const handleClearSelection = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelectCustomer(null, false)
    setQuery('')
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Selected Customer / Trigger Bar */}
      <div
        onClick={handleOpenDropdown}
        className={`w-full px-3 py-2.5 rounded-lg border text-sm transition-[background-color,border-color,transform] duration-150 flex items-center justify-between cursor-pointer ${
          disabled
            ? 'opacity-60 cursor-not-allowed bg-secondary/30 border-border'
            : 'bg-secondary/40 hover:bg-secondary/60 border-border active:scale-[0.99]'
        } ${selectedCustomer || isWalkIn ? 'border-primary/40' : ''}`}
      >
        <div className="flex items-center gap-2.5 truncate">
          {selectedCustomer ? (
            <>
              <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
                <UserCheck className="w-3.5 h-3.5" />
              </div>
              <div className="truncate text-left">
                <span className="font-semibold text-foreground">{selectedCustomer.displayName}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  ({selectedCustomer.mobile?.countryCode} {selectedCustomer.mobile?.number})
                </span>
                {selectedCustomer.pan && (
                  <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground ml-2 font-mono">
                    PAN: {selectedCustomer.pan.masked}
                  </span>
                )}
              </div>
            </>
          ) : isWalkIn ? (
            <>
              <div className="w-6 h-6 rounded-full bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                <UserX className="w-3.5 h-3.5" />
              </div>
              <span className="text-sm font-medium text-foreground">Walk-in Customer (No details recorded)</span>
            </>
          ) : (
            <>
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground text-sm">Search customer by mobile or name...</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {(selectedCustomer || isWalkIn) && !disabled ? (
            <button
              type="button"
              onClick={handleClearSelection}
              className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-[color,background-color] duration-150"
              title="Clear customer selection"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Origin-Aware Dropdown Popover */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-background border border-border/80 rounded-xl shadow-2xl overflow-hidden origin-top animate-in fade-in-0 zoom-in-95 duration-150">
          {showInlineForm ? (
            <div className="p-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">New Customer Registration</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInlineForm(false)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-[color,background-color] duration-150"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <CustomerForm
                onSuccess={(cust) => handleSelectCustomer(cust)}
                onCancel={() => setShowInlineForm(false)}
                initialValues={
                  /^\d+$/.test(query.trim())
                    ? { mobile: query.trim() }
                    : { firstName: query.trim() }
                }
              />
            </div>
          ) : (
            <div>
              {/* Search Header */}
              <div className="p-2 border-b border-border flex items-center gap-2 bg-secondary/20">
                <Search className="w-4 h-4 text-muted-foreground shrink-0 ml-1.5" />
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
                  className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none py-1"
                />
                {isLoading && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin mr-1.5 shrink-0" />}
              </div>

              {/* Options List */}
              <div className="max-h-60 overflow-y-auto divide-y divide-border/40">
                {/* Search Results (No layout-shift animation per Emil Kowalski rule) */}
                {results.length > 0 && (
                  <div className="py-1">
                    {results.map((cust) => (
                      <button
                        key={cust.id}
                        type="button"
                        onClick={() => handleSelectCustomer(cust)}
                        className="w-full px-3 py-2 text-left hover:bg-secondary/70 flex items-center justify-between transition-[background-color] duration-100 active:scale-[0.99]"
                      >
                        <div>
                          <p className="text-sm font-semibold text-foreground">{cust.displayName}</p>
                          <p className="text-xs text-muted-foreground">
                            {cust.mobile?.countryCode} {cust.mobile?.number}
                            {cust.address?.city && ` • ${cust.address.city}`}
                          </p>
                        </div>
                        <div className="text-right text-[11px] text-muted-foreground">
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
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    No customers found matching &quot;{query}&quot;
                  </div>
                )}

                {/* Walk-in Option */}
                <button
                  type="button"
                  onClick={handleSelectWalkIn}
                  className="w-full px-3 py-2.5 text-left hover:bg-secondary/50 flex items-center gap-2.5 text-xs text-muted-foreground hover:text-foreground transition-[background-color,color] duration-100 active:scale-[0.99]"
                >
                  <UserX className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="font-semibold text-foreground">Walk-in, no details</p>
                    <p className="text-[11px] text-muted-foreground">Proceed without linking a customer profile</p>
                  </div>
                </button>

                {/* New Customer Option */}
                {canAddCustomer && (
                  <button
                    type="button"
                    onClick={() => setShowInlineForm(true)}
                    className="w-full px-3 py-2.5 text-left hover:bg-primary/10 flex items-center gap-2.5 text-xs text-primary transition-[background-color] duration-100 active:scale-[0.99]"
                  >
                    <UserPlus className="w-4 h-4 shrink-0 text-primary" />
                    <div>
                      <p className="font-semibold text-primary">New customer</p>
                      <p className="text-[11px] text-primary/80">Register a new profile inline</p>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
