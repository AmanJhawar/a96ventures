'use client'

import React, { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'

// Dynamically import the heavy 3D canvas so it doesn't block the critical path
const NetworkScene = dynamic(() => import('./NetworkScene'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 z-0 bg-white" />
})

class ErrorBoundary extends React.Component<{ children: React.ReactNode; fallback: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught WebGL/Canvas error inside NetworkHero:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

export default function NetworkHero() {
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
    <section ref={containerRef} className="relative w-full h-[85vh] min-h-[600px] overflow-hidden bg-white -mt-20 flex flex-col justify-center items-center">
      {/* Self-contained CSS for scroll sweep animation */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes scrollSweep {
          0% {
            transform: translateY(-100%);
          }
          70%, 100% {
            transform: translateY(300%);
          }
        }
      `}} />

      {/* 3D Canvas Background */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-gray-50 to-white animate-fade-in-slow">
        <ErrorBoundary fallback={<div className="absolute inset-0 bg-gradient-to-b from-gray-50 to-white" />}>
          <NetworkScene inView={inView} />
        </ErrorBoundary>
      </div>

      {/* Overlay Content */}
      <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none text-center px-6 max-w-5xl mx-auto pt-10">

        {/* Main Title */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-normal text-black mb-24 animate-clip-reveal drop-shadow-sm">
          We partner with <span className="relative inline-block after:absolute after:bottom-1 after:left-0 after:right-0 after:h-0.5 after:bg-black after:animate-underline-grow" style={{ animationDelay: '0.8s' }}>visionaries</span> &nbsp;to build tomorrow&apos;s defining companies.
        </h1>

        {/* Action Buttons */}
        <div
          className="animate-fade-in flex flex-wrap gap-4 justify-center pointer-events-auto"
          style={{ animationDelay: '600ms' }}
        >
          <Link
            href="/portfolio"
            className="inline-block bg-black text-white px-8 py-4 rounded-lg font-medium tracking-wide text-sm transition-[background-color,transform,box-shadow] duration-[150ms] ease-[var(--ease-out)] hover:bg-gray-800 active:scale-[0.97] shadow-sm"
          >
            View Portfolio
          </Link>
          <Link
            href="/catalog"
            className="inline-block bg-white text-black border border-gray-200 px-8 py-4 rounded-lg font-medium tracking-wide text-sm transition-[background-color,border-color,transform,box-shadow] duration-[150ms] ease-[var(--ease-out)] hover:bg-gray-50 hover:border-gray-400 active:scale-[0.97] shadow-sm"
          >
            Explore Catalog
          </Link>
        </div>
      </div>
    </section>
  )
}
