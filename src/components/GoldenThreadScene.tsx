'use client'

import React, { useState, useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const PARTICLE_COUNT = 6000

const vertexShader = `
uniform float uTime;
attribute float aPhase;

void main() {
  vec3 pos = position;
  
  float waveX = pos.x * 0.2 + uTime * 0.5;
  float coreY = sin(waveX) * 3.0;
  float coreZ = cos(waveX * 0.8) * 3.0;
  
  float driftY = sin(uTime + aPhase) * 0.5;
  float driftZ = cos(uTime * 0.8 + aPhase) * 0.5;
  
  pos.y += coreY + driftY;
  pos.z += coreZ + driftZ;
  
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  
  // size attenuation
  gl_PointSize = 150.0 * (1.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`

const fragmentShader = `
uniform vec3 uColor;
uniform float uFade;

void main() {
  vec2 xy = gl_PointCoord.xy - vec2(0.5);
  float ll = length(xy);
  if (ll > 0.5) discard;
  
  // Soft edge
  float alpha = 0.8 * (1.0 - ll * 2.0) * uFade;
  gl_FragColor = vec4(uColor, alpha);
}
`

function ThreadParticles({ isReducedMotion, inView }: { isReducedMotion: boolean, inView: boolean }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)

  const [{ basePositions, phases }] = useState(() => {
    const basePositions = new Float32Array(PARTICLE_COUNT * 3)
    const phases = new Float32Array(PARTICLE_COUNT)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      const x = (Math.random() - 0.5) * 40
      const r = Math.random() * 1.5
      const theta = Math.random() * Math.PI * 2

      basePositions[i3] = x
      basePositions[i3 + 1] = Math.cos(theta) * r
      basePositions[i3 + 2] = Math.sin(theta) * r

      phases[i] = Math.random() * Math.PI * 2
    }

    return { basePositions, phases }
  })

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#999999') }, // Sleek monochrome grey
    uFade: { value: 0 }
  }), [])

  useFrame(({ clock }) => {
    if (!materialRef.current || !inView) return
    
    // Smooth fade-in over the first 2 seconds
    if (materialRef.current.uniforms.uFade.value < 1.0) {
      materialRef.current.uniforms.uFade.value = Math.min(1.0, clock.getElapsedTime() * 0.5)
    }

    // Only update time if not reduced motion
    if (!isReducedMotion) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime()
    }
  })

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={PARTICLE_COUNT}
          array={basePositions}
          itemSize={3}
          args={[basePositions, 3]}
        />
        <bufferAttribute
          attach="attributes-aPhase"
          count={PARTICLE_COUNT}
          array={phases}
          itemSize={1}
          args={[phases, 1]}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
      />
    </points>
  )
}

function CameraParallax({ isReducedMotion, inView }: { isReducedMotion: boolean, inView: boolean }) {
  useFrame((state) => {
    if (!inView) return
    
    if (isReducedMotion) {
      state.camera.position.x = 0
      state.camera.position.y = 0
      state.camera.lookAt(0, 0, 0)
      return
    }

    const targetX = state.pointer.x * 2
    const targetY = state.pointer.y * 2
    
    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, targetX, 0.05)
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, targetY, 0.05)
    
    state.camera.lookAt(0, 0, 0)
  })
  
  return null
}

export default function GoldenThreadScene({ inView }: { inView: boolean }) {
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
      camera={{ position: [0, 0, 15], fov: 45 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <CameraParallax isReducedMotion={isReducedMotion} inView={inView} />
      <ThreadParticles isReducedMotion={isReducedMotion} inView={inView} />
      {/* Fog to fade the ribbon ends softly into the background */}
      <fog attach="fog" args={['#ffffff', 10, 25]} />
    </Canvas>
  )
}
