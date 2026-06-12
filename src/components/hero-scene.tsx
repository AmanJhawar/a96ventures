/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-empty-object-type */
'use client'

import { useRef, useEffect, useState } from 'react'
import { Canvas, useFrame, ThreeElements, RootState } from '@react-three/fiber'
import { Environment, Lightformer, Float } from '@react-three/drei'
import * as THREE from 'three'

declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

function SceneContent() {
  const idleGroupRef = useRef<THREE.Group>(null)
  const parallaxGroupRef = useRef<THREE.Group>(null)
  const pointerRef = useRef({ x: 0, y: 0 })
  const isTouchRef = useRef(false)

  useEffect(() => {
    const checkTouch = () => {
      isTouchRef.current = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    }
    checkTouch()

    if (!isTouchRef.current) {
      const handleMouseMove = (e: MouseEvent) => {
        // Normalize coordinates to [-1, 1]
        pointerRef.current.x = (e.clientX / window.innerWidth) * 2 - 1
        pointerRef.current.y = (e.clientY / window.innerHeight) * 2 - 1
      }
      window.addEventListener('mousemove', handleMouseMove)
      return () => window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  useFrame((_state: RootState, delta: number) => {
    // Limit delta to avoid huge jumps when the tab was inactive
    const dt = Math.min(delta, 0.1)

    // 1. Continuous idle rotation (Y axis: ~0.12 rad/s, X axis drift: ~0.02 rad/s)
    if (idleGroupRef.current) {
      idleGroupRef.current.rotation.y += 0.12 * dt
      idleGroupRef.current.rotation.x += 0.02 * dt
    }

    // 2. Pointer parallax with damping (0.05 lerp)
    if (parallaxGroupRef.current) {
      if (!isTouchRef.current) {
        const targetRotY = pointerRef.current.x * 0.15
        const targetRotX = pointerRef.current.y * 0.15
        
        parallaxGroupRef.current.rotation.y = THREE.MathUtils.lerp(
          parallaxGroupRef.current.rotation.y,
          targetRotY,
          0.05
        )
        parallaxGroupRef.current.rotation.x = THREE.MathUtils.lerp(
          parallaxGroupRef.current.rotation.x,
          targetRotX,
          0.05
        )
      } else {
        // Smoothly reset to center on mobile/touch devices
        parallaxGroupRef.current.rotation.y = THREE.MathUtils.lerp(parallaxGroupRef.current.rotation.y, 0, 0.05)
        parallaxGroupRef.current.rotation.x = THREE.MathUtils.lerp(parallaxGroupRef.current.rotation.x, 0, 0.05)
      }
    }
  })

  return (
    <Float speed={1} floatIntensity={0.4} rotationIntensity={0}>
      <group ref={parallaxGroupRef}>
        <group ref={idleGroupRef}>
          {/* Ring A (Silver) */}
          <mesh position={[-0.55, 0, 0]} rotation={[0.5, 0.4, 0]}>
            <torusGeometry args={[1.15, 0.16, 64, 128]} />
            <meshStandardMaterial 
              color="#d9d9d9" 
              metalness={1} 
              roughness={0.15} 
              envMapIntensity={1.2} 
            />
          </mesh>

          {/* Ring B (Gold) */}
          <mesh position={[0.55, 0, 0]} rotation={[0.5, 0.4 + Math.PI / 2, 0]}>
            <torusGeometry args={[1.15, 0.16, 64, 128]} />
            <meshStandardMaterial 
              color="#d4af37" 
              metalness={1} 
              roughness={0.25} 
              envMapIntensity={1.2} 
            />
          </mesh>
        </group>
      </group>
    </Float>
  )
}

export default function HeroScene() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(true)
  const [isDocVisible, setIsDocVisible] = useState(true)

  useEffect(() => {
    // VisibilityChange API
    const handleVisibility = () => {
      setIsDocVisible(document.visibilityState === 'visible')
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // IntersectionObserver API
    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting)
    }, { threshold: 0.05 })

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      observer.disconnect()
    }
  }, [])

  const shouldRender = isVisible && isDocVisible

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 z-0 pointer-events-none"
      aria-hidden="true"
      style={{ width: '100%', height: '100%' }}
    >
      <Canvas
        frameloop={shouldRender ? 'always' : 'never'}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 6], fov: 40 }}
        style={{ background: 'transparent', width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.2} />
        <SceneContent />
        <Environment resolution={256}>
          {/* Key light above */}
          <Lightformer form="rect" intensity={2} position={[0, 5, 0]} scale={[10, 1, 1]} />
          {/* Soft fill left */}
          <Lightformer form="rect" intensity={1} position={[-5, 2, 2]} scale={[5, 5, 1]} />
          {/* Soft fill right */}
          <Lightformer form="rect" intensity={1} position={[5, 2, 2]} scale={[5, 5, 1]} />
          {/* Low-intensity rim light from behind */}
          <Lightformer form="rect" intensity={0.5} position={[0, 2, -5]} scale={[5, 5, 1]} />
        </Environment>
      </Canvas>
    </div>
  )
}
