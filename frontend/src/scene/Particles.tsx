import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { languageColor } from '../palette'
import type { Layout } from '../types'
import { CURVE_SEGMENTS, type CurveSet, makeGlowTexture } from './curves'

interface ParticlesProps {
  layout: Layout
  curves: CurveSet
  focusSet: Set<string> | null
}

const MAX_PARTICLES = 3600

/**
 * Sparks travelling source -> target along each curve: the direction of every
 * dependency is readable at a glance, and the sky visibly "flows".
 */
export function Particles({ layout, curves, focusSet }: ParticlesProps) {
  const geometryRef = useRef<THREE.BufferGeometry>(null!)
  const texture = useMemo(makeGlowTexture, [])

  const { count, edgeOf, phase, speed, positions, colors } = useMemo(() => {
    const perEdge = Math.max(1, Math.min(2, Math.floor(MAX_PARTICLES / Math.max(1, curves.edgeCount))))
    const n = Math.min(MAX_PARTICLES, curves.edgeCount * perEdge)
    const edgeOf = new Uint32Array(n)
    const phase = new Float32Array(n)
    const speed = new Float32Array(n)
    let i = 0
    outer: for (let p = 0; p < perEdge; p += 1) {
      for (let e = 0; e < curves.edgeCount; e += 1) {
        if (i >= n) break outer
        edgeOf[i] = e
        phase[i] = ((e * 0.37 + p * 0.5) % 1 + Math.sin(e * 12.9898) * 0.5 + 1) % 1
        speed[i] = 0.1 + ((e * 7919) % 100) / 100 * 0.08
        i += 1
      }
    }
    return {
      count: n,
      edgeOf,
      phase,
      speed,
      positions: new Float32Array(n * 3),
      colors: new Float32Array(n * 3),
    }
  }, [curves])

  useEffect(() => {
    const c = new THREE.Color()
    for (let i = 0; i < count; i += 1) {
      const edge = layout.edges[edgeOf[i]]
      const touching =
        !focusSet || (focusSet.has(edge.source) && focusSet.has(edge.target))
      c.copy(languageColor(layout.byId.get(edge.target)!.language))
      c.lerp(new THREE.Color('#ffffff'), 0.35)
      c.multiplyScalar(focusSet ? (touching ? 1.6 : 0) : 0.85)
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    const attr = geometryRef.current.getAttribute('color') as THREE.BufferAttribute
    if (attr) attr.needsUpdate = true
  }, [layout, count, edgeOf, colors, focusSet])

  useFrame((_, delta) => {
    const stride = (CURVE_SEGMENTS + 1) * 3
    const dt = Math.min(delta, 0.05)
    for (let i = 0; i < count; i += 1) {
      phase[i] = (phase[i] + dt * speed[i]) % 1
      const f = phase[i] * CURVE_SEGMENTS
      const seg = Math.min(CURVE_SEGMENTS - 1, Math.floor(f))
      const frac = f - seg
      const o = edgeOf[i] * stride + seg * 3
      positions[i * 3] = curves.points[o] + (curves.points[o + 3] - curves.points[o]) * frac
      positions[i * 3 + 1] =
        curves.points[o + 1] + (curves.points[o + 4] - curves.points[o + 1]) * frac
      positions[i * 3 + 2] =
        curves.points[o + 2] + (curves.points[o + 5] - curves.points[o + 2]) * frac
    }
    const attr = geometryRef.current.getAttribute('position') as THREE.BufferAttribute
    if (attr) attr.needsUpdate = true
  })

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={1.7}
        map={texture}
        vertexColors
        transparent
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}
