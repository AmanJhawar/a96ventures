'use client'

import { useState } from 'react'

export default function Hero() {
  const [mousePosition, setMousePosition] = useState({ x: 50, y: 50 })

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setMousePosition({ x, y })
  }

  return (
    <section
      className="min-h-[80vh] flex items-center justify-center text-center pb-20 relative pt-[100px] md:pt-0"
      onMouseMove={handleMouseMove}
      style={{
        background: `radial-gradient(circle at ${mousePosition.x}% ${mousePosition.y}%, 
          rgba(200, 200, 200, 0.25) 0%, 
          rgba(150, 150, 150, 0.15) 30%, 
          rgba(100, 100, 100, 0.08) 60%, 
          rgba(0, 0, 0, 0.05) 100%)`
      }}
    >
      <div className="max-w-7xl mx-auto px-6 w-full">
        <div className="max-w-[900px] mx-auto relative z-10">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-black mb-6 animate-clip-reveal">
            We partner with <span className="relative inline-block after:absolute after:bottom-1 after:left-0 after:right-0 after:h-0.5 after:bg-black after:animate-[underlineGrow_600ms_var(--ease-out)_0.8s_both]">visionaries</span> &nbsp;to build tomorrow&apos;s defining companies.
          </h1>
          <p className="text-xl font-normal text-gray-500 leading-relaxed max-w-[600px] mx-auto opacity-0 animate-[fadeInUp_600ms_var(--ease-out)_forwards] [animation-delay:400ms]">
            Early-stage venture capital focused on transformative technologies and exceptional founders.
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes underlineGrow {
          from { width: 0; }
          to { width: 100%; }
        }
      `}</style>
    </section>
  )
}
