'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { AlertCircle, Loader2, ArrowRight } from 'lucide-react'
import { usePermissions } from '@/lib/context/PermissionsContext'
import { createCustomer, getCustomerById, updateCustomer, updateCustomerPan } from '@/lib/services/customers.service'
import { normaliseMobile } from '@/lib/utils/phone'
import { isValidPan } from '@/lib/utils/pan'
import { Customer } from '@/lib/types'
import CustomSelect from '@/components/custom-select'

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
  submitLabel?: string
  asForm?: boolean
  initialValues?: {
    firstName?: string
    middleName?: string
    lastName?: string
    countryCode?: string
    mobile?: string
    email?: string
    pan?: string
    notes?: string
    source?: 'walk_in' | 'inquiry' | 'referral' | 'import'
    inquiryId?: string
  }
  initialCustomer?: Customer
}

export default function CustomerForm({
  onSuccess,
  onCancel,
  submitLabel,
  asForm = true,
  initialValues,
  initialCustomer
}: CustomerFormProps) {
  const { hasPermission } = usePermissions()
  const canEditPan = hasPermission('customers', 'editPan')
  const isEditing = Boolean(initialCustomer)

  const stateOptions = useMemo(
    () => INDIAN_STATES.map((s) => ({ value: s, label: s })),
    []
  )

  const countryCodeOptions = useMemo(
    () => COUNTRY_CODES.map((c) => ({ value: c.code, label: c.code, sublabel: c.label })),
    []
  )

  const [firstName, setFirstName] = useState(initialCustomer?.firstName || initialValues?.firstName || '')
  const [middleName, setMiddleName] = useState(initialCustomer?.middleName || initialValues?.middleName || '')
  const [lastName, setLastName] = useState(initialCustomer?.lastName || initialValues?.lastName || '')
  const [countryCode, setCountryCode] = useState(initialCustomer?.mobile.countryCode || initialValues?.countryCode || '')
  const [mobile, setMobile] = useState(initialCustomer?.mobile.number || initialValues?.mobile || '')
  const [email, setEmail] = useState(initialCustomer?.email || initialValues?.email || '')

  const [line1, setLine1] = useState(initialCustomer?.address?.line1 || '')
  const [line2, setLine2] = useState(initialCustomer?.address?.line2 || '')
  const [city, setCity] = useState(initialCustomer?.address?.city || '')
  const [state, setState] = useState<string>(initialCustomer?.address?.state || '')
  const [pincode, setPincode] = useState(initialCustomer?.address?.pincode || '')
  const [pan, setPan] = useState(initialCustomer?.pan?.masked || initialValues?.pan || '')

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
        if (!countryCode) return 'Country code is required'
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
        if (isEditing && value.trim() === initialCustomer?.pan?.masked) {
          return null
        }
        if (!isValidPan(value.trim())) return 'Invalid PAN format. Must be 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)'
      }
      return null
    },
    [countryCode, canEditPan, isEditing, initialCustomer]
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

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault()
    }
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
      if (initialCustomer) {
        const address =
          line1.trim() || city.trim() || pincode.trim()
            ? {
                line1: line1.trim() || undefined,
                line2: line2.trim() || undefined,
                city: city.trim() || undefined,
                state: state || undefined,
                pincode: pincode.trim() || undefined,
                country: 'India' as const
              }
            : undefined

        const res = await updateCustomer(initialCustomer.id, {
          firstName: firstName.trim(),
          middleName: middleName.trim() || undefined,
          lastName: lastName.trim(),
          countryCode,
          mobile: mobile.trim(),
          email: email.trim() || undefined,
          address
        })

        let finalCustomer = res.customer

        // If PAN was modified to a new valid plaintext PAN (not the existing masked representation)
        if (canEditPan && pan.trim() && pan.trim() !== initialCustomer.pan?.masked && !pan.includes('•')) {
          const panRes = await updateCustomerPan(initialCustomer.id, pan.trim().toUpperCase())
          finalCustomer = panRes.customer
        }

        onSuccess(finalCustomer)
      } else {
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
          notes: initialValues?.notes,
          source: initialValues?.source || 'walk_in',
          inquiryId: initialValues?.inquiryId
        }

        const res = await createCustomer(payload)
        onSuccess(res.customer)
      }
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
      e.preventDefault()
      e.stopPropagation()
      handleSubmit(e)
    }
  }

  const formFields = (
    <>
      {conflictState && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-amber-900">
            <p className="font-semibold text-amber-950">Existing Customer Match</p>
            <p className="mt-0.5">
              This {conflictState.field === 'pan' ? 'PAN' : 'mobile number'} already belongs to{' '}
              <span className="font-bold text-black">{conflictState.customerName || 'an existing customer'}</span>.
            </p>
            <button
              type="button"
              onClick={handleUseExistingCustomer}
              disabled={isSubmitting}
              className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              Use this customer <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {errors.submit && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-700 font-medium">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errors.submit}</span>
        </div>
      )}

      {/* Name Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            First Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            onBlur={(e) => handleBlur('firstName', e.target.value)}
            placeholder="e.g. Aman"
            className={`h-10 w-full px-3.5 bg-white border rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 transition-[border-color,box-shadow] duration-150 ${
              errors.firstName
                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/10'
                : 'border-gray-200 focus:border-black focus:ring-black/10'
            }`}
          />
          {errors.firstName && <p className="text-[11px] text-rose-600 mt-1 font-medium">{errors.firstName}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Middle Name</label>
          <input
            type="text"
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value)}
            placeholder="Optional"
            className="h-10 w-full px-3.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 transition-[border-color,box-shadow] duration-150"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Last Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            onBlur={(e) => handleBlur('lastName', e.target.value)}
            placeholder="e.g. Jhawar"
            className={`h-10 w-full px-3.5 bg-white border rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 transition-[border-color,box-shadow] duration-150 ${
              errors.lastName
                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/10'
                : 'border-gray-200 focus:border-black focus:ring-black/10'
            }`}
          />
          {errors.lastName && <p className="text-[11px] text-rose-600 mt-1 font-medium">{errors.lastName}</p>}
        </div>
      </div>

      {/* Contact Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Mobile Number <span className="text-rose-500">*</span>
          </label>
          <div className="flex gap-2 items-start">
            <div className="w-24 shrink-0">
              <CustomSelect
                value={countryCode}
                onValueChange={setCountryCode}
                options={countryCodeOptions}
                placeholder="Code"
                searchable={false}
              />
            </div>
            <div className="flex-1">
              <input
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                onBlur={(e) => handleBlur('mobile', e.target.value)}
                placeholder="10-digit mobile"
                className={`h-10 w-full px-3.5 bg-white border rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 transition-[border-color,box-shadow] duration-150 ${
                  errors.mobile
                    ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/10'
                    : 'border-gray-200 focus:border-black focus:ring-black/10'
                }`}
              />
            </div>
          </div>
          {errors.mobile && <p className="text-[11px] text-rose-600 mt-1 font-medium">{errors.mobile}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={(e) => handleBlur('email', e.target.value)}
            placeholder="client@example.com"
            className={`h-10 w-full px-3.5 bg-white border rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 transition-[border-color,box-shadow] duration-150 ${
              errors.email
                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/10'
                : 'border-gray-200 focus:border-black focus:ring-black/10'
            }`}
          />
          {errors.email && <p className="text-[11px] text-rose-600 mt-1 font-medium">{errors.email}</p>}
        </div>
      </div>

      {/* PAN (Conditional on customers.editPan) */}
      {canEditPan && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            PAN Number <span className="text-[11px] text-gray-400 font-normal">(Encrypted AES-256)</span>
          </label>
          <input
            type="text"
            value={pan}
            maxLength={10}
            onChange={(e) => setPan(e.target.value.toUpperCase())}
            onBlur={(e) => handleBlur('pan', e.target.value)}
            placeholder="ABCDE1234F"
            className={`h-10 w-full px-3.5 bg-white border rounded-lg text-sm text-black font-mono placeholder-gray-400 uppercase focus:outline-none focus:ring-2 transition-[border-color,box-shadow] duration-150 ${
              errors.pan
                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/10'
                : 'border-gray-200 focus:border-black focus:ring-black/10'
            }`}
          />
          {errors.pan && <p className="text-[11px] text-rose-600 mt-1 font-medium">{errors.pan}</p>}
        </div>
      )}

      {/* Address Fields */}
      <div className="space-y-3 pt-3 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Address Details</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Address Line 1</label>
            <input
              type="text"
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              placeholder="e.g. #14, 2nd Cross, MG Road"
              className="h-10 w-full px-3.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 transition-[border-color,box-shadow] duration-150"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Address Line 2 / Area</label>
            <input
              type="text"
              value={line2}
              onChange={(e) => setLine2(e.target.value)}
              placeholder="e.g. Indiranagar"
              className="h-10 w-full px-3.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 transition-[border-color,box-shadow] duration-150"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Bengaluru"
              className="h-10 w-full px-3.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 transition-[border-color,box-shadow] duration-150"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">State</label>
            <CustomSelect
              value={state}
              onValueChange={setState}
              options={stateOptions}
              placeholder="Select state..."
              searchable={true}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">PIN code</label>
            <input
              type="text"
              maxLength={6}
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
              onBlur={(e) => handleBlur('pincode', e.target.value)}
              placeholder="e.g. 560038"
              className={`h-10 w-full px-3.5 bg-white border rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 transition-[border-color,box-shadow] duration-150 ${
                errors.pincode
                  ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/10'
                  : 'border-gray-200 focus:border-black focus:ring-black/10'
              }`}
            />
            {errors.pincode && <p className="text-[11px] text-rose-600 mt-1 font-medium">{errors.pincode}</p>}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="h-9 px-4 rounded-lg text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:text-black transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]"
          >
            Cancel
          </button>
        )}
        <button
          type={asForm ? 'submit' : 'button'}
          onClick={asForm ? undefined : (e) => {
            e.preventDefault()
            e.stopPropagation()
            handleSubmit(e)
          }}
          disabled={isSubmitting}
          className="h-9 inline-flex items-center justify-center gap-1.5 px-4 rounded-lg bg-black text-white text-xs font-semibold hover:bg-gray-800 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            submitLabel || (isEditing ? 'Save Changes' : 'Create Customer Profile')
          )}
        </button>
      </div>
    </>
  )

  if (!asForm) {
    return (
      <div onKeyDown={handleKeyDown} className="space-y-4">
        {formFields}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formFields}
    </form>
  )
}
