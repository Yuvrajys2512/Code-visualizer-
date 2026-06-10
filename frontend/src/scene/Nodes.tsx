import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { hoverChime, igniteSparkle } from '../audio'
import {
  BLAST_STAGGER,
  type BlastState,
  type ColorMode,
  FLARE_WINDOW,
  heatColor,
  IGNITE_WINDOW,
  smoothstep01,
  type TimelineState,
} from '../effects'
import { ACCENT_COLOR, languageColor } from '../palette'
import type { Layout } from '../types'
import { createHaloMaterial, createStarMaterial } from './materials'

interface NodesProps {
  layout: Layout
  focusSet: Set<string> | null
  hoveredId: string | null
  colorMode: ColorMode
  timeline: TimelineState
  blastBox: { state: BlastState | null }
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}

const tmpMatrix = new THREE.Matrix4()
const tmpColor = new THREE.Color()
const DIM = new THREE.Color('#0f2029')
const WHITE = new THREE.Color('#ffffff')
const ACCENT = new THREE.Color(ACCENT_COLOR)

export function Nodes({
  layout,
  focusSet,
  hoveredId,
  colorMode,
  timeline,
  blastBox,
  onHover,
  onSelect,
}: NodesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const haloColorRef = useRef<THREE.BufferAttribute>(null!)
  const starMaterial = useMemo(() => createStarMaterial(), [])
  const haloMaterial = useMemo(() => createHaloMaterial(), [])
  const prevEra = useRef<number | null>(null)

  const pulsePhases = useMemo(
    () => layout.nodes.map((_, i) => (i * 0.61803) % (Math.PI * 2)),
    [layout],
  )

  // History, unpacked for the per-frame loop. Files without a recorded birth
  // (e.g. uncommitted) are treated as present from the very first commit.
  const span = layout.history
  const born = useMemo(
    () => layout.nodes.map((n) => n.born ?? span?.start ?? 0),
    [layout, span],
  )
  const edits = useMemo(() => layout.nodes.map((n) => n.edits ?? []), [layout])

  const halo = useMemo(() => {
    const positions = new Float32Array(layout.nodes.length * 3)
    const sizes = new Float32Array(layout.nodes.length)
    for (const node of layout.nodes) {
      positions[node.index * 3] = node.x
      positions[node.index * 3 + 1] = node.y
      positions[node.index * 3 + 2] = node.z
      sizes[node.index] = node.radius * (5.5 + node.significance * 3.5)
    }
    return { positions, sizes, colors: new Float32Array(layout.nodes.length * 3) }
  }, [layout])

  // Base transforms once per layout.
  useEffect(() => {
    const mesh = meshRef.current
    for (const node of layout.nodes) {
      tmpMatrix.makeScale(node.radius, node.radius, node.radius)
      tmpMatrix.setPosition(node.x, node.y, node.z)
      mesh.setMatrixAt(node.index, tmpMatrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [layout])

  // Single per-frame appearance pass: time-lapse visibility and flares,
  // supernova flashes, focus dimming, hover swell, breathing — everything
  // collapses into one colour and one scale per star. HDR multipliers push
  // bright stars past the bloom threshold, so significance (or churn heat,
  // or an exploding shockwave) literally controls glow.
  useFrame(({ clock }) => {
    const mesh = meshRef.current
    const t = clock.elapsedTime
    const era = span ? timeline.era : null
    const igniteWin = span ? Math.max(1, (span.end - span.start) * IGNITE_WINDOW) : 1
    const flareWin = span ? Math.max(1, (span.end - span.start) * FLARE_WINDOW) : 1
    const blast = blastBox.state
    const blastT = blast && blast.startedAt >= 0 ? t - blast.startedAt : -1

    for (const node of layout.nodes) {
      const i = node.index
      const inFocus = !focusSet || focusSet.has(node.id)
      const hovered = node.id === hoveredId

      // -- time-lapse: does this star exist yet, and is it flaring? --------
      let vis = 1
      let flare = 0
      if (era !== null) {
        const age = era - born[i]
        if (age < 0) {
          vis = 0
        } else {
          vis = smoothstep01(age / igniteWin)
          flare += 1.6 * Math.exp((-age / igniteWin) * 1.8) // birth flash
          const stamps = edits[i]
          for (let k = stamps.length - 1; k >= 0; k -= 1) {
            const since = era - stamps[k]
            if (since < 0) continue
            if (since > flareWin * 5) break // sorted ascending: older only
            flare += 0.8 * Math.exp((-since / flareWin) * 2.5)
          }
          // a star igniting right now sings, faintly
          if (
            timeline.playing &&
            prevEra.current !== null &&
            born[i] > prevEra.current &&
            born[i] <= era &&
            node.significance > 0.45
          ) {
            igniteSparkle(node.significance)
          }
        }
      }

      // -- supernova: staged flash as the wave crosses each dependency ring
      let blastBoost = 0
      let blastDim = 1
      if (blast && blastT >= 0) {
        const depth = blast.depths.get(node.id)
        if (depth === undefined) {
          blastDim = 0.45 // darken bystanders so the wave owns the sky
        } else {
          const dt = blastT - depth * BLAST_STAGGER
          if (dt > 0) {
            blastBoost = (depth === 0 ? 3.2 : 2.1) * Math.exp(-dt * 1.7)
          }
        }
      }

      // -- compose colour ---------------------------------------------------
      // Every orb emits light; significance is luminosity. Important files
      // drift toward pearl and cross the bloom threshold, minor ones glow
      // softly in their own hue.
      if (!inFocus) {
        tmpColor.copy(DIM)
      } else {
        if (colorMode === 'heat') {
          heatColor(node.heat ?? 0, tmpColor)
          tmpColor.multiplyScalar(0.6 + (node.heat ?? 0) * 1.7)
        } else {
          tmpColor.copy(languageColor(node.language))
          tmpColor.lerp(WHITE, node.significance * 0.3)
          tmpColor.multiplyScalar(0.8 + node.significance * 1.7)
        }
        if (hovered) {
          tmpColor.lerp(ACCENT, 0.5)
          tmpColor.multiplyScalar(1.6)
        }
        tmpColor.multiplyScalar(vis * (1 + flare * 1.4) * blastDim)
        if (blastBoost > 0) {
          tmpColor.lerp(WHITE, Math.min(1, blastBoost * 0.45))
          tmpColor.multiplyScalar(1 + blastBoost * 2)
        }
      }
      mesh.setColorAt(i, tmpColor)

      // -- compose scale ----------------------------------------------------
      const pulse = 1 + Math.sin(t * 1.1 + pulsePhases[i]) * 0.04
      const swell =
        (inFocus ? (hovered ? 1.18 : 1) : 0.62) *
        vis *
        (1 + flare * 0.35 + blastBoost * 0.45)
      // epsilon floor keeps the instance matrix invertible for the raycaster
      const r = Math.max(1e-4, node.radius * pulse * swell)
      tmpMatrix.makeScale(r, r, r)
      tmpMatrix.setPosition(node.x, node.y, node.z)
      mesh.setMatrixAt(i, tmpMatrix)

      // -- halo: the orb's light shed into the water around it -------------
      if (hovered) tmpColor.copy(ACCENT)
      else if (colorMode === 'heat') heatColor(node.heat ?? 0, tmpColor)
      else tmpColor.copy(languageColor(node.language))
      const haloLevel = !inFocus
        ? 0.004
        : (0.05 + node.significance * 0.11) *
          (hovered ? 2.5 : 1) *
          vis *
          (1 + flare * 1.2 + blastBoost * 2) *
          blastDim
      tmpColor.multiplyScalar(haloLevel)
      halo.colors[i * 3] = tmpColor.r
      halo.colors[i * 3 + 1] = tmpColor.g
      halo.colors[i * 3 + 2] = tmpColor.b
    }
    prevEra.current = era

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    if (haloColorRef.current) haloColorRef.current.needsUpdate = true
  })

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, layout.nodes.length]}
        material={starMaterial}
        onPointerOver={(e) => {
          e.stopPropagation()
          if (e.instanceId !== undefined) {
            onHover(layout.nodes[e.instanceId].id)
            hoverChime(layout.nodes[e.instanceId].significance)
            document.body.style.cursor = 'pointer'
          }
        }}
        onPointerOut={() => {
          onHover(null)
          document.body.style.cursor = 'auto'
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (e.instanceId !== undefined) onSelect(layout.nodes[e.instanceId].id)
        }}
      >
        <sphereGeometry args={[1, 24, 16]} />
      </instancedMesh>

      <points frustumCulled={false} material={haloMaterial} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[halo.positions, 3]} />
          <bufferAttribute attach="attributes-aSize" args={[halo.sizes, 1]} />
          <bufferAttribute ref={haloColorRef} attach="attributes-aColor" args={[halo.colors, 3]} />
        </bufferGeometry>
      </points>
    </>
  )
}
