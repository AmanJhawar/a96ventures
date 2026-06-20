import { getStoreCategories } from '@/lib/services/catalog.service'
import { getCatalogPage } from '@/lib/services/catalog.service'
import Link from 'next/link'
import { CatalogClient } from './catalog-client'
import { EmptyState } from '@/components/empty-state'
import { StaggerContainer, FadeInUp } from '@/components/motion-transitions'

import { CatalogItem } from '@/lib/types'

export const revalidate = 3600 // Revalidate cache hourly

export default async function Catalog() {
  let items: CatalogItem[] = []
  let categories: string[] = []
  let error = false

  let nextCursor: string | null = null
  let hasNext = false

  try {
    const [pageResult, fetchedCategories] = await Promise.all([
      getCatalogPage(6, { category: 'All', sortBy: 'default' }, null),
      getStoreCategories()
    ])
    items = pageResult.items
    nextCursor = pageResult.lastCursor
    hasNext = pageResult.hasNext
    categories = fetchedCategories
  } catch (err) {
    console.error("Failed to load catalog:", err)
    error = true
  }

  const allCategories = ['All', ...categories]

  return (
    <div className="pt-10 pb-20 min-h-[calc(100vh-160px)]">
      {/* Catalog Hero */}
      <div className="relative py-12 mb-12">
        <div className="max-w-8xl mx-auto px-6 relative z-10">
          <StaggerContainer className="text-center">
            <FadeInUp className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-black mb-6">
              Catalog
            </FadeInUp>
            <FadeInUp 
              className="text-xl font-normal text-gray-500 leading-relaxed max-w-[600px] mx-auto"
            >
              Silver articles, marble frames and bullion, made to order.
            </FadeInUp>
          </StaggerContainer>
        </div>
      </div>

      {error ? (
        <div className="py-20">
          <EmptyState 
            title="Failed to Load Products" 
            description="We encountered a problem loading our catalog collection. Please try again later."
            action={
              <Link href="/catalog" className="btn-primary">
                Retry
              </Link>
            }
          />
        </div>
      ) : (
        <CatalogClient 
          initialItems={items} 
          initialCategories={allCategories} 
          initialNextCursor={nextCursor}
          initialHasNext={hasNext}
        />
      )}
    </div>
  )
}
