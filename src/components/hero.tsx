'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

function FallbackCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0

    const resizeCanvas = () => {
      const parent = canvas.parentElement
      if (parent) {
        w = canvas.width = parent.clientWidth
        h = canvas.height = parent.clientHeight
      }
    }
    resizeCanvas()

    let targetX = w / 2
    let targetY = h / 2
    let currentX = targetX
    let currentY = targetY

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      targetX = e.clientX - rect.left
      targetY = e.clientY - rect.top
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('resize', resizeCanvas)

    let animationFrameId: number

    const render = () => {
      currentX += (targetX - currentX) * 0.05
      currentY += (targetY - currentY) * 0.05

      ctx.clearRect(0, 0, w, h)
      
      const gradient = ctx.createRadialGradient(currentX, currentY, 0, currentX, currentY, Math.max(w, h) * 0.5)
      gradient.addColorStop(0, 'rgba(170, 175, 185, 0.4)')
      gradient.addColorStop(0.4, 'rgba(210, 215, 225, 0.15)')
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, w, h)

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', resizeCanvas)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    />
  )
}

const HeroScene = dynamic(() => import('./hero-scene'), {
  ssr: false,
  loading: () => <FallbackCanvas />
})

export default function Hero() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)
    
    const listener = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }, [])

  const show3D = mounted && !prefersReducedMotion

  return (
    <section className="min-h-[80vh] flex flex-col items-center justify-center pb-20 pt-12 lg:pt-20 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 w-full relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          
          <div className="order-1 lg:order-2 h-[45vh] lg:h-[600px] w-full relative">
            {show3D ? <HeroScene /> : <FallbackCanvas />}
          </div>

          <div className="order-2 lg:order-1 text-center lg:text-left flex flex-col items-center lg:items-start">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-black mb-6 animate-[clipReveal_800ms_var(--ease-out)_forwards]">
              We partner with <span className="relative inline-block after:absolute after:bottom-1 after:left-0 after:right-0 after:h-0.5 after:bg-black after:animate-[underlineGrow_600ms_var(--ease-out)_0.8s_both]">visionaries</span> to build tomorrow&apos;s defining companies.
            </h1>
            <p className="text-xl font-normal text-gray-500 leading-relaxed max-w-[600px] lg:max-w-none opacity-0 animate-[fadeInUp_600ms_var(--ease-out)_forwards] [animation-delay:400ms] mb-12">
              Early-stage venture capital focused on transformative technologies and exceptional founders.
            </p>
            <div className="opacity-0 animate-[fadeInUp_600ms_var(--ease-out)_forwards] [animation-delay:600ms] flex flex-wrap gap-4 justify-center lg:justify-start">
              <Link 
                href="/portfolio" 
                className="inline-block bg-black text-white px-8 py-4 rounded-full font-medium tracking-wide text-sm transition-[background-color,transform,box-shadow] duration-150 ease-[var(--ease-out)] hover:bg-gray-800 active:scale-[0.97] shadow-lg hover:shadow-xl"
              >
                View Portfolio
              </Link>
              <Link 
                href="/catalog" 
                className="inline-block bg-white text-black border border-gray-200 px-8 py-4 rounded-full font-medium tracking-wide text-sm transition-[background-color,border-color,transform,box-shadow] duration-150 ease-[var(--ease-out)] hover:bg-gray-50 hover:border-gray-400 active:scale-[0.97] shadow-sm hover:shadow-md"
              >
                Explore Catalog
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
