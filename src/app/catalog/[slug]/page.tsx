import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCatalogItems, getCatalogItemById, getMoreCatalogItems } from '@/lib/firebase/db'
import { ProductGalleryInteractive } from './product-gallery-interactive'
import { ProductCard } from '@/components/product-card'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { StaggerContainer, FadeInUp } from '@/components/motion-transitions'

export async function generateStaticParams() {
  try {
    const items = await getCatalogItems()
    return items.map((item) => ({
      slug: item.id,
    }))
  } catch (e) {
    console.error('Failed to generate static params, falling back to dynamic rendering:', e)
    return []
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const resolvedParams = await params
  const item = await getCatalogItemById(resolvedParams.slug)
  
  if (!item) {
    return {
      title: 'Product Not Found | A96 Ventures',
    }
  }

  const imageUrl = item.imageFile && !item.imageFile.startsWith('data:')
    ? `https://a96ventures.com/assets/${item.imageFile}`
    : undefined

  return {
    title: `${item.name} | A96 Ventures`,
    description: item.description,
    openGraph: {
      title: `${item.name} | A96 Ventures`,
      description: item.description,
      type: 'website',
      images: imageUrl ? [{ url: imageUrl, alt: item.name }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${item.name} | A96 Ventures`,
      description: item.description,
      images: imageUrl ? [imageUrl] : undefined,
    }
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const item = await getCatalogItemById(slug)
  
  if (!item) {
    notFound()
  }

  const moreProducts = await getMoreCatalogItems(slug, 4)
  
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.name,
    description: item.description,
    category: item.category,
    ...(item.imageFile && !item.imageFile.startsWith('data:') && {
      image: `https://a96ventures.com/assets/${item.imageFile}`
    })
  }

  return (
    <div className="pt-10 pb-20 min-h-[calc(100vh-160px)]">
      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-8xl mx-auto px-6">
        
        <StaggerContainer>
          <FadeInUp className="mb-8">
            <Link 
              href="/catalog" 
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-black transition-colors duration-200 group"
            >
              <ArrowLeft size={16} className="transition-transform duration-200 group-hover:-translate-x-1" />
              Back to Catalog
            </Link>
          </FadeInUp>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-start relative">
            {/* ProductGalleryInteractive owns selectedVariant state and renders both columns */}
            <ProductGalleryInteractive
              item={item}
              headingSlot={
                <>
                  <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-black mb-2">
                    {item.name}
                  </h1>
                  <p className="text-sm font-medium tracking-wide text-gray-500 mb-6">
                    Price on request
                  </p>
                  <p className="text-lg font-normal text-gray-500 leading-relaxed mb-10">
                    {item.description}
                  </p>
                </>
              }
              specsSlot={
                <div className="mt-12 space-y-1 text-sm text-gray-500">
                  <div className="flex justify-between py-2">
                    <span className="font-medium">Category</span>
                    <span className="text-black text-right">{item.category}</span>
                  </div>
                  {item.material && (
                    <div className="flex justify-between py-2">
                      <span className="font-medium">Material</span>
                      <span className="text-black text-right">{item.material}</span>
                    </div>
                  )}
                  {(() => {
                    let hasVariants = false
                    if (item.category?.includes('Marble')) {
                      hasVariants = (item.standardStones?.length || 0) > 0 || (item.customStones?.length || 0) > 0
                    } else if (item.category?.includes('Bullion')) {
                      hasVariants = (item.standardWeights?.length || 0) > 0 || (item.customWeights?.length || 0) > 0
                    } else {
                      const hasSizes = (item.standardSizes?.length || 0) > 0 || (item.customSizes?.length || 0) > 0
                      const hasPurities = (item.standardPurities?.length || 0) > 0 || (item.customPurities?.length || 0) > 0
                      hasVariants = hasSizes && hasPurities
                    }
                    if (hasVariants || !item.weight) return null
                    return (
                      <div className="flex justify-between py-2">
                        <span className="font-medium">Approx Weight</span>
                        <span className="text-black text-right">
                          {item.weight.match(/[a-zA-Z]/) ? item.weight : `${item.weight}g`}
                        </span>
                      </div>
                    )
                  })()}
                </div>
              }
            />
          </div>
        </StaggerContainer>

        {/* More Products Section */}
        {moreProducts.length > 0 && (
          <div className="mt-32 pt-16">
            <h2 className="text-2xl font-bold tracking-tight text-black mb-10 text-center">More from our catalog</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {moreProducts.map((p) => (
                <ProductCard key={p.id} item={p} showVariants={false} />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
