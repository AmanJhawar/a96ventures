'use client'

import React, { useRef, useEffect, useMemo, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const NUM_NODES = 200
const MAX_DISTANCE = 2.5
const REPULSION_RADIUS = 3.0
const REPULSION_FORCE = 0.08
const BOUNDS = { x: 12, y: 8, z: 4 }

function NetworkParticles({ isReducedMotion, inView }: { isReducedMotion: boolean; inView: boolean }) {
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
    if (!pointsRef.current || !linesRef.current || !inView) return

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

      if (!isReducedMotion) {
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
      }

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

    if (!isReducedMotion) {
      posAttr.needsUpdate = true
    }

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

export default function NetworkScene({ inView }: { inView: boolean }) {
  const [isReducedMotion, setIsReducedMotion] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setIsReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return (
    <Canvas 
      camera={{ position: [0, 0, 8], fov: 60 }} 
      dpr={[1, 1.75]} 
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ background: 'transparent', width: '100%', height: '100%' }}
    >
      <NetworkParticles isReducedMotion={isReducedMotion} inView={inView} />
    </Canvas>
  )
}
