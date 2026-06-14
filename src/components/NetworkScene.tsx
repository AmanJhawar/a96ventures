'use client'

import React, { useCallback, useEffect, useState, useMemo } from 'react'
import Particles from 'react-tsparticles'
import { loadSlim } from 'tsparticles-slim'
import type { Engine, ISourceOptions } from 'tsparticles-engine'

export default function NetworkScene({ inView }: { inView: boolean }) {
  // Respect reduced motion setting
  const [isReducedMotion, setIsReducedMotion] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
    return false
  })

  const particlesInit = useCallback(async (engine: Engine) => {
    await loadSlim(engine)
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setIsReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  const options: ISourceOptions = useMemo(() => {
    return {
      autoPlay: inView, // pause when not in view
      background: {
        color: {
          value: 'transparent',
        },
      },
      fpsLimit: 60,
      interactivity: {
        events: {
          onHover: {
            enable: !isReducedMotion,
            mode: 'repulse',
          },
        },
        modes: {
          repulse: {
            distance: 120,
            duration: 0.4,
          },
        },
      },
      particles: {
        color: {
          value: '#d1d5db', // light gray
        },
        links: {
          color: '#e5e7eb', // lighter gray
          distance: 150,
          enable: true,
          opacity: 0.8,
          width: 1,
        },
        move: {
          enable: !isReducedMotion,
          speed: 0.6,
          direction: 'none' as const,
          random: true,
          straight: false,
          outModes: {
            default: 'bounce' as const,
          },
        },
        number: {
          density: {
            enable: true,
          },
          value: 150, // 150 points for a good network feel
        },
        opacity: {
          value: 0.6,
        },
        shape: {
          type: 'circle' as const,
        },
        size: {
          value: { min: 1, max: 2.5 },
        },
      },
      detectRetina: true,
    }
  }, [inView, isReducedMotion])

  return (
    <div className="absolute inset-0 w-full h-full z-0 overflow-hidden pointer-events-auto">
      <Particles
        id="tsparticles"
        init={particlesInit}
        options={options}
        className="w-full h-full"
      />
    </div>
  )
}
