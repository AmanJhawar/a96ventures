import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
      <div className="text-8xl font-bold tracking-tighter text-gray-100 mb-6 select-none animate-fade-in-up-short">
        404
      </div>
      <h2 
        className="text-2xl md:text-3xl font-bold text-black mb-4 tracking-tight animate-fade-in-up opacity-0"
        style={{ animationDelay: '100ms' }}
      >
        Page Not Found
      </h2>
      <p 
        className="text-gray-500 max-w-md mx-auto mb-8 animate-fade-in-up opacity-0"
        style={{ animationDelay: '200ms' }}
      >
        We couldn&apos;t find the page you&apos;re looking for. It might have been moved or doesn&apos;t exist.
      </p>
      <Link 
        href="/catalog" 
        className="btn-primary animate-fade-in-up opacity-0"
        style={{ animationDelay: '300ms' }}
      >
        Return to Catalog
      </Link>
    </div>
  )
}
