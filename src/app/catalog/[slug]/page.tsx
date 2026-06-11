import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { getCatalogItems, getCatalogItemById } from '@/lib/firebase/db'

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
    <div className="py-20 min-h-[calc(100vh-160px)]">
      <div className="max-w-7xl mx-auto px-6">
        
        {/* Breadcrumb */}
        <div className="mb-10 text-sm font-medium text-gray-500">
          <Link href="/catalog" className="hover:text-black transition-colors duration-150">Catalog</Link>
          <span className="mx-2">/</span>
          <span className="text-black">{item.name}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          {/* Image Gallery Area */}
          <div className="flex flex-col gap-4 opacity-0 animate-[fadeInUp_400ms_var(--ease-out)_forwards]">
            <div className="aspect-square bg-gray-100 rounded-2xl flex items-center justify-center p-8 relative overflow-hidden border border-gray-200">
              {item.imageFile ? (
                <Image
                  src={`/assets/${item.imageFile}`}
                  alt={item.name}
                  fill
                  className="object-contain p-12"
                  unoptimized
                />
              ) : (
                <span className="text-gray-400">Image not available</span>
              )}
            </div>
            {/* Thumbnails row (placeholder for future multiple images) */}
            <div className="grid grid-cols-4 gap-4">
              <div className="aspect-square bg-gray-100 rounded-lg border-2 border-black relative overflow-hidden cursor-pointer">
                {item.imageFile && <Image src={`/assets/${item.imageFile}`} alt="Thumbnail" fill className="object-contain p-2" unoptimized />}
              </div>
            </div>
          </div>

          {/* Details Area */}
          <div className="flex flex-col justify-center opacity-0 animate-[fadeInUp_400ms_var(--ease-out)_forwards]" style={{ animationDelay: '100ms' }}>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-black mb-4">
              {item.name}
            </h1>
            
            <p className="text-xl font-normal text-gray-600 leading-relaxed mb-10">
              {item.description}
            </p>

            {item.variants && item.variants.length > 0 && (
              <div className="mb-10">
                <h3 className="text-sm font-semibold text-black uppercase tracking-wider mb-4">Available Variants</h3>
                <div className="flex flex-wrap gap-3">
                  {item.variants.map((variant) => (
                    <div 
                      key={variant} 
                      className="px-4 py-3 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-800"
                    >
                      {variant}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-8 border-t border-gray-200 flex flex-col sm:flex-row gap-4">
              <Link 
                href={`/contact?inquiryType=general&product=${slug}`}
                className="inline-flex justify-center items-center bg-black text-white px-8 py-4 rounded-lg text-base font-semibold transition-all duration-160 ease-[var(--ease-out)] @media(hover:hover):hover:bg-gray-800 active:scale-[0.97]"
              >
                Inquire About This Piece
              </Link>
            </div>

            <div className="mt-12 space-y-4 text-sm text-gray-500">
              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="font-medium">Category</span>
                <span className="text-black">{item.category}</span>
              </div>
              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="font-medium">Material</span>
                <span className="text-black">{item.category.includes('Silver') ? 'Pure Silver' : 'Semi-precious Marble'}</span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}
