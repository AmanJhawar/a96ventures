'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const newsletterSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address' })
})

type NewsletterValues = z.infer<typeof newsletterSchema>

export default function NewsletterForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<NewsletterValues>({
    resolver: zodResolver(newsletterSchema),
    defaultValues: { email: '' }
  })

  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const onSubmit = async (data: NewsletterValues) => {
    try {
      setStatus('idle')
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: data.email }),
      })

      if (!response.ok) {
        throw new Error('Subscription failed')
      }

      setStatus('success')
      reset()
    } catch (error) {
      setStatus('error')
    }
  }

  return (
    <div className="w-full max-w-[500px] mx-auto">
      <form className="flex flex-col sm:flex-row gap-4" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex-1">
          <input
            type="email"
            placeholder="Enter your email address"
            {...register('email')}
            className={`w-full px-6 py-4 border rounded-lg text-base bg-white transition-[border-color,box-shadow] duration-150 ease-[var(--ease-out)] focus:border-black focus:ring-4 focus:ring-black/10 ${
              errors.email ? 'border-gray-900' : 'border-gray-200'
            }`}
          />
        </div>
        <button 
          type="submit" 
          disabled={isSubmitting}
          className="btn-primary whitespace-nowrap active:opacity-60 disabled:opacity-50"
        >
          {isSubmitting ? 'Subscribing...' : 'Subscribe'}
        </button>
      </form>
      {errors.email && (
        <p className="text-gray-500 font-medium text-sm mt-2">{errors.email.message}</p>
      )}
      {status === 'success' && (
        <p className="text-green-600 font-medium text-sm mt-2">Thanks for subscribing!</p>
      )}
      {status === 'error' && (
        <p className="text-red-600 font-medium text-sm mt-2">Failed to subscribe. Please try again.</p>
      )}
    </div>
  )
}
