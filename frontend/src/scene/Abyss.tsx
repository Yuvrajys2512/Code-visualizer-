import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { DEEP_GLOW_COLOR } from '../palette'
import { makeGlowTexture } from './curves'

/**
 * The deep: a soft glow at the heart of the scene so the void has a centre
 * and a gradient (never flat black), plus slow-drifting plankton motes that
 * parallax against the constellation. Quiet, but unmistakably alive.
 */
export function Abyss() {
  const texture = useMemo(() => makeGlowTexture(), [])
  const planktonRef = useRef<THREE.Points>(null!)

  const plankton = useMemo(() => {
    const COUNT = 320
    const positions = new Float32Array(COUNT * 3)
    const colors = new Float32Array(COUNT * 3)
    let seed = 24681357
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const c = new THREE.Color()
    for (let i = 0; i < COUNT; i += 1) {
      // shell around the constellation so motes drift past it, not through it
      const r = 60 + rand() * 240
      const theta = rand() * Math.PI * 2
      const phi = Math.acos(2 * rand() - 1)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi)
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
      // cyan–teal speckle, a few brighter motes among the dim many
      c.setHSL(0.46 + rand() * 0.1, 0.65, 0.55 + rand() * 0.2)
      c.multiplyScalar(rand() < 0.12 ? 0.5 : 0.12 + rand() * 0.14)
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    return { positions, colors }
  }, [])

  useFrame(({ clock }, delta) => {
    const p = planktonRef.current
    if (!p) return
    p.rotation.y += delta * 0.006
    p.position.y = Math.sin(clock.elapsedTime * 0.05) * 2.5 // slow vertical sway
  })

  return (
    <group>
      {/* the heart of the deep — a broad glow the graph floats in front of */}
      <sprite scale={[680, 680, 1]} renderOrder={-6} raycast={() => null}>
        <spriteMaterial
          map={texture}
          color={DEEP_GLOW_COLOR}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </sprite>
      <points ref={planktonRef} frustumCulled={false} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[plankton.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[plankton.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={1.4}
          map={texture}
          vertexColors
          transparent
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  )
}
