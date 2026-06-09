import { OrbitControls, Stars } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useMemo, useRef } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { VOID_COLOR } from '../palette'
import type { Layout } from '../types'
import { buildCurves } from './curves'
import { Edges } from './Edges'
import { FocusController } from './FocusController'
import { Labels } from './Labels'
import { Nodes } from './Nodes'
import { Particles } from './Particles'

interface ConstellationProps {
  layout: Layout
  selectedId: string | null
  hoveredId: string | null
  onHover: (id: string | null) => void
  onSelect: (id: string | null) => void
}

export function Constellation({
  layout,
  selectedId,
  hoveredId,
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

  return (
    <>
      <color attach="background" args={[VOID_COLOR]} />
      <fog attach="fog" args={[VOID_COLOR, 220, 520]} />
      <Stars radius={320} depth={60} count={1700} factor={2.4} saturation={0.1} fade speed={0.4} />

      <group onPointerMissed={() => onSelect(null)}>
        <Nodes
          layout={layout}
          focusSet={focusSet}
          hoveredId={hoveredId}
          onHover={onHover}
          onSelect={onSelect}
        />
        <Edges layout={layout} curves={curves} focusSet={focusSet} />
        <Particles layout={layout} curves={curves} focusSet={focusSet} />
        <Labels layout={layout} focusSet={focusSet} selectedId={selectedId} />
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
      <FocusController controlsRef={controlsRef} layout={layout} selectedId={selectedId} />

      {/* ?nofx escape hatch: software GL (headless/CI, ancient GPUs) can't do
          the composer's float render targets and would show a black void. */}
      {!new URLSearchParams(window.location.search).has('nofx') && (
        <EffectComposer>
          <Bloom mipmapBlur intensity={1.25} luminanceThreshold={0.18} luminanceSmoothing={0.32} radius={0.72} />
          <Vignette offset={0.22} darkness={0.82} />
        </EffectComposer>
      )}
    </>
  )
}
