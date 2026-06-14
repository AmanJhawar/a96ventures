import Link from 'next/link'
import { ProtectedImage } from '@/components/protected-image'
import type { CatalogItem } from '@/lib/types'

interface ProductCardProps {
  item: CatalogItem
  index?: number
  showVariants?: boolean
}

export function ProductCard({ item, index = 0, showVariants = false }: ProductCardProps) {
  return (
    <Link 
      href={`/catalog/${item.id}`}
      className="flex flex-col border border-gray-200 rounded-xl overflow-hidden bg-white group opacity-0 animate-fade-in-up-short transition-[border-color,box-shadow,transform] duration-200 ease-[var(--ease-out)] hover:border-black/20 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 active:scale-[0.97]"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="aspect-[2/3] bg-[#f5f5f7] relative overflow-hidden">
        <div className="w-full h-full relative flex items-center justify-center text-gray-400 text-sm">
          {item.imageFile ? (
            <ProtectedImage 
              src={item.imageFile.startsWith('data:') ? item.imageFile : `/assets/${item.imageFile}`} 
              alt={item.name}
              className="w-full h-full object-cover transition-transform duration-700 ease-[var(--ease-out)] group-hover:scale-[1.04]"
              containerClassName="w-full h-full"
            />
          ) : (
            <span>No image</span>
          )}
        </div>
      </div>
      <div className="p-6 flex flex-col flex-1">
        <div className="flex flex-col items-start mb-2">
          <h2 className="text-sm font-semibold text-black tracking-wide uppercase line-clamp-2">{item.name}</h2>
          {item.category && (
            <span className="text-xs font-medium tracking-widest uppercase text-gray-400 mt-2">{item.category}</span>
          )}
        </div>
        
        {showVariants && (
          <div className="mt-auto pt-4 border-t border-gray-50">
            {(() => {
              let sizes = 0
              let sizeLabel = 'sizes'
              
              if (item.category?.includes('Marble')) {
                sizes = (item.standardStones?.length || 0) + (item.customStones?.length || 0)
                sizeLabel = 'stones'
              } else if (item.category?.includes('Bullion')) {
                sizes = (item.standardWeights?.length || 0) + (item.customWeights?.length || 0)
                sizeLabel = 'weights'
              } else {
                sizes = (item.standardSizes?.length || 0) + (item.customSizes?.length || 0)
              }
              
              const purities = (item.standardPurities?.length || 0) + (item.customPurities?.length || 0)
              
              if (sizes === 0 && purities === 0) return null
              
              const parts = []
              if (sizes > 0) parts.push(`${sizes} ${sizeLabel}`)
              if (purities > 0) parts.push(`${purities} purities`)
              
              return (
                <p className="text-xs text-gray-400 font-medium tracking-wide">
                  Available in {parts.join(' & ')}
                </p>
              )
            })()}
          </div>
        )}
      </div>
    </Link>
  )
}
