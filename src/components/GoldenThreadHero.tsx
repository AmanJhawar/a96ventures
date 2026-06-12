'use client'

import React, { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const PARTICLE_COUNT = 6000

function ThreadParticles() {
  const pointsRef = useRef<THREE.Points>(null)

  // Pre-calculate base positions and random phase offsets to avoid memory allocation in loop
  const { basePositions, livePositions, phases } = useMemo(() => {
    const basePositions = new Float32Array(PARTICLE_COUNT * 3)
    const phases = new Float32Array(PARTICLE_COUNT)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      // Distribute particles widely along X, but tightly along Y and Z initially
      const x = (Math.random() - 0.5) * 40
      // Small random spread around the central tube/ribbon
      const r = Math.random() * 1.5
      const theta = Math.random() * Math.PI * 2

      basePositions[i3] = x
      basePositions[i3 + 1] = Math.cos(theta) * r
      basePositions[i3 + 2] = Math.sin(theta) * r

      // Random phase offset for individual particle variation
      phases[i] = Math.random() * Math.PI * 2
    }

    // Create a copy for the live buffer so we don't mutate our reference data
    const livePositions = new Float32Array(basePositions)

    return { basePositions, livePositions, phases }
  }, [])

  useFrame(({ clock }) => {
    if (!pointsRef.current) return
    
    const t = clock.getElapsedTime()
    const geometry = pointsRef.current.geometry as THREE.BufferGeometry
    const positions = geometry.attributes.position.array as Float32Array

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      const basePathX = basePositions[i3]
      const phase = phases[i]

      // Determine the core twisting shape using sine/cosine based on X position and time
      const waveX = basePathX * 0.2 + t * 0.5
      const coreY = Math.sin(waveX) * 3
      const coreZ = Math.cos(waveX * 0.8) * 3

      // Individual particle drift around the core
      const driftY = Math.sin(t + phase) * 0.5
      const driftZ = Math.cos(t * 0.8 + phase) * 0.5

      // Only mutate Y and Z to create the flowing effect, X stays stable
      positions[i3 + 1] = basePositions[i3 + 1] + coreY + driftY
      positions[i3 + 2] = basePositions[i3 + 2] + coreZ + driftZ
    }

    // Mark the buffer for update
    geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={PARTICLE_COUNT}
          array={livePositions}
          itemSize={3}
          args={[livePositions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.12}
        color="#d4af37"
        transparent={true}
        opacity={0.8}
        sizeAttenuation={true}
        depthWrite={false}
      />
    </points>
  )
}

function CameraParallax() {
  useFrame((state) => {
    // Smoothly interpolate the camera position towards the mouse position
    // state.mouse is normalized between -1 and 1
    const targetX = state.mouse.x * 2
    const targetY = state.mouse.y * 2
    
    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, targetX, 0.05)
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, targetY, 0.05)
    
    // Look at the center so the ribbon stays focused
    state.camera.lookAt(0, 0, 0)
  })
  
  return null
}

export default function GoldenThreadHero() {
  return (
    <section className="relative w-full h-[85vh] min-h-[600px] overflow-hidden bg-white">
      {/* 3D Canvas Background */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
          <CameraParallax />
          <ThreadParticles />
          {/* Fog to fade the ribbon ends softly into the background */}
          <fog attach="fog" args={['#ffffff', 10, 25]} />
        </Canvas>
      </div>

      {/* HTML Overlay */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
        <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight text-black max-w-4xl mx-auto drop-shadow-sm leading-tight">
          We partner with visionaries to build tomorrow&apos;s defining companies.
        </h1>
      </div>
    </section>
  )
}
