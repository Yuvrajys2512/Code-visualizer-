import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { languageColor } from '../palette'
import type { Layout } from '../types'
import { makeNebulaTexture } from './materials'

interface NebulaProps {
  layout: Layout
}

/**
 * Atmosphere: a faint nebula veil tinted by each major cluster's language,
 * one deep-indigo wash behind everything, and slow-drifting dust motes.
 * All of it is barely-there on purpose — depth, not decoration.
 */
export function Nebula({ layout }: NebulaProps) {
  const texture = useMemo(() => makeNebulaTexture(), [])
  const dustRef = useRef<THREE.Points>(null!)

  const veils = useMemo(() => {
    const major = [...layout.clusters].sort((a, b) => b.count - a.count).slice(0, 5)
    return major.map((cluster) => {
      const color = languageColor(cluster.language).clone()
      color.lerp(new THREE.Color('#3a3470'), 0.55)
      return {
        key: cluster.dir,
        position: [cluster.x, cluster.y, cluster.z] as [number, number, number],
        scale: Math.max(55, cluster.radius * 4.6),
        color,
        opacity: 0.085,
      }
    })
  }, [layout])

  const dust = useMemo(() => {
    const COUNT = 420
    const positions = new Float32Array(COUNT * 3)
    const colors = new Float32Array(COUNT * 3)
    let seed = 987654
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const c = new THREE.Color()
    for (let i = 0; i < COUNT; i += 1) {
      // shell around the constellation so motes parallax against it
      const r = 50 + rand() * 230
      const theta = rand() * Math.PI * 2
      const phi = Math.acos(2 * rand() - 1)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi)
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
      c.setHSL(0.6 + rand() * 0.12, 0.5, 0.45 + rand() * 0.25)
      c.multiplyScalar(0.16 + rand() * 0.2)
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    return { positions, colors }
  }, [])

  useFrame((_, delta) => {
    if (dustRef.current) dustRef.current.rotation.y += delta * 0.004
  })

  return (
    <group>
      {/* deep ambient wash so the void has a centre */}
      <sprite scale={[620, 620, 1]} renderOrder={-6}>
        <spriteMaterial
          map={texture}
          color="#181438"
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </sprite>
      {veils.map((veil) => (
        <sprite
          key={veil.key}
          position={veil.position}
          scale={[veil.scale, veil.scale, 1]}
          renderOrder={-5}
        >
          <spriteMaterial
            map={texture}
            color={veil.color}
            transparent
            opacity={veil.opacity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}
      <points ref={dustRef} frustumCulled={false} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dust.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[dust.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={1.5}
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
