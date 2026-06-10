import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { type ColorMode, heatColor, type TimelineState } from '../effects'
import { languageColor } from '../palette'
import type { Layout } from '../types'
import { CURVE_SEGMENTS, type CurveSet, makeGlowTexture } from './curves'

interface ParticlesProps {
  layout: Layout
  curves: CurveSet
  focusSet: Set<string> | null
  colorMode: ColorMode
  timeline: TimelineState
}

const MAX_HEADS = 1400
/** trailing ghosts per spark, fading behind the head — reads as a comet */
const TRAIL = 3
const TRAIL_FADE = [1, 0.42, 0.15]
const TRAIL_LAG = 0.022

/**
 * Comets travelling source -> target along each curve: the direction of every
 * dependency is readable at a glance, and the sky visibly "flows".
 */
export function Particles({ layout, curves, focusSet, colorMode, timeline }: ParticlesProps) {
  const geometryRef = useRef<THREE.BufferGeometry>(null!)
  const texture = useMemo(() => makeGlowTexture(), [])

  // No comet may travel an arc whose stars haven't been born yet.
  const edgeBorn = useMemo(() => {
    const start = layout.history?.start ?? 0
    return layout.edges.map((e) =>
      Math.max(
        layout.byId.get(e.source)!.born ?? start,
        layout.byId.get(e.target)!.born ?? start,
      ),
    )
  }, [layout])

  const { count, edgeOf, phase, speed, positions, colors } = useMemo(() => {
    const perEdge = Math.max(1, Math.min(2, Math.floor(MAX_HEADS / Math.max(1, curves.edgeCount))))
    const n = Math.min(MAX_HEADS, curves.edgeCount * perEdge)
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
      positions: new Float32Array(n * TRAIL * 3),
      colors: new Float32Array(n * TRAIL * 3),
    }
  }, [curves])

  useEffect(() => {
    const c = new THREE.Color()
    for (let i = 0; i < count; i += 1) {
      const edge = layout.edges[edgeOf[i]]
      const touching =
        !focusSet || (focusSet.has(edge.source) && focusSet.has(edge.target))
      const target = layout.byId.get(edge.target)!
      if (colorMode === 'heat') heatColor(target.heat ?? 0, c)
      else c.copy(languageColor(target.language))
      c.lerp(new THREE.Color('#ffffff'), 0.35)
      c.multiplyScalar(focusSet ? (touching ? 1.6 : 0) : 0.85)
      for (let t = 0; t < TRAIL; t += 1) {
        const o = (i * TRAIL + t) * 3
        colors[o] = c.r * TRAIL_FADE[t]
        colors[o + 1] = c.g * TRAIL_FADE[t]
        colors[o + 2] = c.b * TRAIL_FADE[t]
      }
    }
    const attr = geometryRef.current.getAttribute('color') as THREE.BufferAttribute
    if (attr) attr.needsUpdate = true
  }, [layout, count, edgeOf, colors, focusSet, colorMode])

  useFrame((_, delta) => {
    const stride = (CURVE_SEGMENTS + 1) * 3
    const dt = Math.min(delta, 0.05)
    const era = layout.history ? timeline.era : null
    for (let i = 0; i < count; i += 1) {
      phase[i] = (phase[i] + dt * speed[i]) % 1
      if (era !== null && edgeBorn[edgeOf[i]] > era) {
        // edge not born yet: park the comet far outside the fog
        for (let t = 0; t < TRAIL; t += 1) {
          const w = (i * TRAIL + t) * 3
          positions[w] = 0
          positions[w + 1] = -1e5
          positions[w + 2] = 0
        }
        continue
      }
      for (let t = 0; t < TRAIL; t += 1) {
        const p = phase[i] - t * TRAIL_LAG
        const clamped = Math.max(0, Math.min(1, p < 0 ? p + 1 : p))
        const f = clamped * CURVE_SEGMENTS
        const seg = Math.min(CURVE_SEGMENTS - 1, Math.floor(f))
        const frac = f - seg
        const o = edgeOf[i] * stride + seg * 3
        const w = (i * TRAIL + t) * 3
        positions[w] = curves.points[o] + (curves.points[o + 3] - curves.points[o]) * frac
        positions[w + 1] =
          curves.points[o + 1] + (curves.points[o + 4] - curves.points[o + 1]) * frac
        positions[w + 2] =
          curves.points[o + 2] + (curves.points[o + 5] - curves.points[o + 2]) * frac
      }
    }
    const attr = geometryRef.current.getAttribute('position') as THREE.BufferAttribute
    if (attr) attr.needsUpdate = true
  })

  return (
    <points frustumCulled={false} raycast={() => null}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={1.9}
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
