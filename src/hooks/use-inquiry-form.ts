import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { submitInquiry } from '@/lib/services/inquiry.service'

export const contactSchema = z.object({
  inquiryType: z.string().min(1, 'Please select an inquiry type'),
  firstName: z.string().min(1, 'First name is required'),
  middleName: z.string().optional(),
  lastName: z.string().min(1, 'Last name is required'),
  countryCode: z.string().regex(/^\d{1,4}$/, 'Invalid code (e.g. 91)'),
  mobile: z.string().regex(/^\d{7,15}$/, 'Must be between 7 and 15 digits'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  company: z.string().optional(),
  gstinPan: z.string().optional(),
  message: z.string().min(10, 'Message must be at least 10 characters long')
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
      message: ''
    }
  })

  const { reset } = form

  const onSubmit = async (data: ContactValues) => {
    setError('')
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
