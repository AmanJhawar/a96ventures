'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { ProductCarousel } from './product-carousel'
import { AddToCartSection } from './add-to-cart-section'
import { resolveGallery } from '@/lib/utils'
import type { CatalogItem } from '@/lib/types'

interface ProductGalleryInteractiveProps {
  item: CatalogItem
  headingSlot: ReactNode
  specsSlot: ReactNode
}

export function ProductGalleryInteractive({ item, headingSlot, specsSlot }: ProductGalleryInteractiveProps) {
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>(undefined)

  const gallery = resolveGallery(item, selectedVariant)
  const deduped = Array.from(new Set(gallery.filter(Boolean)))

  return (
    <>
      {/* Left column — sticky carousel */}
      <div className="lg:col-span-7 xl:col-span-8 lg:sticky lg:top-28 lg:h-fit z-10 pb-10">
        <ProductCarousel images={deduped} productName={item.name} />
      </div>

      {/* Right column — static content + interactive variant picker */}
      <div className="lg:col-span-5 xl:col-span-4 flex flex-col">
        {headingSlot}
        <AddToCartSection item={item} onVariantChange={setSelectedVariant} />
        {specsSlot}
      </div>
    </>
  )
}
