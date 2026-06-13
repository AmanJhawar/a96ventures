'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('App Error boundary caught:', error)
  }, [error])

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
      <div className="text-8xl font-bold tracking-tighter text-gray-100 mb-6 select-none animate-fade-in-up-short">
        500
      </div>
      <h2 
        className="text-2xl md:text-3xl font-bold text-black mb-4 tracking-tight animate-fade-in-up opacity-0"
        style={{ animationDelay: '100ms' }}
      >
        Something went wrong
      </h2>
      <p 
        className="text-gray-500 max-w-md mx-auto mb-8 animate-fade-in-up opacity-0"
        style={{ animationDelay: '200ms' }}
      >
        An unexpected error occurred. We&apos;ve been notified and are looking into it.
      </p>
      <div 
        className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up opacity-0"
        style={{ animationDelay: '300ms' }}
      >
        <button 
          onClick={() => reset()} 
          className="btn-primary"
        >
          Try Again
        </button>
        <Link href="/catalog" className="px-6 py-3 text-sm font-semibold text-black bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          Return to Catalog
        </Link>
      </div>
    </div>
  )
}
