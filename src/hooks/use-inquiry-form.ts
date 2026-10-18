import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { submitInquiry } from '@/lib/services/inquiry.service'

export const contactSchema = z.object({
  inquiryType: z.string().min(1, 'Please select an inquiry type').max(50, 'Inquiry type too long'),
  firstName: z.string().min(1, 'First name is required').max(100),
  middleName: z.string().max(100).optional().or(z.literal('')),
  lastName: z.string().min(1, 'Last name is required').max(100),
  countryCode: z.string().regex(/^\d{1,4}$/, 'Invalid code (e.g. 91)'),
  mobile: z.string().regex(/^\d{7,15}$/, 'Must be between 7 and 15 digits'),
  email: z.string().email('Invalid email address').max(200).optional().or(z.literal('')),
  company: z.string().max(200).optional().or(z.literal('')),
  gstinPan: z.string().max(20).optional().or(z.literal('')),
  message: z.string().min(10, 'Message must be at least 10 characters long').max(5000),
  website: z.string().optional() // Honeypot trap: must remain empty for legitimate users
}).refine(data => {
  if (data.countryCode === '91') {
    return data.mobile.length === 10;
  }
  return true;
}, {
  message: 'Indian mobile numbers must be exactly 10 digits',
  path: ['mobile']
})

export type ContactValues = z.infer<typeof contactSchema>

export function useInquiryForm() {
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const formMountTime = useRef(Date.now())

  const form = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      inquiryType: 'general',
      firstName: '',
      middleName: '',
      lastName: '',
      countryCode: '91',
      mobile: '',
      email: '',
      company: '',
      gstinPan: '',
      message: '',
      website: ''
    }
  })

  const { reset } = form

  const onSubmit = async (data: ContactValues) => {
    setError('')

    // 1. Honeypot trap: If bot populated the hidden field, silently swallow with simulated success
    if (data.website && data.website.trim().length > 0) {
      console.warn('Bot submission trapped by honeypot.');
      setSuccess(true)
      reset()
      setTimeout(() => setSuccess(false), 5000)
      return
    }

    // 2. Minimum form completion speed check (traps automated script flooding)
    const now = Date.now()
    if (now - formMountTime.current < 1500) {
      console.warn('Submission completed inhumanly fast. Discarding bot traffic.');
      setSuccess(true)
      reset()
      setTimeout(() => setSuccess(false), 5000)
      return
    }

    // 3. Rate limiting: enforce cool-down period between submissions
    if (typeof window !== 'undefined') {
      const lastSubmit = Number(sessionStorage.getItem('a96_inquiry_last_submit') || '0')
      if (now - lastSubmit < 8000) {
        setError('Please wait a few moments before sending another inquiry.')
        return
      }
    }

    try {
      await submitInquiry({
        firstName: data.firstName,
        middleName: data.middleName,
        lastName: data.lastName,
        countryCode: '+' + data.countryCode,
        mobile: data.mobile,
        email: data.email || undefined,
        company: data.company || undefined,
        gstinPan: data.gstinPan || undefined,
        message: data.message,
        inquiryType: data.inquiryType
      })

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('a96_inquiry_last_submit', String(Date.now()))
      }
      formMountTime.current = Date.now()
      setSuccess(true)
      reset()
      setTimeout(() => setSuccess(false), 5000)
    } catch (err: unknown) {
      console.error('Error submitting form:', err)
      const message = err instanceof Error ? err.message : String(err)
      setError(`Submission failed: ${message}`)
    }
  }

  return {
    form,
    success,
    error,
    onSubmit
  }
}
