import type { Metadata } from 'next'
import Link from 'next/link'
import { portfolioCompanies } from '@/data/portfolio'

export const metadata: Metadata = {
  title: 'Portfolio | A96 Ventures',
  description: 'We invest in exceptional founders building transformative companies across multiple sectors.',
}

export default function Portfolio() {
  return (
    <div className="py-20 min-h-[calc(100vh-160px)]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-20">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-black mb-6">
            Our Portfolio
          </h1>
          <p className="text-xl font-normal text-gray-500 leading-relaxed max-w-[600px] mx-auto">
            We invest in exceptional founders building transformative companies across multiple sectors.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
          {portfolioCompanies.map((company, index) => (
            <Link 
              key={company.slug} 
              href={`/portfolio/${company.slug}`} 
              className="block group opacity-0 animate-[fadeInUp_400ms_var(--ease-out)_forwards]"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="h-full bg-white border border-gray-300 rounded-xl p-8 transition-all duration-200 ease-[var(--ease-out)] @media(hover:hover):group-hover:-translate-y-1 @media(hover:hover):group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.1)] active:scale-[0.98]">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-2xl font-semibold text-black">{company.name}</h3>
                  <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-medium tracking-wide">
                    {company.stage}
                  </span>
                </div>
                <div className="text-sm font-medium text-black mb-4 tracking-wide">
                  {company.sector}
                </div>
                <p className="text-gray-500 leading-relaxed m-0">
                  {company.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
