import type { Metadata } from 'next'
import Link from 'next/link'
import UnicornHero from '@/components/UnicornHero'
import { getBrands } from '@/lib/services/brand.service'
import { getPortfolioCompanies } from '@/lib/services/portfolio.service'

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
      <UnicornHero />



      {/* Stats Section */}
      <section className="py-20 md:py-32 bg-white">
        <div className="max-w-8xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            <Link href="/portfolio" className="block text-center p-8 bg-white border border-gray-200 rounded-xl transition-[border-color,box-shadow,transform] duration-200 ease-[var(--ease-out)] hover:border-black/20 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 active:scale-[0.97]">
              <div className="text-4xl md:text-5xl font-bold leading-none text-black py-8">{portfolioCount}+</div>
              <div className="text-base text-gray-500">Portfolio Companies</div>
            </Link>

            <Link href="/brands" className="block text-center p-8 bg-white border border-gray-200 rounded-xl transition-[border-color,box-shadow,transform] duration-200 ease-[var(--ease-out)] hover:border-black/20 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 active:scale-[0.97]">
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
