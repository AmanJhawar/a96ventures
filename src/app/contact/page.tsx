'use client'

import { Suspense } from 'react'
import CustomSelect from '@/components/custom-select'
import { Controller } from 'react-hook-form'
import { useInquiryForm } from '@/hooks/use-inquiry-form'

function ContactForm() {
  const { form, success, error, onSubmit } = useInquiryForm()
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = form

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col">
        <label htmlFor="inquiryType" className="text-sm font-medium text-black mb-2">Inquiry Type</label>
        <Controller
          name="inquiryType"
          control={control}
          render={({ field }) => (
            <CustomSelect
              id="inquiryType"
              name="inquiryType"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "general", label: "General Inquiry" },
                { value: "product", label: "Product & Order Inquiry" },
                { value: "pitch", label: "Startup Pitch" },
                { value: "lp", label: "Limited Partner" },
                { value: "press", label: "Press & Media" },
                { value: "partnership", label: "Partnership" }
              ]}
            />
          )}
        />
        {errors.inquiryType && <p className="text-gray-500 font-medium text-sm mt-1">{errors.inquiryType.message}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="flex flex-col">
          <label htmlFor="firstName" className="text-sm font-medium text-black mb-2">First Name *</label>
          <input
            type="text"
            id="firstName"
            placeholder="e.g., Jane"
            {...register('firstName')}
            className={`px-4 py-3 border rounded-lg text-base bg-white transition-colors duration-150 ease-[var(--ease-out)] focus:border-black focus:ring-4 focus:ring-black/10 ${errors.firstName ? 'border-gray-900' : 'border-gray-200'}`}
          />
          {errors.firstName && <p className="text-gray-500 font-medium text-sm mt-1">{errors.firstName.message}</p>}
        </div>

        <div className="flex flex-col">
          <label htmlFor="middleName" className="text-sm font-medium text-black mb-2">Middle Name</label>
          <input
            type="text"
            id="middleName"
            placeholder="e.g., A."
            {...register('middleName')}
            className="px-4 py-3 border border-gray-200 rounded-lg text-base bg-white transition-colors duration-150 ease-[var(--ease-out)] focus:border-black focus:ring-4 focus:ring-black/10"
          />
        </div>

        <div className="flex flex-col">
          <label htmlFor="lastName" className="text-sm font-medium text-black mb-2">Last Name *</label>
          <input
            type="text"
            id="lastName"
            placeholder="e.g., Doe"
            {...register('lastName')}
            className={`px-4 py-3 border rounded-lg text-base bg-white transition-colors duration-150 ease-[var(--ease-out)] focus:border-black focus:ring-4 focus:ring-black/10 ${errors.lastName ? 'border-gray-900' : 'border-gray-200'}`}
          />
          {errors.lastName && <p className="text-gray-500 font-medium text-sm mt-1">{errors.lastName.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="flex flex-col">
          <label htmlFor="mobile" className="text-sm font-medium text-black mb-2">Phone Number *</label>
          <div className="flex gap-2 relative items-center">
            <span className="absolute left-4 text-gray-500 font-medium pointer-events-none">+</span>
            <input
              type="tel"
              id="countryCode"
              placeholder="91"
              {...register('countryCode', {
                onChange: (e) => {
                  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
                }
              })}
              className={`w-20 min-w-0 pl-8 pr-3 py-3 border rounded-lg text-base bg-white transition-colors duration-150 ease-[var(--ease-out)] focus:border-black focus:ring-4 focus:ring-black/10 ${errors.countryCode ? 'border-gray-900' : 'border-gray-200'}`}
            />
              <input
              type="tel"
              id="mobile"
              {...register('mobile', {
                onChange: (e) => {
                  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 15);
                }
              })}
              placeholder="e.g., 9876543210"
              className={`flex-1 min-w-0 px-4 py-3 border rounded-lg text-base bg-white transition-colors duration-150 ease-[var(--ease-out)] focus:border-black focus:ring-4 focus:ring-black/10 ${errors.mobile ? 'border-gray-900' : 'border-gray-200'}`}
            />
          </div>
          {(errors.countryCode || errors.mobile) && (
            <p className="text-gray-500 font-medium text-sm mt-1">
              {errors.countryCode?.message || errors.mobile?.message}
            </p>
          )}
        </div>

        <div className="flex flex-col">
          <label htmlFor="email" className="text-sm font-medium text-black mb-2">Email Address</label>
          <input
            type="email"
            id="email"
            placeholder="e.g., jane@example.com"
            {...register('email')}
            className={`px-4 py-3 border rounded-lg text-base bg-white transition-colors duration-150 ease-[var(--ease-out)] focus:border-black focus:ring-4 focus:ring-black/10 ${errors.email ? 'border-gray-900' : 'border-gray-200'}`}
          />
          {errors.email && <p className="text-gray-500 font-medium text-sm mt-1">{errors.email.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="flex flex-col">
          <label htmlFor="company" className="text-sm font-medium text-black mb-2">Company Name</label>
          <input
            type="text"
            id="company"
            placeholder="e.g., Acme Corp"
            {...register('company')}
            className="px-4 py-3 border border-gray-200 rounded-lg text-base bg-white transition-colors duration-150 ease-[var(--ease-out)] focus:border-black focus:ring-4 focus:ring-black/10"
          />
        </div>

        <div className="flex flex-col">
          <label htmlFor="gstinPan" className="text-sm font-medium text-black mb-2">GSTIN / PAN</label>
          <input
            type="text"
            id="gstinPan"
            {...register('gstinPan')}
            className="px-4 py-3 border border-gray-200 rounded-lg text-base bg-white transition-colors duration-150 ease-[var(--ease-out)] focus:border-black focus:ring-4 focus:ring-black/10 uppercase"
            placeholder="e.g., ABCDE1234F"
          />
        </div>
      </div>

      {/* Hidden honeypot field to trap spam bots without affecting legitimate users */}
      <div
        aria-hidden="true"
        style={{
          opacity: 0,
          position: 'absolute',
          top: 0,
          left: '-9999px',
          height: 0,
          width: 0,
          zIndex: -1,
          overflow: 'hidden',
          pointerEvents: 'none'
        }}
      >
        <label htmlFor="website">Leave this field blank</label>
        <input
          type="text"
          id="website"
          autoComplete="off"
          tabIndex={-1}
          {...register('website')}
        />
      </div>

      <div className="flex flex-col">
        <label htmlFor="message" className="text-sm font-medium text-black mb-2">Message *</label>
        <textarea
          id="message"
          placeholder="How can we help you?"
          {...register('message')}
          className={`px-4 py-3 border rounded-lg text-base bg-white transition-colors duration-150 ease-[var(--ease-out)] focus:border-black focus:ring-4 focus:ring-black/10 resize-y min-h-[160px] ${errors.message ? 'border-gray-900' : 'border-gray-200'}`}
          rows={8}
        ></textarea>
        {errors.message && <p className="text-gray-500 font-medium text-sm mt-1">{errors.message.message}</p>}
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
        className={`btn-primary border-none ${isSubmitting ? 'opacity-50' : ''}`}
      >
        {isSubmitting ? 'Sending...' : 'Send Message'}
      </button>
    </form>
  )
}

export default function Contact() {
  return (
    <div className="pt-10 pb-20 min-h-[calc(100vh-160px)]">
      <div className="max-w-8xl mx-auto px-6">
        <div className="text-center mb-20">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-black mb-6">
            Contact Us
          </h1>
          <p className="text-xl font-normal text-gray-500 leading-relaxed max-w-[600px] mx-auto">
            Let&apos;s talk.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-12 lg:gap-20 max-w-[1200px] mx-auto">
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
