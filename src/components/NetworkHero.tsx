'use client'

import React, { useRef, useEffect, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import Link from 'next/link'

const NUM_NODES = 150
const MAX_DISTANCE = 2.5
const REPULSION_RADIUS = 3.0
const REPULSION_FORCE = 0.08
const BOUNDS = { x: 12, y: 8, z: 4 }

function NetworkParticles() {
  const pointsRef = useRef<THREE.Points>(null)
  const linesRef = useRef<THREE.LineSegments>(null)
  const mousePosRef = useRef(new THREE.Vector3(0, 0, 1000)) // start far away

  // Pre-allocate buffers
  const positions = useMemo(() => new Float32Array(NUM_NODES * 3), [])
  const velocities = useMemo(() => new Float32Array(NUM_NODES * 3), [])
  
  const maxLines = (NUM_NODES * (NUM_NODES - 1)) / 2
  const linePositions = useMemo(() => new Float32Array(maxLines * 6), [])
  const lineColors = useMemo(() => new Float32Array(maxLines * 6), [])

  useEffect(() => {
    // Initialize nodes
    for (let i = 0; i < NUM_NODES; i++) {
      positions[i * 3] = (Math.random() - 0.5) * BOUNDS.x * 2
      positions[i * 3 + 1] = (Math.random() - 0.5) * BOUNDS.y * 2
      positions[i * 3 + 2] = (Math.random() - 0.5) * BOUNDS.z * 2

      velocities[i * 3] = (Math.random() - 0.5) * 0.02
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.02
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02
    }
  }, [positions, velocities])

  useFrame((state) => {
    if (!pointsRef.current || !linesRef.current) return

    // Calculate 3D mouse position on Z=0 plane
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const target3D = new THREE.Vector3()
    
    // Only attract to mouse if it's interacting, otherwise keep it far away
    if (state.pointer.x !== 0 || state.pointer.y !== 0) {
      state.raycaster.ray.intersectPlane(plane, target3D)
      mousePosRef.current.lerp(target3D, 0.1)
    }

    const mx = mousePosRef.current.x
    const my = mousePosRef.current.y
    const mz = mousePosRef.current.z

    let lineIndex = 0
    const posAttr = pointsRef.current.geometry.attributes.position

    for (let i = 0; i < NUM_NODES; i++) {
      let x = positions[i * 3]
      let y = positions[i * 3 + 1]
      let z = positions[i * 3 + 2]

      let vx = velocities[i * 3]
      let vy = velocities[i * 3 + 1]
      let vz = velocities[i * 3 + 2]

      // Mouse repulsion
      const dx = x - mx
      const dy = y - my
      const dz = z - mz
      const distSq = dx * dx + dy * dy + dz * dz

      if (distSq < REPULSION_RADIUS * REPULSION_RADIUS) {
        const dist = Math.sqrt(distSq)
        const force = (REPULSION_RADIUS - dist) / REPULSION_RADIUS
        vx += (dx / dist) * force * REPULSION_FORCE
        vy += (dy / dist) * force * REPULSION_FORCE
        vz += (dz / dist) * force * REPULSION_FORCE
      }

      // Brownian motion to keep it organic
      vx += (Math.random() - 0.5) * 0.001
      vy += (Math.random() - 0.5) * 0.001
      vz += (Math.random() - 0.5) * 0.001

      // Damping
      vx *= 0.99
      vy *= 0.99
      vz *= 0.99

      // Soft bounds
      if (Math.abs(x) > BOUNDS.x) vx -= Math.sign(x) * 0.002
      if (Math.abs(y) > BOUNDS.y) vy -= Math.sign(y) * 0.002
      if (Math.abs(z) > BOUNDS.z) vz -= Math.sign(z) * 0.002

      x += vx
      y += vy
      z += vz

      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z

      velocities[i * 3] = vx
      velocities[i * 3 + 1] = vy
      velocities[i * 3 + 2] = vz

      // Connections
      for (let j = i + 1; j < NUM_NODES; j++) {
        const jx = positions[j * 3]
        const jy = positions[j * 3 + 1]
        const jz = positions[j * 3 + 2]

        const dSq = (x - jx) ** 2 + (y - jy) ** 2 + (z - jz) ** 2

        if (dSq < MAX_DISTANCE * MAX_DISTANCE) {
          const dist = Math.sqrt(dSq)
          const alpha = 1.0 - dist / MAX_DISTANCE

          // Line base color: Dark grey (#333333 -> 51, 51, 51)
          // Background color: #ffffff -> 255, 255, 255
          // Faking alpha by blending with the background color
          const rBase = 51 / 255
          const gBase = 51 / 255
          const bBase = 51 / 255
          const bg = 255 / 255

          const r = bg + (rBase - bg) * alpha
          const g = bg + (gBase - bg) * alpha
          const b = bg + (bBase - bg) * alpha

          const idx = lineIndex * 6
          
          linePositions[idx] = x
          linePositions[idx + 1] = y
          linePositions[idx + 2] = z
          linePositions[idx + 3] = jx
          linePositions[idx + 4] = jy
          linePositions[idx + 5] = jz

          lineColors[idx] = r
          lineColors[idx + 1] = g
          lineColors[idx + 2] = b
          lineColors[idx + 3] = r
          lineColors[idx + 4] = g
          lineColors[idx + 5] = b

          lineIndex++
        }
      }
    }

    posAttr.needsUpdate = true

    const lineGeo = linesRef.current.geometry
    lineGeo.setDrawRange(0, lineIndex * 2)
    lineGeo.attributes.position.needsUpdate = true
    lineGeo.attributes.color.needsUpdate = true
  })

  return (
    <group>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={NUM_NODES}
          />
        </bufferGeometry>
        {/* Slightly larger than lines, dark grey */}
        <pointsMaterial size={0.06} color="#333333" sizeAttenuation transparent opacity={0.6} />
      </points>

      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[linePositions, 3]}
            count={maxLines * 2}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[lineColors, 3]}
            count={maxLines * 2}
          />
        </bufferGeometry>
        <lineBasicMaterial vertexColors transparent={false} />
      </lineSegments>
    </group>
  )
}

export default function NetworkHero() {
  return (
    <section className="relative w-full h-[80vh] min-h-[600px] overflow-hidden flex flex-col items-center justify-center">
      {/* 3D Canvas Background */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-gray-50 to-white">
        <Canvas camera={{ position: [0, 0, 8], fov: 60 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
          <NetworkParticles />
        </Canvas>
      </div>
      
      {/* Overlay Content */}
      <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none text-center px-6 max-w-[900px] mx-auto">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-black mb-6 animate-[clipReveal_800ms_var(--ease-out)_forwards] drop-shadow-sm">
          We partner with <span className="relative inline-block after:absolute after:bottom-1 after:left-0 after:right-0 after:h-0.5 after:bg-black after:animate-[underlineGrow_600ms_var(--ease-out)_0.8s_both]">visionaries</span> &nbsp;to build tomorrow&apos;s defining companies.
        </h1>
        <p className="text-xl font-normal text-gray-600 leading-relaxed max-w-[600px] mx-auto opacity-0 animate-[fadeInUp_600ms_var(--ease-out)_forwards] [animation-delay:400ms] mb-12">
          Early-stage venture capital focused on transformative technologies and exceptional founders.
        </p>
        <div className="opacity-0 animate-[fadeInUp_600ms_var(--ease-out)_forwards] [animation-delay:600ms] flex flex-wrap gap-4 justify-center pointer-events-auto">
          <Link 
            href="/portfolio" 
            className="inline-block bg-black text-white px-8 py-4 rounded-full font-medium tracking-wide text-sm transition-[background-color,transform,box-shadow] duration-[160ms] ease-[var(--ease-out)] hover:bg-gray-800 active:scale-[0.97] shadow-lg hover:shadow-xl"
          >
            View Portfolio
          </Link>
          <Link 
            href="/catalog" 
            className="inline-block bg-white text-black border border-gray-300 px-8 py-4 rounded-full font-medium tracking-wide text-sm transition-[background-color,border-color,transform,box-shadow] duration-[160ms] ease-[var(--ease-out)] hover:bg-gray-50 hover:border-gray-400 active:scale-[0.97] shadow-sm hover:shadow-md"
          >
            Explore Catalog
          </Link>
        </div>
      </div>
    </section>
  )
}
