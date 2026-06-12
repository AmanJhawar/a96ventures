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
      <div className="text-8xl font-bold tracking-tighter text-gray-100 mb-6 select-none animate-[fadeInUp_400ms_var(--ease-out)_forwards]">
        500
      </div>
      <h2 className="text-2xl md:text-3xl font-bold text-black mb-4 tracking-tight animate-[fadeInUp_500ms_var(--ease-out)_forwards] [animation-delay:100ms] opacity-0">
        Something went wrong
      </h2>
      <p className="text-gray-500 max-w-md mx-auto mb-8 animate-[fadeInUp_600ms_var(--ease-out)_forwards] [animation-delay:200ms] opacity-0">
        An unexpected error occurred. We've been notified and are looking into it.
      </p>
      <div className="flex items-center justify-center gap-4 animate-[fadeInUp_700ms_var(--ease-out)_forwards] [animation-delay:300ms] opacity-0">
        <button 
          onClick={() => reset()} 
          className="btn-primary"
        >
          Try Again
        </button>
        <Link href="/catalog" className="px-8 py-4 text-base font-semibold text-gray-500 hover:text-black transition-colors duration-200">
          Return to Catalog
        </Link>
      </div>
    </div>
  )
}
