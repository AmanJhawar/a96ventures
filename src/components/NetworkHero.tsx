'use client'

import React, { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { EASE_OUT } from '@/components/motion-transitions'

// Dynamically import the heavy 3D canvas so it doesn't block the critical path
const NetworkScene = dynamic(() => import('./NetworkScene'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 z-0 bg-white" />
})

class ErrorBoundary extends React.Component<{ children: React.ReactNode; fallback: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
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
      <motion.div 
        className="absolute inset-0 z-0 bg-gradient-to-b from-gray-50 to-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.0, ease: EASE_OUT }}
      >
        <ErrorBoundary fallback={<div className="absolute inset-0 bg-gradient-to-b from-gray-50 to-white" />}>
          <NetworkScene inView={inView} />
        </ErrorBoundary>
      </motion.div>

      {/* Overlay Content */}
      <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none text-center px-6 max-w-5xl mx-auto pt-10">

        {/* Main Title */}
        <motion.h1 
          className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-normal text-black mb-24"
          initial={{ clipPath: 'inset(0 0 100% 0)' }}
          animate={{ clipPath: 'inset(0 0 0% 0)' }}
          transition={{ duration: 0.8, ease: EASE_OUT }}
        >
          We partner with{' '}
          <span className="relative inline-block">
            visionaries
            <motion.span 
              className="absolute bottom-1 left-0 right-0 h-0.5 bg-black"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              style={{ originX: 0 }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.8 }}
            />
          </span>
          &nbsp;to build tomorrow&apos;s defining companies.
        </motion.h1>

        {/* Action Buttons */}
        <motion.div
          className="flex flex-wrap gap-4 justify-center pointer-events-auto"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.6 }}
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
        </motion.div>
      </div>
    </section>
  )
}
