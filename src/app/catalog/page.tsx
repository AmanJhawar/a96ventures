'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getCatalogItems, getStoreCategories } from '@/lib/firebase/db'
import { CatalogItem } from '@/data/catalog'
import { ProtectedImage } from '@/components/protected-image'

export default function Catalog() {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [categories, setCategories] = useState<string[]>(['All'])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('All')

  useEffect(() => {
    async function load() {
      try {
        const [fetchedItems, fetchedCategories] = await Promise.all([
          getCatalogItems(),
          getStoreCategories()
        ])
        setItems(fetchedItems)
        setCategories(['All', ...fetchedCategories])
      } catch (err) {
        console.error("Failed to load catalog:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filteredItems = activeFilter === 'All' ? items : items.filter(item => item.category === activeFilter)
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

      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-wrap justify-center gap-3 mb-16">
          {categories.map((cat, index) => (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-[160ms] ease-[var(--ease-out)] active:scale-[0.97] opacity-0 animate-[fadeInUp_400ms_var(--ease-out)_forwards] ${
                activeFilter === cat 
                  ? 'bg-black text-white shadow-md' 
                  : 'bg-gray-100 text-gray-600 @media(hover:hover):hover:bg-gray-200'
              }`}
              style={{ animationDelay: `${300 + (index * 40)}ms` }}
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            No products found in this category.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredItems.map((item, index) => (
              <Link 
                href={`/catalog/${item.id}`}
                key={item.id} 
                className="flex flex-col border border-gray-300 rounded-xl overflow-hidden bg-white group opacity-0 animate-[fadeInUp_400ms_var(--ease-out)_forwards] transition-all duration-200 ease-[var(--ease-out)] @media(hover:hover):hover:border-black/20 @media(hover:hover):hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
                style={{ animationDelay: `${index * 50}ms` }}
              >
              <div className="aspect-[4/3] bg-gray-100 flex items-center justify-center p-8 relative overflow-hidden">
                <div className="w-full h-full relative flex items-center justify-center text-gray-400 text-sm">
                  {item.imageFile ? (
                    <ProtectedImage 
                      src={item.imageFile.startsWith('data:') ? item.imageFile : `/assets/${item.imageFile}`} 
                      alt={item.name}
                      className="max-w-full max-h-full object-contain transition-transform duration-500 ease-[var(--ease-out)] @media(hover:hover):group-hover:scale-105"
                      containerClassName="w-full h-full flex items-center justify-center"
                    />
                  ) : (
                    <span>Image Coming Soon</span>
                  )}
                </div>
              </div>
              <div className="p-8 flex flex-col flex-1">
                <div className="flex flex-col items-start mb-4">
                  <h3 className="text-xl font-semibold text-black">{item.name}</h3>
                  <span className="text-xs font-semibold tracking-widest uppercase text-gray-400 mt-1">{item.category}</span>
                </div>
                <p className="text-gray-500 leading-relaxed mb-8">
                  {item.description}
                </p>
                <div className="mt-auto flex flex-col gap-4">
                    {(item.standardSizes?.length > 0 || item.customSizes?.length > 0) && (
                      <div>
                        <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2 block">Sizes</span>
                        <div className="flex flex-wrap gap-2">
                          {item.standardSizes?.map((s) => (
                            <span key={`std-size-${s}`} className="px-2 py-1 bg-gray-50 text-gray-600 rounded text-xs border border-gray-200">{s}</span>
                          ))}
                          {item.customSizes?.map((s) => (
                            <span key={`cust-size-${s}`} className="px-2 py-1 bg-white text-gray-500 rounded text-xs border border-gray-200 border-dashed">{s} (Custom)</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {(item.standardPurities?.length > 0 || item.customPurities?.length > 0) && (
                      <div>
                        <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2 block">Purity</span>
                        <div className="flex flex-wrap gap-2">
                          {item.standardPurities?.map((p) => (
                            <span key={`std-pur-${p}`} className="px-2 py-1 bg-gray-50 text-gray-600 rounded text-xs border border-gray-200">{p}{p.includes('%') ? '' : '%'}</span>
                          ))}
                          {item.customPurities?.map((p) => (
                            <span key={`cust-pur-${p}`} className="px-2 py-1 bg-white text-gray-500 rounded text-xs border border-gray-200 border-dashed">{p}{p.includes('%') ? '' : '%'} (Custom)</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

              </div>
            </Link>
          ))}
          </div>
        )}
      </div>
    </div>
  )
}
