'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { EASE_OUT } from '@/components/motion-transitions'

// Dynamically import UnicornScene so it doesn't run on the server
const UnicornScene = dynamic(
  () => import('unicornstudio-react').then((mod) => mod.default),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 z-0 bg-neutral-950" />,
  }
)

export default function NetworkHero() {
  return (
    <section className="relative w-full h-screen min-h-[600px] overflow-hidden bg-neutral-950 -mt-20 flex flex-col justify-center items-center">
      {/* Unicorn Studio Background */}
      <motion.div
        className="absolute inset-0 z-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.0, ease: EASE_OUT }}
      >
        {/* Force UnicornScene internals to fill the container */}
        <style dangerouslySetInnerHTML={{
          __html: `
        .unicorn-scene-wrapper,
        .unicorn-scene-wrapper > div,
        .unicorn-scene-wrapper canvas {
          width: 100% !important;
          height: 100% !important;
          position: absolute !important;
          inset: 0 !important;
        }
      `}} />
        <UnicornScene
          projectId="Pvsa8dKMzsvq5SodEcxA"
          width="100%"
          height="100%"
          scale={1}
          dpi={1.5}
          production={true}
          className="unicorn-scene-wrapper"
          sdkUrl="/unicornStudio.umd.js"
        />
      </motion.div>

      {/* Overlay Content */}
      <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none text-center px-6 max-w-5xl mx-auto pt-10">

        {/* Main Title */}
        <motion.h1
          className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-white mb-24"
          initial={{ clipPath: 'inset(0 0 100% 0)' }}
          animate={{ clipPath: 'inset(0 0 0% 0)' }}
          transition={{ duration: 0.8, ease: EASE_OUT }}
        >
          We partner with{' '}
          <span className="relative inline-block">
            visionaries
            <motion.span
              className="absolute bottom-1 left-0 right-0 h-0.5 bg-white"
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
            className="btn-primary"
            style={{ backgroundColor: 'transparent', borderColor: 'white' }}
          >
            View Portfolio
          </Link>
          <Link
            href="/catalog"
            className="btn-secondary shadow-sm"
          >
            Explore Catalog
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
