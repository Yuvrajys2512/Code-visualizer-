import { OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import {
  type BlastState,
  type ColorMode,
  SWEEP_SECONDS,
  type TimelineState,
} from '../effects'
import { VOID_COLOR } from '../palette'
import type { Layout } from '../types'
import { Abyss } from './Abyss'
import { ClusterLabels } from './ClusterLabels'
import { buildCurves } from './curves'
import { Edges } from './Edges'
import { FocusController, type CameraGoal } from './FocusController'
import { Labels } from './Labels'
import { Nodes } from './Nodes'
import { Particles } from './Particles'
import { Shockwave } from './Shockwave'

interface ConstellationProps {
  layout: Layout
  selectedId: string | null
  hoveredId: string | null
  /** dir of a cluster to fly to, with a sequence number to re-trigger */
  flyToCluster: { dir: string; seq: number } | null
  colorMode: ColorMode
  timeline: TimelineState
  blastBox: { state: BlastState | null }
  /** coarse flag from the UI: time-lapse engaged, hide the text layer */
  timelineOn: boolean
  onHover: (id: string | null) => void
  onSelect: (id: string | null) => void
}

/** Advances the time-lapse era while playback is on. */
function TimelineDriver({ layout, timeline }: { layout: Layout; timeline: TimelineState }) {
  useFrame((_, delta) => {
    const span = layout.history
    if (!span || !timeline.playing || timeline.era === null) return
    const rate = ((span.end - span.start) / SWEEP_SECONDS) * timeline.speed
    timeline.era = Math.min(span.end, timeline.era + delta * rate)
    if (timeline.era >= span.end) timeline.playing = false
  })
  return null
}

export function Constellation({
  layout,
  selectedId,
  hoveredId,
  flyToCluster,
  colorMode,
  timeline,
  blastBox,
  timelineOn,
  onHover,
  onSelect,
}: ConstellationProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const curves = useMemo(() => buildCurves(layout), [layout])

  // Selected star + everything one import away; null = nothing focused.
  const focusSet = useMemo(() => {
    if (!selectedId) return null
    const set = new Set<string>([selectedId])
    for (const n of layout.neighbours.get(selectedId) ?? []) set.add(n)
    return set
  }, [layout, selectedId])

  const goal = useMemo<CameraGoal | null>(() => {
    if (selectedId) {
      const node = layout.byId.get(selectedId)
      if (!node) return null
      return {
        key: `node:${selectedId}`,
        x: node.x,
        y: node.y,
        z: node.z,
        distance: Math.max(26, node.radius * 11),
      }
    }
    if (flyToCluster) {
      const cluster = layout.clusters.find((c) => c.dir === flyToCluster.dir)
      if (!cluster) return null
      return {
        key: `cluster:${flyToCluster.dir}:${flyToCluster.seq}`,
        x: cluster.x,
        y: cluster.y,
        z: cluster.z,
        distance: Math.min(220, Math.max(45, cluster.radius * 2.6)),
      }
    }
    return null
  }, [layout, selectedId, flyToCluster])

  return (
    <>
      <color attach="background" args={[VOID_COLOR]} />
      <fog attach="fog" args={[VOID_COLOR, 210, 500]} />
      <Abyss />
      <TimelineDriver layout={layout} timeline={timeline} />

      <group onPointerMissed={() => onSelect(null)}>
        <Nodes
          layout={layout}
          focusSet={focusSet}
          hoveredId={hoveredId}
          colorMode={colorMode}
          timeline={timeline}
          blastBox={blastBox}
          onHover={onHover}
          onSelect={onSelect}
        />
        <Edges
          layout={layout}
          curves={curves}
          focusSet={focusSet}
          colorMode={colorMode}
          timeline={timeline}
          blastBox={blastBox}
        />
        <Particles
          layout={layout}
          curves={curves}
          focusSet={focusSet}
          colorMode={colorMode}
          timeline={timeline}
        />
        <Shockwave layout={layout} blastBox={blastBox} />
        {/* the text layer reads as "now" — silence it while time travels */}
        {!timelineOn && (
          <>
            <Labels layout={layout} focusSet={focusSet} selectedId={selectedId} />
            <ClusterLabels layout={layout} focusSet={focusSet} />
          </>
        )}
      </group>

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.06}
        autoRotate
        autoRotateSpeed={0.35}
        minDistance={18}
        maxDistance={420}
      />
      <FocusController controlsRef={controlsRef} goal={goal} />

      {/* ?nofx escape hatch: software GL (headless/CI, ancient GPUs) can't do
          the composer's float render targets and would show a black void. */}
      {!new URLSearchParams(window.location.search).has('nofx') && (
        <EffectComposer>
          {/* soft bioluminescent bloom: bright orbs shine, dim ones just glow */}
          <Bloom mipmapBlur intensity={0.95} luminanceThreshold={0.32} luminanceSmoothing={0.3} radius={0.72} />
          <Vignette offset={0.24} darkness={0.72} />
        </EffectComposer>
      )}
    </>
  )
}
