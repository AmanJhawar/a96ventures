'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, UserPlus } from 'lucide-react'
import CustomerForm from '@/components/customer-form'
import { Customer } from '@/lib/types'

export default function NewCustomerPage() {
  const router = useRouter()

  const handleSaved = (customer: Customer) => {
    router.push(`/admin/customers/${customer.id}`)
  }

  const handleCancel = () => {
    router.push('/admin/customers')
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
        <Link
          href="/admin/customers"
          className="inline-flex items-center gap-1 hover:text-black transition-[color] duration-150"
        >
          <ArrowLeft size={13} />
          <span>Back to Customers</span>
        </Link>
        <span>/</span>
        <span className="text-black font-semibold">New Customer</span>
      </div>

      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center shrink-0 shadow-xs">
          <UserPlus size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight">Create Customer Profile</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Add a new customer to track visits, purchase history, and statutory identity details.
          </p>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden p-6 sm:p-8">
        <CustomerForm onSuccess={handleSaved} onCancel={handleCancel} />
      </div>
    </div>
  )
}
