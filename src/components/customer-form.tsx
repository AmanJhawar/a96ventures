'use client'

import React, { useState, useCallback } from 'react'
import { Check, AlertCircle, Loader2, ArrowRight } from 'lucide-react'
import { usePermissions } from '@/lib/context/PermissionsContext'
import { createCustomer, getCustomerById } from '@/lib/services/customers.service'
import { normaliseMobile } from '@/lib/utils/phone'
import { isValidPan } from '@/lib/server/pan'
import { Customer } from '@/lib/types'

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Delhi',
  'Jammu & Kashmir',
  'Ladakh',
  'Puducherry',
  'Chandigarh'
] as const

export const COUNTRY_CODES = [
  { code: '+91', label: 'India (+91)' },
  { code: '+1', label: 'USA / Canada (+1)' },
  { code: '+44', label: 'UK (+44)' },
  { code: '+971', label: 'UAE (+971)' },
  { code: '+65', label: 'Singapore (+65)' },
  { code: '+61', label: 'Australia (+61)' }
]

export interface CustomerFormProps {
  onSuccess: (customer: Customer) => void
  onCancel?: () => void
  initialValues?: {
    firstName?: string
    middleName?: string
    lastName?: string
    countryCode?: string
    mobile?: string
    email?: string
    pan?: string
  }
}

export default function CustomerForm({ onSuccess, onCancel, initialValues }: CustomerFormProps) {
  const { hasPermission } = usePermissions()
  const canEditPan = hasPermission('customers', 'editPan')

  const [firstName, setFirstName] = useState(initialValues?.firstName || '')
  const [middleName, setMiddleName] = useState(initialValues?.middleName || '')
  const [lastName, setLastName] = useState(initialValues?.lastName || '')
  const [countryCode, setCountryCode] = useState(initialValues?.countryCode || '+91')
  const [mobile, setMobile] = useState(initialValues?.mobile || '')
  const [email, setEmail] = useState(initialValues?.email || '')

  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState<string>('Karnataka')
  const [pincode, setPincode] = useState('')
  const [pan, setPan] = useState(initialValues?.pan || '')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [conflictState, setConflictState] = useState<{
    field: 'mobile' | 'pan'
    existingCustomerId: string
    customerName?: string
  } | null>(null)

  const validateField = useCallback(
    (field: string, value: string): string | null => {
      if (field === 'firstName') {
        if (!value.trim()) return 'First name is required'
      }
      if (field === 'lastName') {
        if (!value.trim()) return 'Last name is required'
      }
      if (field === 'mobile') {
        const norm = normaliseMobile(countryCode, value)
        if (!norm.success) return norm.error
      }
      if (field === 'email' && value.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(value.trim())) return 'Invalid email address format'
      }
      if (field === 'pincode' && value.trim()) {
        if (!/^\d{6}$/.test(value.trim())) return 'PIN code must be exactly 6 digits'
      }
      if (field === 'pan' && value.trim() && canEditPan) {
        if (!isValidPan(value.trim())) return 'Invalid PAN format. Must be 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)'
      }
      return null
    },
    [countryCode, canEditPan]
  )

  const handleBlur = (field: string, value: string) => {
    const errorMsg = validateField(field, value)
    setErrors((prev) => {
      const next = { ...prev }
      if (errorMsg) {
        next[field] = errorMsg
      } else {
        delete next[field]
      }
      return next
    })
  }

  const handleUseExistingCustomer = async () => {
    if (!conflictState?.existingCustomerId) return
    setIsSubmitting(true)
    try {
      const res = await getCustomerById(conflictState.existingCustomerId)
      onSuccess(res.customer)
    } catch (err: unknown) {
      console.error('Failed to fetch existing customer:', err)
      setErrors((prev) => ({
        ...prev,
        submit: err instanceof Error ? err.message : 'Failed to select existing customer'
      }))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setConflictState(null)

    // Validate all required fields
    const fErr = validateField('firstName', firstName)
    const lErr = validateField('lastName', lastName)
    const mErr = validateField('mobile', mobile)
    const eErr = validateField('email', email)
    const pErr = validateField('pincode', pincode)
    const panErr = validateField('pan', pan)

    const newErrors: Record<string, string> = {}
    if (fErr) newErrors.firstName = fErr
    if (lErr) newErrors.lastName = lErr
    if (mErr) newErrors.mobile = mErr
    if (eErr) newErrors.email = eErr
    if (pErr) newErrors.pincode = pErr
    if (panErr) newErrors.pan = panErr

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        firstName: firstName.trim(),
        middleName: middleName.trim() || undefined,
        lastName: lastName.trim(),
        countryCode,
        mobile: mobile.trim(),
        email: email.trim() || undefined,
        address:
          line1.trim() || city.trim() || pincode.trim()
            ? {
                line1: line1.trim() || undefined,
                line2: line2.trim() || undefined,
                city: city.trim() || undefined,
                state: state || undefined,
                pincode: pincode.trim() || undefined,
                country: 'India' as const
              }
            : undefined,
        pan: canEditPan && pan.trim() ? pan.trim().toUpperCase() : undefined,
        source: 'walk_in' as const
      }

      const res = await createCustomer(payload)
      onSuccess(res.customer)
    } catch (err: unknown) {
      const errorWithField = err as { field?: 'mobile' | 'pan'; existingCustomerId?: string; message?: string }
      if (errorWithField.field && errorWithField.existingCustomerId) {
        let custName: string | undefined
        try {
          const existing = await getCustomerById(errorWithField.existingCustomerId)
          custName = existing.customer.displayName
        } catch {
          // fallback if fetch fails
        }
        setConflictState({
          field: errorWithField.field,
          existingCustomerId: errorWithField.existingCustomerId,
          customerName: custName
        })
      } else {
        setErrors((prev) => ({
          ...prev,
          submit: err instanceof Error ? err.message : 'Failed to register customer'
        }))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {conflictState && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-amber-300">
            <p className="font-semibold text-amber-200">Existing Customer Match</p>
            <p className="mt-0.5">
              This {conflictState.field === 'pan' ? 'PAN' : 'mobile number'} already belongs to{' '}
              <span className="font-bold text-white">{conflictState.customerName || 'an existing customer'}</span>.
            </p>
            <button
              type="button"
              onClick={handleUseExistingCustomer}
              disabled={isSubmitting}
              className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              Use this customer <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {errors.submit && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-center gap-2 text-xs text-rose-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errors.submit}</span>
        </div>
      )}

      {/* Name Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">First Name *</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            onBlur={(e) => handleBlur('firstName', e.target.value)}
            placeholder="e.g. Aman"
            className={`w-full px-3 py-2 bg-secondary/50 border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary ${
              errors.firstName ? 'border-rose-500' : 'border-border'
            }`}
          />
          {errors.firstName && <p className="text-[11px] text-rose-500 mt-1 font-medium">{errors.firstName}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Middle Name</label>
          <input
            type="text"
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value)}
            placeholder="Optional"
            className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Last Name *</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            onBlur={(e) => handleBlur('lastName', e.target.value)}
            placeholder="e.g. Jhawar"
            className={`w-full px-3 py-2 bg-secondary/50 border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary ${
              errors.lastName ? 'border-rose-500' : 'border-border'
            }`}
          />
          {errors.lastName && <p className="text-[11px] text-rose-500 mt-1 font-medium">{errors.lastName}</p>}
        </div>
      </div>

      {/* Contact Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Mobile Number *</label>
          <div className="flex gap-2">
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="px-2.5 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              onBlur={(e) => handleBlur('mobile', e.target.value)}
              placeholder="10-digit mobile"
              className={`flex-1 px-3 py-2 bg-secondary/50 border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary ${
                errors.mobile ? 'border-rose-500' : 'border-border'
              }`}
            />
          </div>
          {errors.mobile && <p className="text-[11px] text-rose-500 mt-1 font-medium">{errors.mobile}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={(e) => handleBlur('email', e.target.value)}
            placeholder="client@example.com"
            className={`w-full px-3 py-2 bg-secondary/50 border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary ${
              errors.email ? 'border-rose-500' : 'border-border'
            }`}
          />
          {errors.email && <p className="text-[11px] text-rose-500 mt-1 font-medium">{errors.email}</p>}
        </div>
      </div>

      {/* PAN (Conditional on customers.editPan) */}
      {canEditPan && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            PAN Number <span className="text-[10px] text-muted-foreground font-normal">(Encrypted AES-256)</span>
          </label>
          <input
            type="text"
            value={pan}
            maxLength={10}
            onChange={(e) => setPan(e.target.value.toUpperCase())}
            onBlur={(e) => handleBlur('pan', e.target.value)}
            placeholder="ABCDE1234F"
            className={`w-full px-3 py-2 bg-secondary/50 border rounded-lg text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary ${
              errors.pan ? 'border-rose-500' : 'border-border'
            }`}
          />
          {errors.pan && <p className="text-[11px] text-rose-500 mt-1 font-medium">{errors.pan}</p>}
        </div>
      )}

      {/* Address Fields */}
      <div className="space-y-3 pt-2 border-t border-border/50">
        <p className="text-xs font-semibold text-foreground">Address Details</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={line1}
            onChange={(e) => setLine1(e.target.value)}
            placeholder="Address line 1"
            className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="text"
            value={line2}
            onChange={(e) => setLine2(e.target.value)}
            placeholder="Address line 2 / Area"
            className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
            className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <div>
            <input
              type="text"
              maxLength={6}
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
              onBlur={(e) => handleBlur('pincode', e.target.value)}
              placeholder="PIN code (6 digits)"
              className={`w-full px-3 py-2 bg-secondary/50 border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary ${
                errors.pincode ? 'border-rose-500' : 'border-border'
              }`}
            />
            {errors.pincode && <p className="text-[11px] text-rose-500 mt-1 font-medium">{errors.pincode}</p>}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-[background-color,transform] duration-150 active:scale-[0.97]"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Save & Select Customer</span>
            </>
          )}
        </button>
      </div>
    </form>
  )
}
