import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { languageColor } from '../palette'
import type { Layout } from '../types'
import { CURVE_SEGMENTS, type CurveSet } from './curves'

interface EdgesProps {
  layout: Layout
  curves: CurveSet
  focusSet: Set<string> | null
}

/**
 * All edges in a single LineSegments draw call. Additive blending means an
 * edge's brightness *is* its visibility, so dimming for focus mode is just a
 * colour write — no geometry churn.
 */
export function Edges({ layout, curves, focusSet }: EdgesProps) {
  const colorAttrRef = useRef<THREE.BufferAttribute>(null!)

  const positions = useMemo(() => {
    const stride = (CURVE_SEGMENTS + 1) * 3
    const out = new Float32Array(curves.edgeCount * CURVE_SEGMENTS * 2 * 3)
    let w = 0
    for (let e = 0; e < curves.edgeCount; e += 1) {
      const base = e * stride
      for (let i = 0; i < CURVE_SEGMENTS; i += 1) {
        const p = base + i * 3
        out[w++] = curves.points[p]
        out[w++] = curves.points[p + 1]
        out[w++] = curves.points[p + 2]
        out[w++] = curves.points[p + 3]
        out[w++] = curves.points[p + 4]
        out[w++] = curves.points[p + 5]
      }
    }
    return out
  }, [curves])

  const colors = useMemo(
    () => new Float32Array(curves.edgeCount * CURVE_SEGMENTS * 2 * 3),
    [curves],
  )

  useEffect(() => {
    const sc = new THREE.Color()
    const tc = new THREE.Color()
    const mixed = new THREE.Color()
    let w = 0
    for (let e = 0; e < curves.edgeCount; e += 1) {
      const edge = layout.edges[e]
      const touching =
        !focusSet || (focusSet.has(edge.source) && focusSet.has(edge.target))
      const brightness = focusSet ? (touching ? 0.55 : 0.018) : 0.16
      sc.copy(languageColor(layout.byId.get(edge.source)!.language))
      tc.copy(languageColor(layout.byId.get(edge.target)!.language))
      for (let i = 0; i < CURVE_SEGMENTS; i += 1) {
        for (const frac of [i / CURVE_SEGMENTS, (i + 1) / CURVE_SEGMENTS]) {
          mixed.copy(sc).lerp(tc, frac).multiplyScalar(brightness)
          colors[w++] = mixed.r
          colors[w++] = mixed.g
          colors[w++] = mixed.b
        }
      }
    }
    colorAttrRef.current.needsUpdate = true
  }, [layout, curves, colors, focusSet])

  return (
    <lineSegments frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute ref={colorAttrRef} attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.85}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  )
}
