import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { submitInquiry } from '@/lib/services/inquiry.service'
import { useCart } from '@/components/cart-provider'

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
  const searchParams = useSearchParams()
  const { cartItems, clearCart } = useCart()
  const fromCart = searchParams.get('fromCart') === 'true'

  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const form = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      inquiryType: fromCart ? 'product' : 'general',
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

  const { control, setValue, reset } = form
  const currentMessage = useWatch({ control, name: 'message' })

  // Pre-fill from Cart
  useEffect(() => {
    if (fromCart && cartItems.length > 0 && !currentMessage) {
      const intro = "I would like to inquire about the following items:\n\n"
      const itemsList = cartItems.map(item => {
        let text = `- [${item.sku}] ${item.quantity}x ${item.productName}`
        const opts = []
        if (item.selectedSize) opts.push(`Size: ${item.selectedSize}`)
        if (item.selectedPurity) opts.push(`Purity: ${item.selectedPurity}%`)
        if (item.selectedStone) opts.push(`Stone: ${item.selectedStone}`)
        if (item.selectedWeight) {
          opts.push(`Weight: ${item.selectedWeight}`)
        } else if (item.weight) {
          const formattedWeight = item.weight.toLowerCase().endsWith('g') || item.weight.toLowerCase().endsWith('kg')
            ? item.weight
            : `${item.weight}g`
          opts.push(`Approx Weight: ${formattedWeight}`)
        }
        if (opts.length > 0) {
          text += ` (${opts.join(', ')})`
        }
        return text
      }).join('\n')
      
      setValue('message', intro + itemsList + "\n\nAdditional comments:\n", { shouldValidate: true })
    }
  }, [fromCart, cartItems, currentMessage, setValue])

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
      if (fromCart) {
        clearCart()
      }
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
