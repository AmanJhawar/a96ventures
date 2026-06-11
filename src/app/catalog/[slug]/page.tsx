import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCatalogItems, getCatalogItemById } from '@/lib/firebase/db'
import { AddToCartSection } from './add-to-cart-section'
import { ProductCarousel } from './product-carousel'

export async function generateStaticParams() {
  try {
    const items = await getCatalogItems()
    return items.map((item) => ({
      slug: item.id,
    }))
  } catch (e) {
    console.error('Failed to generate static params', e)
    return []
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const item = await getCatalogItemById(slug)
  
  if (!item) {
    notFound()
  }

  return (
    <div className="pt-10 pb-20 min-h-[calc(100vh-160px)]">
      <div className="max-w-7xl mx-auto px-6">
        
        {/* Breadcrumb */}
        <div className="mb-10 text-sm font-medium text-gray-500">
          <Link href="/catalog" className="hover:text-black transition-colors duration-150">Catalog</Link>
          <span className="mx-2">/</span>
          <span className="text-black">{item.name}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          {/* Image Gallery Area */}
          <div className="opacity-0 animate-[fadeInUp_400ms_var(--ease-out)_forwards]">
            <ProductCarousel 
              images={[item.imageFile, ...(item.additionalImages || [])]} 
              productName={item.name} 
            />
          </div>

          {/* Details Area */}
          <div className="flex flex-col justify-center opacity-0 animate-[fadeInUp_400ms_var(--ease-out)_forwards]" style={{ animationDelay: '100ms' }}>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-black mb-4">
              {item.name}
            </h1>
            
            <p className="text-xl font-normal text-gray-600 leading-relaxed mb-10">
              {item.description}
            </p>

            {/* Add to Cart Section (Client Component) */}
            <AddToCartSection item={item} />

            <div className="mt-12 space-y-4 text-sm text-gray-500">
              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="font-medium">Category</span>
                <span className="text-black text-right">{item.category}</span>
              </div>
              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="font-medium">Material</span>
                <span className="text-black text-right">{item.material || 'Unspecified'}</span>
              </div>
              {item.weight && (
                <div className="flex justify-between py-3 border-b border-gray-100">
                  <span className="font-medium">Approx Weight</span>
                  <span className="text-black text-right">{item.weight}</span>
                </div>
              )}
              {item.hasVariants && (item.standardSizes?.length > 0 || item.customSizes?.length > 0) && (
                <div className="flex justify-between py-3 border-b border-gray-100">
                  <span className="font-medium">Available Sizes</span>
                  <span className="text-black text-right">{[...(item.standardSizes || []), ...(item.customSizes || [])].join(', ')}</span>
                </div>
              )}
              {item.hasVariants && (item.standardPurities?.length > 0 || item.customPurities?.length > 0) && (
                <div className="flex justify-between py-3 border-b border-gray-100">
                  <span className="font-medium">Available Purities</span>
                  <span className="text-black text-right">{[...(item.standardPurities || []), ...(item.customPurities || [])].join(', ')}</span>
                </div>
              )}

            </div>

          </div>
        </div>

      </div>
    </div>
  )
}
