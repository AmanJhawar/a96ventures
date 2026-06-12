"use client"

import { useState } from 'react'
import { ProtectedImage } from '@/components/protected-image'

interface ProductCarouselProps {
  images: string[]
  productName: string
}

export function ProductCarousel({ images, productName }: ProductCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  // Fallback to a safe empty array if nothing is provided
  const safeImages = images.filter(Boolean)

  if (safeImages.length === 0) {
    return (
      <div className="flex flex-col gap-4 w-full">
        <div className="aspect-square bg-gray-50 rounded-xl flex items-center justify-center border border-gray-100">
          <span className="text-gray-400 text-sm">Image not available</span>
        </div>
      </div>
    )
  }

  const activeImage = safeImages[activeIndex]

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Main Image */}
      <div className="aspect-square bg-white rounded-xl border border-gray-200 overflow-hidden relative shadow-sm transition-[border-color,box-shadow] duration-300">
        <ProtectedImage
          src={activeImage.startsWith('data:') ? activeImage : `/assets/${activeImage}`}
          alt={`${productName} - View ${activeIndex + 1}`}
          className="w-full h-full object-contain p-8 md:p-12 transition-opacity duration-300 ease-[var(--ease-out)]"
          containerClassName="w-full h-full flex items-center justify-center absolute inset-0 bg-gray-50/50"
        />
      </div>

      {/* Thumbnails */}
      {safeImages.length > 1 && (
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
          {safeImages.map((img, idx) => {
            const isActive = idx === activeIndex
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={`relative flex-shrink-0 w-20 h-20 md:w-24 md:h-24 rounded-xl overflow-hidden border-2 transition-[border-color,box-shadow,transform,opacity] duration-200 ease-[var(--ease-out)] snap-start ${
                  isActive 
                    ? 'border-black shadow-md scale-100' 
                    : 'border-transparent bg-white shadow-sm scale-95 opacity-60 hover:opacity-100 hover:scale-[0.98]'
                }`}
              >
                <div className="absolute inset-0 bg-gray-50" />
                <ProtectedImage
                  src={img.startsWith('data:') ? img : `/assets/${img}`}
                  alt={`${productName} thumbnail ${idx + 1}`}
                  className="w-full h-full object-contain p-2"
                  containerClassName="w-full h-full absolute inset-0 z-10"
                />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
