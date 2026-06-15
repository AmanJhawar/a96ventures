'use client'

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

  const onSubmit = async (data: NewsletterValues) => {
    console.log('Email submitted:', data.email)
    reset()
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
        <p className="text-gray-500 font-medium text-sm font-medium mt-2">{errors.email.message}</p>
      )}
    </div>
  )
}
