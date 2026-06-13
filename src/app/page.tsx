import type { Metadata } from 'next'
import Link from 'next/link'
import GoldenThreadHero from '@/components/GoldenThreadHero'
import NewsletterForm from '@/components/newsletter-form'
import { getBrands, getPortfolioCompanies } from '@/lib/firebase/db'

export const metadata: Metadata = {
  title: 'A96 Ventures | Early-Stage Venture Capital',
  description: 'We partner with visionaries to build tomorrow\'s defining companies.',
}

export default async function Home() {
  let brandsCount = 2
  let portfolioCount = 2
  try {
    const brands = await getBrands()
    const portfolio = await getPortfolioCompanies()
    brandsCount = brands.length
    portfolioCount = portfolio.length
  } catch (err) {
    console.error("Error fetching stats, falling back to defaults:", err)
  }
  
  const yearsExp = new Date().getFullYear() - 2017

  return (
    <>
      <GoldenThreadHero />

      {/* Newsletter Section */}
      <section className="py-20 md:py-32 bg-gray-100 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-[800px] mx-auto text-center">
            <span className="text-xs font-semibold tracking-widest text-gray-500 mb-4 block uppercase">STAY INFORMED</span>
            <h2 className="text-3xl md:text-4xl font-semibold leading-tight tracking-tight text-black mb-12">
              New collections, launches, and updates, direct to your inbox.
            </h2>
            <NewsletterForm />
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 md:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            <Link href="/portfolio" className="block text-center p-8 bg-white border border-gray-200 rounded-xl transition-[border-color,box-shadow,transform] duration-200 ease-[var(--ease-out)] hover:border-black/20 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 active:scale-[0.98]">
              <div className="text-4xl md:text-5xl font-bold leading-none text-black py-8">{portfolioCount}+</div>
              <div className="text-base text-gray-500">Portfolio Companies</div>
            </Link>
            
            <Link href="/brands" className="block text-center p-8 bg-white border border-gray-200 rounded-xl transition-[border-color,box-shadow,transform] duration-200 ease-[var(--ease-out)] hover:border-black/20 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 active:scale-[0.98]">
              <div className="text-4xl md:text-5xl font-bold leading-none text-black py-8">{brandsCount}+</div>
              <div className="text-base text-gray-500">Brands</div>
            </Link>
            
            <div className="block text-center p-8">
              <div className="text-4xl md:text-5xl font-bold leading-none text-black py-8">{yearsExp}+</div>
              <div className="text-base text-gray-500">Years of Experience</div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
