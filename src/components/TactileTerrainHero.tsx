'use client'

import React, { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function Terrain() {
  const meshRef = useRef<THREE.Mesh>(null)
  
  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime()
    const geometry = meshRef.current.geometry as THREE.PlaneGeometry
    const positionAttribute = geometry.attributes.position

    const width = geometry.parameters.widthSegments + 1
    const height = geometry.parameters.heightSegments + 1

    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        const index = i + j * width
        
        // Get base X and Y (which corresponds to 3D X and Z since we rotate the plane)
        const x = (i / width - 0.5) * geometry.parameters.width
        const y = (j / height - 0.5) * geometry.parameters.height
        
        // Calculate wave height using sine/cosine overlapping functions
        // Adjust these values to change the terrain shape and speed
        const wave1 = Math.sin(x * 0.5 + t * 0.5) * 1.5
        const wave2 = Math.cos(y * 0.5 + t * 0.4) * 1.5
        const wave3 = Math.sin((x + y) * 0.3 + t * 0.6) * 1.0
        
        const z = wave1 + wave2 + wave3

        // PlaneGeometry vertices are mapped to (x, y, z).
        // positionAttribute.setZ sets the 3rd component.
        positionAttribute.setZ(index, z)
      }
    }

    positionAttribute.needsUpdate = true
    
    // CRITICAL: Compute vertex normals so flat shading recalculates lighting
    geometry.computeVertexNormals()
  })

  return (
    <mesh 
      ref={meshRef} 
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -2, 0]}
    >
      <planeGeometry args={[50, 50, 60, 60]} />
      <meshStandardMaterial 
        color="#f5f5f5" 
        flatShading={true} 
        roughness={0.8}
        metalness={0.1}
      />
    </mesh>
  )
}

export default function TactileTerrainHero() {
  return (
    <section className="relative w-full h-[85vh] min-h-[600px] overflow-hidden bg-white">
      {/* 3D Canvas Background */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 5, 15], fov: 45 }}>
          <ambientLight intensity={0.4} />
          <directionalLight 
            position={[10, 20, 10]} 
            intensity={1.2} 
            castShadow 
          />
          <directionalLight 
            position={[-10, 5, -10]} 
            intensity={0.5} 
            color="#ffffff"
          />
          <Terrain />
          <fog attach="fog" args={['#ffffff', 10, 35]} />
        </Canvas>
      </div>

      {/* HTML Overlay */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-black mb-4">
          A96 VENTURES
        </h1>
        <p className="text-sm md:text-base font-semibold tracking-[0.2em] text-gray-500 uppercase">
          INVESTING IN THE HUMAN ELEMENT
        </p>
      </div>
    </section>
  )
}
