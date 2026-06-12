'use client'

import { useRef, useEffect, useState } from 'react'
import { Canvas, useFrame, RootState } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'

function SceneContent() {
  const outerMeshRef = useRef<THREE.Mesh>(null)
  const innerMeshRef = useRef<THREE.Mesh>(null)
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

    // 1. Continuous idle rotation
    if (outerMeshRef.current) {
      outerMeshRef.current.rotateX(0.10 * dt)
    }
    if (innerMeshRef.current) {
      innerMeshRef.current.rotateX(-0.16 * dt)
    }

    // 2. Pointer parallax with damping (0.05 lerp)
    if (parallaxGroupRef.current) {
      if (!isTouchRef.current) {
        const targetRotY = pointerRef.current.x * 0.10
        const targetRotX = pointerRef.current.y * 0.10
        
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
    <group ref={parallaxGroupRef}>
      {/* Outer Ring (Silver) */}
      <mesh ref={outerMeshRef} rotation={[0, 0.15, 0]}>
        <torusGeometry args={[1.2, 0.085, 48, 160]} />
        <meshStandardMaterial 
          color="#e2e2e2" 
          metalness={1} 
          roughness={0.12} 
          envMapIntensity={1.1} 
        />
      </mesh>

      {/* Inner Ring (Gold) */}
      <mesh ref={innerMeshRef} rotation={[0, 0.15, 0]}>
        <torusGeometry args={[0.78, 0.085, 48, 160]} />
        <meshStandardMaterial 
          color="#e0b84d" 
          metalness={1} 
          roughness={0.22} 
          envMapIntensity={1.1} 
        />
      </mesh>
    </group>
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
      className="absolute inset-0 pointer-events-none"
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
        <SceneContent />
        <Environment resolution={256}>
          <color attach="background" args={['#ffffff']} />
          {/* Bright key light */}
          <Lightformer form="rect" intensity={4} position={[0, 5, 0]} scale={[10, 2, 1]} />
          {/* 3 dark contrast Lightformers */}
          <Lightformer form="rect" color="#000000" intensity={1} position={[-5, 2, 2]} scale={[5, 5, 1]} />
          <Lightformer form="rect" color="#000000" intensity={1} position={[5, 2, 2]} scale={[5, 5, 1]} />
          <Lightformer form="rect" color="#000000" intensity={1} position={[0, 2, -5]} scale={[5, 5, 1]} />
        </Environment>
      </Canvas>
    </div>
  )
}
