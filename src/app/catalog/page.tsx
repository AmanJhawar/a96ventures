import { getCatalogItems, getStoreCategories } from '@/lib/firebase/db'
import { CatalogClient } from './catalog-client'

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
      <div className="relative py-12 mb-12 overflow-hidden border-b border-gray-100">
        <div className="absolute inset-0 z-0 flex items-center justify-center">
          <div className="w-[600px] h-[600px] bg-gradient-to-t from-gray-100/50 to-transparent rounded-full blur-[80px] opacity-70"></div>
        </div>
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-black mb-6 animate-[clipReveal_600ms_var(--ease-out)_forwards]">
              Exclusive Collections
            </h1>
            <p className="text-xl font-normal text-gray-500 leading-relaxed max-w-[600px] mx-auto opacity-0 animate-[fadeInUp_500ms_var(--ease-out)_forwards] [animation-delay:200ms]">
              A curated selection of our premium products.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="max-w-7xl mx-auto px-6 text-center py-20">
          <h3 className="text-xl font-semibold text-black mb-2">Failed to Load Products</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            We encountered a problem loading our catalog collection. Please try again later.
          </p>
        </div>
      ) : (
        <CatalogClient initialItems={items} initialCategories={allCategories} />
      )}
    </div>
  )
}
