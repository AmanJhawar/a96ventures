'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import CustomSelect from '@/components/custom-select'
import { submitInquiry } from '@/lib/firebase/db'
import { useCart } from '@/components/cart-provider'

function ContactForm() {
  const searchParams = useSearchParams()
  const { cartItems, clearCart } = useCart()
  const fromCart = searchParams.get('fromCart') === 'true'

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    message: '',
    inquiryType: fromCart ? 'product' : 'general'
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  // Pre-fill from Cart
  useEffect(() => {
    if (fromCart && cartItems.length > 0 && !formData.message) {
      const intro = "I would like to inquire about the following items:\n\n"
      const itemsList = cartItems.map(item => {
        let text = `- [${item.sku}] ${item.quantity}x ${item.productName}`
        const opts = []
        if (item.weight) {
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
      
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData(prev => ({
        ...prev,
        message: intro + itemsList + "\n\nAdditional comments:\n"
      }))
    }
  }, [fromCart, cartItems, formData.message])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> | { target: { name: string; value: string } }) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')
    
    try {
      await submitInquiry(formData)
      if (fromCart) {
        clearCart()
      }
      setSuccess(true)
      setFormData({
        name: '',
        email: '',
        company: '',
        message: '',
        inquiryType: 'general'
      })
      setTimeout(() => setSuccess(false), 5000)
    } catch (err) {
      console.error('Error submitting form:', err)
      setError('There was an error sending your message. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="flex flex-col">
        <label htmlFor="inquiryType" className="text-sm font-medium text-black mb-2">Inquiry Type</label>
        <CustomSelect
          id="inquiryType"
          name="inquiryType"
          value={formData.inquiryType}
          onChange={handleChange}
          options={[
            { value: "general", label: "General Inquiry" },
            { value: "product", label: "Product & Order Inquiry" },
            { value: "pitch", label: "Startup Pitch" },
            { value: "lp", label: "Limited Partner" },
            { value: "press", label: "Press & Media" },
            { value: "partnership", label: "Partnership" }
          ]}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="flex flex-col">
          <label htmlFor="name" className="text-sm font-medium text-black mb-2">Full Name *</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="px-4 py-3 border border-gray-200 rounded-lg text-base bg-white transition-colors duration-150 ease-[var(--ease-out)] focus:border-black focus:ring-4 focus:ring-black/10"
            required
          />
        </div>

        <div className="flex flex-col">
          <label htmlFor="email" className="text-sm font-medium text-black mb-2">Email Address *</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className="px-4 py-3 border border-gray-200 rounded-lg text-base bg-white transition-colors duration-150 ease-[var(--ease-out)] focus:border-black focus:ring-4 focus:ring-black/10"
            required
          />
        </div>
      </div>

      <div className="flex flex-col">
        <label htmlFor="company" className="text-sm font-medium text-black mb-2">Company</label>
        <input
          type="text"
          id="company"
          name="company"
          value={formData.company}
          onChange={handleChange}
          className="px-4 py-3 border border-gray-200 rounded-lg text-base bg-white transition-colors duration-150 ease-[var(--ease-out)] focus:border-black focus:ring-4 focus:ring-black/10"
        />
      </div>

      <div className="flex flex-col">
        <label htmlFor="message" className="text-sm font-medium text-black mb-2">Message *</label>
        <textarea
          id="message"
          name="message"
          value={formData.message}
          onChange={handleChange}
          className="px-4 py-3 border border-gray-200 rounded-lg text-base bg-white transition-colors duration-150 ease-[var(--ease-out)] focus:border-black focus:ring-4 focus:ring-black/10 resize-y min-h-[160px]"
          rows={8}
          required
        ></textarea>
      </div>

      {error && <p className="text-black text-sm font-semibold bg-gray-50 border border-gray-200 p-4 rounded-lg">{error}</p>}
      {success && (
        <div className="bg-black text-white text-sm font-medium p-4 rounded-lg flex items-center gap-3">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Thank you! Your inquiry has been sent.
        </div>
      )}

      <button 
        type="submit" 
        disabled={isSubmitting}
        className={`btn-primary border-none ${isSubmitting ? 'opacity-50' : 'cursor-pointer'}`}
      >
        {isSubmitting ? 'Sending...' : 'Send Message'}
      </button>
    </form>
  )
}

export default function Contact() {
  return (
    <div className="pt-10 pb-20 min-h-[calc(100vh-160px)]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-20">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-black mb-6">
            Contact Us
          </h1>
          <p className="text-xl font-normal text-gray-500 leading-relaxed max-w-[600px] mx-auto">
            Let&apos;s talk.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-20 max-w-[1000px] mx-auto">
          <div className="flex flex-col gap-10">
            <div>
              <h3 className="text-xl font-semibold text-black mb-4">For Entrepreneurs</h3>
              <p className="text-gray-500 leading-relaxed mb-4">Ready to pitch your startup? We&apos;d love to hear from exceptional founders building transformative companies.</p>
              <div className="text-gray-500 leading-relaxed">
                <strong className="text-black">Email:</strong> founders@a96ventures.com
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-black mb-4">Press &amp; Media</h3>
              <p className="text-gray-500 leading-relaxed mb-4">For press inquiries and media requests.</p>
              <div className="text-gray-500 leading-relaxed">
                <strong className="text-black">Email:</strong> press@a96ventures.com
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-black mb-4">Office Location</h3>
              <div className="text-gray-500 leading-relaxed">
                <strong className="text-black">Address:</strong><br />
                A96 Ventures Private Limited<br />
                Kolkata, WB<br />
                India
              </div>
            </div>
          </div>

          <div className="bg-[#f5f5f7] p-6 md:p-10 rounded-xl">
            <Suspense fallback={<div className="h-[500px] flex items-center justify-center">Loading form...</div>}>
              <ContactForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  )
}
