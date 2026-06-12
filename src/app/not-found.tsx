import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
      <div className="text-8xl font-bold tracking-tighter text-gray-100 mb-6 select-none animate-[fadeInUp_400ms_var(--ease-out)_forwards]">
        404
      </div>
      <h2 className="text-2xl md:text-3xl font-bold text-black mb-4 tracking-tight animate-[fadeInUp_500ms_var(--ease-out)_forwards] [animation-delay:100ms] opacity-0">
        Page Not Found
      </h2>
      <p className="text-gray-500 max-w-md mx-auto mb-8 animate-[fadeInUp_600ms_var(--ease-out)_forwards] [animation-delay:200ms] opacity-0">
        We couldn't find the page you're looking for. The link might be broken or the page may have been removed.
      </p>
      <Link 
        href="/catalog" 
        className="btn-primary animate-[fadeInUp_700ms_var(--ease-out)_forwards] [animation-delay:300ms] opacity-0"
      >
        Return to Catalog
      </Link>
    </div>
  )
}
