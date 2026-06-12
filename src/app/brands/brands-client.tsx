"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getBrands } from '@/lib/firebase/db'
import { ProtectedImage } from '@/components/protected-image'
import { Brand } from '@/lib/types'

export default function BrandsClient() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadBrands() {
      try {
        const data = await getBrands()
        setBrands(data)
      } catch (error) {
        console.error("Failed to load brands:", error)
      } finally {
        setLoading(false)
      }
    }
    loadBrands()
  }, [])

  return (
    <div className="pt-10 pb-20 min-h-[calc(100vh-160px)]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-20">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-black mb-6">
            Our Brands
          </h1>
          <p className="text-xl font-normal text-gray-500 leading-relaxed max-w-[600px] mx-auto mb-8">
            The brands we build.
          </p>
          <Link 
            href="/catalog" 
            className="inline-block px-8 py-4 bg-black text-white rounded-full text-base font-semibold transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-gray-700 active:scale-[0.97] active:opacity-60"
          >
            View The Catalog
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
          </div>
        ) : brands.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            No brands found.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
            {brands.map((brand, index) => (
              <div 
                key={brand.id} 
                className="flex flex-col md:flex-row items-stretch p-0 overflow-hidden border border-gray-300 rounded-xl bg-white transition-[transform,box-shadow] duration-200 ease-[var(--ease-out)] hover:-translate-y-1 hover:shadow-[0_12px_24px_rgba(0,0,0,0.1)] min-h-[200px] group opacity-0 animate-[fadeInUp_400ms_var(--ease-out)_forwards]"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="w-full md:w-[35%] bg-gray-100 flex items-center justify-center border-b md:border-b-0 md:border-r border-gray-300 min-h-[200px] p-6">
                  <div className="relative w-full h-full flex items-center justify-center">
                    <ProtectedImage 
                      src={brand.logoFile.startsWith('data:') || brand.logoFile.startsWith('http') ? brand.logoFile : `/assets/${brand.logoFile}`} 
                      alt={`${brand.name} logo`}
                      className="max-w-[150px] max-h-[150px] object-contain w-auto h-auto transition-transform duration-200 ease-[var(--ease-out)] group-hover:scale-105"
                      containerClassName="flex items-center justify-center w-full h-full"
                    />
                  </div>
                </div>
                <div className="flex-1 p-8 flex flex-col justify-center">
                  <h3 className="text-2xl font-semibold text-black mb-2">{brand.name}</h3>
                  <span className="inline-block bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-medium tracking-wide w-fit mb-4">
                    {brand.sector}
                  </span>
                  <p className="text-gray-500 leading-relaxed m-0">
                    {brand.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
