"use client"

import { useEffect, useRef, useState } from 'react'

interface ProtectedImageProps {
  src: string
  alt: string
  className?: string
  containerClassName?: string
}

/**
 * Renders an image onto a <canvas> element with a transparent overlay.
 * This makes it significantly harder to save/copy/drag images because:
 *  - No <img> tag exists in the DOM (no "Save Image As" in context menu)
 *  - The canvas contextmenu, dragstart, and mousedown events are blocked at the native capture phase.
 *  - A transparent shield covers the canvas to intercept pointer events.
 */
export function ProtectedImage({ src, alt, className = '', containerClassName = '' }: ProtectedImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!src) return

    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.src = src

    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return

      // Match canvas internal resolution to the image
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(img, 0, 0)
      setLoaded(true)
    }
  }, [src])

  // Use native capture phase listeners to guarantee event interception
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const block = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
    }

    el.addEventListener('contextmenu', block, { capture: true })
    el.addEventListener('dragstart', block, { capture: true })
    el.addEventListener('mousedown', block, { capture: true })

    return () => {
      el.removeEventListener('contextmenu', block)
      el.removeEventListener('dragstart', block)
      el.removeEventListener('mousedown', block)
    }
  }, [])

  if (!src) return null

  return (
    <div
      ref={containerRef}
      className={`protected-image-container ${containerClassName}`}
      aria-label={alt}
      role="img"
    >
      <canvas
        ref={canvasRef}
        className={`protected-image-canvas ${className}`}
        style={{ opacity: loaded ? 1 : 0 }}
      />
      {/* Transparent overlay — intercepts ALL pointer events so
          the canvas beneath can never be targeted directly */}
      <div className="protected-image-shield" />
    </div>
  )
}
