import { getCatalogItems, getStoreCategories } from '@/lib/firebase/db'
import Link from 'next/link'
import { CatalogClient } from './catalog-client'
import { EmptyState } from '@/components/empty-state'

import { CatalogItem } from '@/lib/types'

export const revalidate = 3600 // Revalidate cache hourly

export default async function Catalog() {
  let items: CatalogItem[] = []
  let categories: string[] = []
  let error = false

  try {
    const [fetchedItems, fetchedCategories] = await Promise.all([
      getCatalogItems(),
      getStoreCategories()
    ])
    items = fetchedItems
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
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-black mb-6 animate-clip-reveal-fast">
              Catalog
            </h1>
            <p 
              className="text-xl font-normal text-gray-500 leading-relaxed max-w-[600px] mx-auto opacity-0 animate-fade-in-up"
              style={{ animationDelay: '200ms' }}
            >
              Silver articles, marble frames and bullion, made to order.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="py-20">
          <EmptyState 
            title="Failed to Load Products" 
            description="We encountered a problem loading our catalog collection. Please try again later."
            action={
              <Link href="/catalog" className="btn-primary text-sm py-3 px-6">
                Retry
              </Link>
            }
          />
        </div>
      ) : (
        <CatalogClient initialItems={items} initialCategories={allCategories} />
      )}
    </div>
  )
}
