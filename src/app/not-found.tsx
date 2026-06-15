import Link from 'next/link'
import { StaggerContainer, FadeInUp } from '@/components/motion-transitions'

export default function NotFound() {
  return (
    <StaggerContainer className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
      <FadeInUp className="text-8xl font-bold tracking-tight text-gray-100 mb-6 select-none">
        404
      </FadeInUp>
      <FadeInUp 
        className="text-2xl md:text-3xl font-bold text-black mb-4 tracking-tight"
      >
        Page Not Found
      </FadeInUp>
      <FadeInUp 
        className="text-gray-500 max-w-md mx-auto mb-8"
      >
        We couldn&apos;t find the page you&apos;re looking for. It might have been moved or doesn&apos;t exist.
      </FadeInUp>
      <FadeInUp 
        className="btn-primary inline-flex"
      >
        <Link href="/catalog">
          Return to Catalog
        </Link>
      </FadeInUp>
    </StaggerContainer>
  )
}
