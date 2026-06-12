'use client'

import React, { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// --- Custom Shaders ---

const vertexShader = `
uniform float uTime;
attribute float aScale;
varying float vZ;

// Classic Perlin 3D Noise by Stefan Gustavson
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
vec3 fade(vec3 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}

float cnoise(vec3 P){
  vec3 Pi0 = floor(P); // Integer part for indexing
  vec3 Pi1 = Pi0 + vec3(1.0); // Integer part + 1
  Pi0 = mod(Pi0, 289.0);
  Pi1 = mod(Pi1, 289.0);
  vec3 Pf0 = fract(P); // Fractional part for interpolation
  vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = Pi0.zzzz;
  vec4 iz1 = Pi1.zzzz;

  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + iz0);
  vec4 ixy1 = permute(ixy + iz1);

  vec4 gx0 = ixy0 / 7.0;
  vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5);
  gy0 -= sz0 * (step(0.0, gy0) - 0.5);

  vec4 gx1 = ixy1 / 7.0;
  vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5);
  gy1 -= sz1 * (step(0.0, gy1) - 0.5);

  vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
  vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
  vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
  vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
  vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
  vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
  vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
  vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

  vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
  g000 *= norm0.x;
  g010 *= norm0.y;
  g100 *= norm0.z;
  g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
  g001 *= norm1.x;
  g011 *= norm1.y;
  g101 *= norm1.z;
  g111 *= norm1.w;

  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
  float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
  float n111 = dot(g111, Pf1);

  vec3 fade_xyz = fade(Pf0);
  vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x); 
  return 2.2 * n_xyz;
}

void main() {
  vec3 pos = position;
  
  // Calculate noise based on position and slow time
  float noiseFreq = 0.15;
  float noiseAmp = 1.8;
  vec3 noisePos = vec3(pos.x * noiseFreq, pos.z * noiseFreq + uTime * 0.15, uTime * 0.1);
  float noise = cnoise(noisePos) * noiseAmp;
  
  // Add a long, gentle sine wave for a broader ocean roll
  float wave = sin(pos.x * 0.1 + uTime * 0.2) * 1.0 + cos(pos.z * 0.1 + uTime * 0.15) * 1.0;
  
  pos.y += noise + wave;
  
  // Pass the adjusted Y position to the fragment shader for brightness modulation
  vZ = pos.y;
  
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  
  // Dynamic size attenuation based on distance and individual scale
  gl_PointSize = 12.0 * aScale * (10.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`

const fragmentShader = `
varying float vZ;

void main() {
  // Create a soft circular point by calculating distance from the fragment center
  float distanceToCenter = distance(gl_PointCoord, vec2(0.5));
  if (distanceToCenter > 0.5) discard;
  
  // Soft radial gradient edge
  float alpha = 1.0 - smoothstep(0.3, 0.5, distanceToCenter);
  
  // Modulate opacity based on height (peaks glow slightly brighter, valleys fade)
  // vZ typically ranges from -3.0 to 3.0 based on our wave amplitudes
  float heightAlpha = smoothstep(-3.0, 3.0, vZ) * 0.7 + 0.3;
  
  // Final alpha combination
  float finalAlpha = alpha * heightAlpha;
  
  gl_FragColor = vec4(1.0, 1.0, 1.0, finalAlpha);
}
`

// --- Components ---

function TerrainParticles() {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  
  // We want a dense grid of roughly 15,000 to 20,000 points.
  // 140x140 = 19,600 points
  const gridSizeX = 140
  const gridSizeZ = 140
  const spacing = 0.35 // Distance between points in the grid
  
  const count = gridSizeX * gridSizeZ

  const [positions, scales] = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const scale = new Float32Array(count)
    
    // Offset so the grid is centered
    const offsetX = (gridSizeX * spacing) / 2
    const offsetZ = (gridSizeZ * spacing) / 2
    
    let i = 0
    for (let x = 0; x < gridSizeX; x++) {
      for (let z = 0; z < gridSizeZ; z++) {
        // Create the grid
        pos[i * 3] = (x * spacing) - offsetX
        pos[i * 3 + 1] = 0 // Y will be displaced by vertex shader
        pos[i * 3 + 2] = (z * spacing) - offsetZ
        
        // Randomize the size of each particle slightly
        scale[i] = Math.random() * 0.6 + 0.4
        
        i++
      }
    }
    
    return [pos, scale]
  }, [count])
  
  useFrame((state) => {
    // 1. Update shader time for wave animation
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
    }
    
    // 2. Subtle camera parallax tied to pointer. 
    // State.pointer is normalized between -1 and 1.
    const targetX = state.pointer.x * 2.0
    const targetY = state.pointer.y * 1.5 + 4.0 // Base height of 4.0
    
    // Smooth dampening towards target
    state.camera.position.x += (targetX - state.camera.position.x) * 0.05
    state.camera.position.y += (targetY - state.camera.position.y) * 0.05
    
    // Always look slightly ahead and down
    state.camera.lookAt(0, -1, 0)
  })

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-aScale"
          count={count}
          args={[scales, 1]}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          uTime: { value: 0 }
        }}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

export default function PulseTerrainHero() {
  return (
    <section className="relative w-full h-[80vh] min-h-[600px] overflow-hidden bg-[#050505]">
      {/* 3D Canvas Background */}
      <div className="absolute inset-0 z-0">
        {/* Camera is initially positioned, but useFrame controls it actively */}
        <Canvas camera={{ position: [0, 4, 12], fov: 45 }}>
          {/* Fog creates the depth-of-field fade out into the background color */}
          <fog attach="fog" args={['#050505', 5, 25]} />
          <TerrainParticles />
        </Canvas>
      </div>

      {/* Overlay Content */}
      <div className="relative z-10 w-full h-full flex flex-col justify-center max-w-7xl mx-auto px-6 pointer-events-none">
        <div className="max-w-4xl text-center md:text-left">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-white mb-6 animate-[clipReveal_800ms_var(--ease-out)_forwards] drop-shadow-sm">
            We partner with <span className="relative inline-block after:absolute after:bottom-1 after:left-0 after:right-0 after:h-0.5 after:bg-white after:animate-[underlineGrow_600ms_var(--ease-out)_0.8s_both]">visionaries</span>{' '}to build tomorrow&apos;s defining companies.
          </h1>
          <p className="text-xl font-normal text-gray-300 leading-relaxed max-w-[600px] mx-auto md:mx-0 opacity-0 animate-[fadeInUp_600ms_var(--ease-out)_forwards] [animation-delay:400ms] mb-12">
            A venture capital firm focused on category-defining companies at their earliest stages.
          </p>
          <div className="opacity-0 animate-[fadeInUp_600ms_var(--ease-out)_forwards] [animation-delay:600ms] flex flex-wrap gap-4 justify-center md:justify-start pointer-events-auto">
            <a href="/portfolio" className="px-8 py-4 bg-white text-black rounded-full text-base font-semibold tracking-wide transition-[background-color,transform] duration-200 ease-[var(--ease-out)] hover:bg-gray-100 active:scale-[0.97]">
              View Portfolio
            </a>
            <a href="/contact" className="px-8 py-4 bg-transparent text-white border border-gray-600 rounded-full text-base font-semibold tracking-wide transition-[background-color,border-color,transform] duration-200 ease-[var(--ease-out)] hover:border-white hover:bg-white/5 active:scale-[0.97]">
              Get in Touch
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
