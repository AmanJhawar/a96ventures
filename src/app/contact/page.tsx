'use client'

import { useState } from 'react'
import CustomSelect from '@/components/custom-select'
import { submitInquiry } from '@/lib/firebase/db'

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    message: '',
    inquiryType: 'general'
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

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
    <div className="py-20 min-h-[calc(100vh-160px)]">
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

          <div className="bg-gray-100 p-6 md:p-10 rounded-xl">
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
                    className="px-4 py-3 border border-gray-300 rounded-lg text-base bg-white transition-colors duration-150 ease-[var(--ease)] focus:outline-none focus:border-black focus:ring-4 focus:ring-black/10"
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
                    className="px-4 py-3 border border-gray-300 rounded-lg text-base bg-white transition-colors duration-150 ease-[var(--ease)] focus:outline-none focus:border-black focus:ring-4 focus:ring-black/10"
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
                  className="px-4 py-3 border border-gray-300 rounded-lg text-base bg-white transition-colors duration-150 ease-[var(--ease)] focus:outline-none focus:border-black focus:ring-4 focus:ring-black/10"
                />
              </div>

              <div className="flex flex-col">
                <label htmlFor="message" className="text-sm font-medium text-black mb-2">Message *</label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  className="px-4 py-3 border border-gray-300 rounded-lg text-base bg-white transition-colors duration-150 ease-[var(--ease)] focus:outline-none focus:border-black focus:ring-4 focus:ring-black/10 resize-y min-h-[120px]"
                  rows={6}
                  required
                ></textarea>
              </div>

              {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
              {success && <p className="text-green-600 text-sm font-medium bg-green-50 p-4 rounded-lg">Thank you! Your inquiry has been sent.</p>}

              <button 
                type="submit" 
                disabled={isSubmitting}
                className={`bg-black text-white border-none px-8 py-4 rounded-lg text-base font-semibold transition-all duration-160 ease-[var(--ease-out)] @media(hover:hover):hover:bg-gray-700 active:scale-[0.97] ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
