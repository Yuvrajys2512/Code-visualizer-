import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  BLAST_STAGGER,
  type BlastState,
  type ColorMode,
  heatColor,
  IGNITE_WINDOW,
  smoothstep01,
  type TimelineState,
} from '../effects'
import { ACCENT_COLOR } from '../palette'
import type { Layout } from '../types'
import { CURVE_SEGMENTS, type CurveSet } from './curves'

const EDGE_GREY = new THREE.Color('#aab2bf')
const EDGE_ACCENT = new THREE.Color(ACCENT_COLOR)

interface EdgesProps {
  layout: Layout
  curves: CurveSet
  focusSet: Set<string> | null
  colorMode: ColorMode
  timeline: TimelineState
  blastBox: { state: BlastState | null }
}

/**
 * All edges in a single LineSegments draw call. Additive blending means an
 * edge's brightness *is* its visibility: focus dimming is a colour write in
 * an effect, and the time-lapse / supernova modulate those base colours per
 * frame without ever touching geometry.
 */
export function Edges({ layout, curves, focusSet, colorMode, timeline, blastBox }: EdgesProps) {
  const colorAttrRef = useRef<THREE.BufferAttribute>(null!)
  // true when a per-frame pass has scribbled over the base colours
  const modulated = useRef(false)

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
  const baseColors = useMemo(
    () => new Float32Array(curves.edgeCount * CURVE_SEGMENTS * 2 * 3),
    [curves],
  )

  // When an edge is born: both its stars must exist before light can arc
  // between them. Absent history pins everything to "always".
  const edgeBorn = useMemo(() => {
    const start = layout.history?.start ?? 0
    return layout.edges.map((e) =>
      Math.max(
        layout.byId.get(e.source)!.born ?? start,
        layout.byId.get(e.target)!.born ?? start,
      ),
    )
  }, [layout])

  // Hairline grey at rest — the weave is structure, not decoration. Edges
  // touching the focused node switch to the accent; in heat mode an arc
  // carries the warmer endpoint's charge so hot paths read at a glance.
  useEffect(() => {
    const sc = new THREE.Color()
    const tc = new THREE.Color()
    const mixed = new THREE.Color()
    let w = 0
    for (let e = 0; e < curves.edgeCount; e += 1) {
      const edge = layout.edges[e]
      const touching =
        !focusSet || (focusSet.has(edge.source) && focusSet.has(edge.target))
      const brightness = focusSet ? (touching ? 0.7 : 0.012) : 0.16
      if (focusSet && touching) {
        sc.copy(EDGE_ACCENT)
        tc.copy(EDGE_ACCENT)
      } else if (colorMode === 'heat') {
        const src = layout.byId.get(edge.source)!
        const dst = layout.byId.get(edge.target)!
        heatColor(src.heat ?? 0, sc)
        heatColor(dst.heat ?? 0, tc)
      } else {
        sc.copy(EDGE_GREY)
        tc.copy(EDGE_GREY)
      }
      for (let i = 0; i < CURVE_SEGMENTS; i += 1) {
        for (const frac of [i / CURVE_SEGMENTS, (i + 1) / CURVE_SEGMENTS]) {
          // taper: brightest at mid-arc, fading into the nodes at each end
          const taper = 0.4 + 0.6 * Math.sin(Math.PI * frac)
          mixed.copy(sc).lerp(tc, frac).multiplyScalar(brightness * taper)
          baseColors[w] = mixed.r
          colors[w++] = mixed.r
          baseColors[w] = mixed.g
          colors[w++] = mixed.g
          baseColors[w] = mixed.b
          colors[w++] = mixed.b
        }
      }
    }
    colorAttrRef.current.needsUpdate = true
  }, [layout, curves, colors, baseColors, focusSet, colorMode])

  useFrame(({ clock }) => {
    const era = layout.history ? timeline.era : null
    const blast = blastBox.state
    const blastT = blast && blast.startedAt >= 0 ? clock.elapsedTime - blast.startedAt : -1
    const active = era !== null || blastT >= 0
    if (!active) {
      if (modulated.current) {
        colors.set(baseColors) // effects over: restore the calm sky once
        colorAttrRef.current.needsUpdate = true
        modulated.current = false
      }
      return
    }

    const span = layout.history
    const igniteWin = span ? Math.max(1, (span.end - span.start) * IGNITE_WINDOW) : 1
    const vertsPerEdge = CURVE_SEGMENTS * 2 * 3
    for (let e = 0; e < curves.edgeCount; e += 1) {
      let factor = 1
      if (era !== null) {
        const age = era - edgeBorn[e]
        factor =
          age < 0
            ? 0
            : // new arcs flash bright, then settle into the weave
              smoothstep01(age / igniteWin) * (1 + 2.2 * Math.exp((-age / igniteWin) * 1.6))
      }
      if (blast && blastT >= 0 && factor > 0) {
        const ds = blast.depths.get(layout.edges[e].source)
        const dt = blast.depths.get(layout.edges[e].target)
        if (ds !== undefined && dt !== undefined) {
          const lag = blastT - Math.max(ds, dt) * BLAST_STAGGER
          if (lag > 0) factor *= 1 + 5 * Math.exp(-lag * 2)
        } else {
          factor *= 0.4
        }
      }
      const base = e * vertsPerEdge
      for (let k = 0; k < vertsPerEdge; k += 1) {
        colors[base + k] = baseColors[base + k] * factor
      }
    }
    colorAttrRef.current.needsUpdate = true
    modulated.current = true
  })

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
