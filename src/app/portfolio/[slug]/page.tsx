import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPortfolioCompanies, getPortfolioCompanyById } from '@/lib/firebase/db'

export async function generateStaticParams() {
  try {
    const companies = await getPortfolioCompanies()
    return companies.map((company) => ({
      slug: company.id,
    }))
  } catch (e) {
    console.error('Failed to generate static params for portfolio', e)
    throw e
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const resolvedParams = await params
  const company = await getPortfolioCompanyById(resolvedParams.slug)
  
  if (!company) {
    return {
      title: 'Company Not Found',
    }
  }

  return {
    title: `${company.name} | A96 Ventures`,
    description: company.description,
  }
}

export default async function PortfolioDetail({ 
  params 
}: { 
  params: Promise<{ slug: string }> 
}) {
  const resolvedParams = await params
  const company = await getPortfolioCompanyById(resolvedParams.slug)

  if (!company) {
    notFound()
  }

  return (
    <div className="pt-10 pb-20 min-h-[calc(100vh-160px)]">
      <div className="max-w-7xl mx-auto px-6">
        <Link 
          href="/portfolio" 
          className="inline-block mb-12 text-sm text-gray-500 no-underline transition-colors duration-200 ease-[var(--ease-out)] hover:text-black"
        >
          ← Back to Portfolio
        </Link>

        <div className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-black mb-6">
            {company.name}
          </h1>
        </div>

        <div>
          <p className="text-lg text-gray-500 leading-relaxed max-w-[800px] mx-auto text-center">
            {company.description}
          </p>
        </div>
      </div>
    </div>
  )
}
