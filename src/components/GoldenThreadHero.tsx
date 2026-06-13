'use client'

import React, { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'

// Dynamically import the heavy 3D canvas so it doesn't block the critical path
const GoldenThreadScene = dynamic(() => import('./GoldenThreadScene'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 z-0 bg-white" />
})

export default function GoldenThreadHero() {
  const containerRef = useRef<HTMLElement>(null)
  const [inView, setInView] = useState(true)

  // Use IntersectionObserver to pause the 3D rendering when scrolled out of view
  useEffect(() => {
    if (!containerRef.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting)
      },
      { rootMargin: '100px 0px' }
    )

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={containerRef} className="relative w-full h-[85vh] min-h-[600px] overflow-hidden bg-white -mt-20">
      {/* 3D Canvas Background */}
      <div className="absolute inset-0 z-0 opacity-0 motion-safe:animate-[fadeIn_1000ms_var(--ease-out)_forwards]">
        <GoldenThreadScene inView={inView} />
      </div>

      {/* HTML Overlay */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
        <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight text-black max-w-4xl mx-auto leading-tight">
          We partner with visionaries to build tomorrow&apos;s defining companies.
        </h1>
      </div>
    </section>
  )
}
