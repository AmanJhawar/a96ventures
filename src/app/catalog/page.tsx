'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getCatalogItems } from '@/lib/firebase/db'
import { CatalogItem } from '@/data/catalog'

export default function Catalog() {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('All')

  useEffect(() => {
    async function load() {
      try {
        const fetched = await getCatalogItems()
        setItems(fetched)
      } catch (err) {
        console.error("Failed to load catalog:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const categories = ['All', 'Silver Idols', 'Silver Animals', 'Marble Photoframes', 'MMTC Bullions']
  const filteredItems = activeFilter === 'All' ? items : items.filter(item => item.category === activeFilter)
  return (
    <div className="py-20 min-h-[calc(100vh-160px)]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-black mb-6">
            Exclusive Collections
          </h1>
          <p className="text-xl font-normal text-gray-500 leading-relaxed max-w-[600px] mx-auto">
            A curated selection of our premium products.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3 mb-16">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-200 ease-[var(--ease-out)] ${
                activeFilter === cat 
                  ? 'bg-black text-white shadow-md' 
                  : 'bg-gray-100 text-gray-600 @media(hover:hover):hover:bg-gray-200'
              }`}
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
                  {/* Using standard img to avoid next/image errors before assets are uploaded */}
                  <img 
                    src={`/assets/${item.imageFile}`} 
                    alt={item.name}
                    className="max-w-full max-h-full object-contain transition-transform duration-500 ease-[var(--ease-out)] @media(hover:hover):group-hover:scale-105"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).parentElement!.innerHTML = 'Image Coming Soon';
                    }}
                  />
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
                <div className="mt-auto">
                  <span className="text-xs font-semibold tracking-wider text-black uppercase mb-3 block">Available Variants</span>
                  <div className="flex flex-wrap gap-2">
                    {item.variants.map((variant) => (
                      <span key={variant} className="px-3 py-1 bg-gray-50 text-gray-600 rounded-md text-sm border border-gray-200">
                        {variant}
                      </span>
                    ))}
                  </div>
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
