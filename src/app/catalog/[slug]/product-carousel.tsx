"use client"

import { useState, useRef } from 'react'
import { ProtectedImage } from '@/components/protected-image'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface ProductCarouselProps {
  images: string[]
  productName: string
}

export function ProductCarousel({ images, productName }: ProductCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Fallback to a safe empty array if nothing is provided
  const safeImages = images.filter(Boolean)

  if (safeImages.length === 0) {
    return (
      <div className="flex flex-col gap-4 w-full">
        <div className="aspect-[3/2] bg-[#f5f5f7] rounded-xl flex items-center justify-center">
          <span className="text-gray-400 text-sm">Image not available</span>
        </div>
      </div>
    )
  }

  const handleScroll = () => {
    if (scrollRef.current) {
      const scrollPosition = scrollRef.current.scrollLeft
      const width = scrollRef.current.offsetWidth
      const index = Math.round(scrollPosition / width)
      setActiveIndex(index)
    }
  }

  const scrollTo = (index: number) => {
    if (scrollRef.current) {
      const width = scrollRef.current.offsetWidth
      scrollRef.current.scrollTo({
        left: width * index,
        behavior: 'smooth'
      })
    }
  }

  return (
    <div className="flex flex-col gap-6 w-full relative group">
      {/* Main Image Carousel */}
      <div className="relative rounded-xl overflow-hidden bg-[#f5f5f7] touch-pan-x">
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-hide w-full h-full"
        >
          {safeImages.map((img, idx) => (
            <div key={idx} className="w-full h-full flex-shrink-0 aspect-[3/2] relative snap-center overflow-hidden">
              <ProtectedImage
                src={img.startsWith('data:') ? img : `/assets/${img}`}
                alt={`${productName} - View ${idx + 1}`}
                className="w-full h-full object-cover"
                containerClassName="w-full h-full flex items-center justify-center absolute inset-0"
              />
            </div>
          ))}
        </div>

        {/* Floating Navigation Arrows */}
        {safeImages.length > 1 && (
          <>
            <button 
              onClick={() => scrollTo(Math.max(0, activeIndex - 1))}
              disabled={activeIndex === 0}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 disabled:opacity-0 hover:bg-white z-20"
            >
              <ChevronLeft className="w-5 h-5 text-gray-800" />
            </button>
            <button 
              onClick={() => scrollTo(Math.min(safeImages.length - 1, activeIndex + 1))}
              disabled={activeIndex === safeImages.length - 1}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 disabled:opacity-0 hover:bg-white z-20"
            >
              <ChevronRight className="w-5 h-5 text-gray-800" />
            </button>
          </>
        )}
        {/* Dots Indicator */}
        {safeImages.length > 1 && (
          <div className="absolute bottom-6 left-0 right-0 z-20 flex justify-center gap-2">
            {safeImages.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ease-[var(--ease-out)] ${
                  activeIndex === idx ? 'bg-black w-5' : 'bg-black/20 w-1.5'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
