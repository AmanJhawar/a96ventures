'use client'

import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { ProductCarousel } from './product-carousel'
import { AddToCartSection } from './add-to-cart-section'
import { resolveGallery } from '@/lib/utils'
import type { CatalogItem } from '@/lib/types'

interface ProductGalleryInteractiveProps {
  item: CatalogItem
  headingSlot: ReactNode
  specsSlot: ReactNode
  onVariantChange?: (variantKey: string | undefined) => void
}

export function ProductGalleryInteractive({ item, headingSlot, specsSlot, onVariantChange }: ProductGalleryInteractiveProps) {
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>(undefined)

  const handleVariantChange = (variant: string | undefined) => {
    setSelectedVariant(variant)
    if (onVariantChange) onVariantChange(variant)
  }

  const deduped = useMemo(() => {
    const gallery = resolveGallery(item, selectedVariant)
    return Array.from(new Set(gallery.filter(Boolean)))
  }, [item, selectedVariant])

  return (
    <>
      {/* Left column — sticky carousel */}
      <div className="lg:col-span-7 xl:col-span-8 lg:sticky lg:top-28 lg:h-fit z-10 pb-10">
        <ProductCarousel key={deduped.join()} images={deduped} productName={item.name} />
      </div>

      {/* Right column — static content + interactive variant picker */}
      <div className="lg:col-span-5 xl:col-span-4 flex flex-col">
        {headingSlot}
        <AddToCartSection item={item} onVariantChange={handleVariantChange} />
        {specsSlot}
      </div>
    </>
  )
}
