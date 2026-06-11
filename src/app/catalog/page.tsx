'use client'

import Image from 'next/image'
import { catalogItems } from '@/data/catalog'

export default function Catalog() {
  return (
    <div className="py-20 min-h-[calc(100vh-160px)]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-20">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-black mb-6">
            Exclusive Collections
          </h1>
          <p className="text-xl font-normal text-gray-500 leading-relaxed max-w-[600px] mx-auto mb-8">
            A curated selection of our finest jewelry designs.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {catalogItems.map((item, index) => (
            <div 
              key={item.id} 
              className="flex flex-col border border-gray-300 rounded-xl overflow-hidden bg-white group opacity-0 animate-[fadeInUp_400ms_var(--ease-out)_forwards]"
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
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-semibold text-black">{item.name}</h3>
                  <span className="text-lg font-medium text-gray-500">{item.price}</span>
                </div>
                <p className="text-gray-500 leading-relaxed mt-auto">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
