'use client'

import React from 'react'
import { AlertCircle } from 'lucide-react'

export function FormError({
  message,
  className = '',
  inline = false
}: {
  message?: string | null
  className?: string
  inline?: boolean
}) {
  if (!message) return null

  if (inline) {
    return (
      <span
        role="alert"
        className={`inline-flex items-center gap-1 text-xs text-rose-600 font-medium ${className}`}
      >
        <AlertCircle size={13} className="shrink-0 text-rose-500" />
        <span>{message}</span>
      </span>
    )
  }

  return (
    <div
      role="alert"
      className={`flex items-start gap-2 p-2.5 bg-rose-50 border border-rose-200/80 rounded-lg text-xs text-rose-700 font-medium ${className}`}
    >
      <AlertCircle size={14} className="shrink-0 text-rose-500 mt-0.5" />
      <span className="leading-snug">{message}</span>
    </div>
  )
}
