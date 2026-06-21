"use client"

import { useState } from 'react'
import { ProtectedImage } from '@/components/protected-image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getOptimizedUrl } from '@/lib/utils'

interface ProductCarouselProps {
  images: string[]
  productName: string
}

export function ProductCarousel({ images, productName }: ProductCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)

  // Minimum distance to trigger swipe
  const minSwipeDistance = 50

  const safeImages = images.filter(Boolean)

  if (safeImages.length === 0) {
    return (
      <div className="flex flex-col gap-4 w-full">
        <div className="aspect-[4/3] bg-[#f5f5f7] rounded-xl flex items-center justify-center">
          <span className="text-gray-400 text-sm">Image not available</span>
        </div>
      </div>
    )
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe && activeIndex < safeImages.length - 1) {
      setActiveIndex(prev => prev + 1)
    }
    if (isRightSwipe && activeIndex > 0) {
      setActiveIndex(prev => prev - 1)
    }
  }

  const clampedIndex = Math.min(activeIndex, Math.max(0, safeImages.length - 1))

  return (
    <div className="flex flex-col gap-6 w-full relative group">
      {/* Main Image Carousel Wrapper */}
      <div 
        className="relative aspect-[4/3] rounded-xl overflow-hidden bg-[#f5f5f7] touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div 
          className="flex h-full w-full transition-transform duration-200 ease-[var(--ease-out)]"
          style={{ transform: `translateX(-${clampedIndex * 100}%)` }}
        >
          {safeImages.map((img, idx) => (
            <div key={idx} className="w-full h-full flex-shrink-0 relative overflow-hidden">
              <ProtectedImage
                src={getOptimizedUrl(img, 1600)}
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
              onClick={() => setActiveIndex(Math.max(0, clampedIndex - 1))}
              disabled={clampedIndex === 0}
              className={`absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center shadow-sm transition-[opacity,background-color,transform] duration-200 ease-[var(--ease-out)] hover:bg-white active:scale-[0.95] z-20 ${
                clampedIndex === 0 
                  ? 'opacity-0 pointer-events-none' 
                  : 'opacity-100'
              }`}
            >
              <ChevronLeft className="w-5 h-5 text-black" />
            </button>
            <button 
              onClick={() => setActiveIndex(Math.min(safeImages.length - 1, clampedIndex + 1))}
              disabled={clampedIndex === safeImages.length - 1}
              className={`absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center shadow-sm transition-[opacity,background-color,transform] duration-200 ease-[var(--ease-out)] hover:bg-white active:scale-[0.95] z-20 ${
                clampedIndex === safeImages.length - 1 
                  ? 'opacity-0 pointer-events-none' 
                  : 'opacity-100'
              }`}
            >
              <ChevronRight className="w-5 h-5 text-black" />
            </button>
          </>
        )}

        {/* Dots Indicator */}
        {safeImages.length > 1 && (
          <div className="absolute bottom-6 left-0 right-0 z-20 flex justify-center gap-2">
            {safeImages.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveIndex(idx)}
                className={`h-1.5 rounded-full transition-[width,background-color,transform] duration-300 ease-[var(--ease-out)] active:scale-[0.97] ${
                  clampedIndex === idx ? 'bg-black w-5' : 'bg-black/20 w-1.5'
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
