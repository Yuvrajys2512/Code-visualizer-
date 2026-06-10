import * as THREE from 'three'
import type { Layout } from './types'

/**
 * Mutable state shared between the overlay UI and the render loop. The scene
 * reads these objects inside useFrame every frame; React state would force a
 * 60 fps re-render of the whole tree, so the UI mutates them in place instead
 * and polls coarsely for its own readouts.
 */

export interface TimelineState {
  /** unix seconds currently shown; null = present day (time-lapse off) */
  era: number | null
  playing: boolean
  /** playback rate as a multiple of the base sweep (full history in ~45 s) */
  speed: number
}

/** Full history sweep duration at speed 1, in real seconds. */
export const SWEEP_SECONDS = 45
/** Star ignition / edit-flare windows, as fractions of the history span. */
export const IGNITE_WINDOW = 0.008
export const FLARE_WINDOW = 0.006

export interface BlastState {
  originId: string
  /** hop distance through reverse imports; 0 = the exploding star */
  depths: Map<string, number>
  maxDepth: number
  /** scene clock seconds when the wave launched; <0 until the first frame */
  startedAt: number
}

/** Seconds between successive dependency rings catching the shockwave. */
export const BLAST_STAGGER = 0.42
/** Seconds of afterglow once the last ring has flashed. */
export const BLAST_TAIL = 2.6

/**
 * Everything that (transitively) imports the origin — the set of files that
 * would feel a change to it, staged by hop distance for the wave animation.
 */
export function computeBlast(layout: Layout, originId: string): BlastState {
  const importers = new Map<string, string[]>()
  for (const e of layout.edges) {
    let list = importers.get(e.target)
    if (!list) importers.set(e.target, (list = []))
    list.push(e.source)
  }
  const depths = new Map<string, number>([[originId, 0]])
  let frontier = [originId]
  let depth = 0
  while (frontier.length > 0) {
    depth += 1
    const next: string[] = []
    for (const id of frontier) {
      for (const dep of importers.get(id) ?? []) {
        if (!depths.has(dep)) {
          depths.set(dep, depth)
          next.push(dep)
        }
      }
    }
    frontier = next
  }
  return { originId, depths, maxDepth: depth - 1, startedAt: -1 }
}

export function smoothstep01(x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  return x * x * (3 - 2 * x)
}

// ---------------------------------------------------------------------------
// Churn heat palette: cold abyssal blue -> aqua -> pearl. Activity is how
// brightly a file bioluminesces; dormant code sinks into the dark.
// ---------------------------------------------------------------------------

const HEAT_STOPS: [number, THREE.Color][] = [
  [0.0, new THREE.Color('#1d3442')],
  [0.4, new THREE.Color('#1f7d83')],
  [0.75, new THREE.Color('#4dd6c1')],
  [1.0, new THREE.Color('#eafff8')],
]

export function heatColor(heat: number, out: THREE.Color): THREE.Color {
  const h = Math.max(0, Math.min(1, heat))
  for (let i = 1; i < HEAT_STOPS.length; i += 1) {
    const [t1, c1] = HEAT_STOPS[i]
    if (h <= t1) {
      const [t0, c0] = HEAT_STOPS[i - 1]
      return out.copy(c0).lerp(c1, (h - t0) / (t1 - t0))
    }
  }
  return out.copy(HEAT_STOPS[HEAT_STOPS.length - 1][1])
}

export function heatColorHex(heat: number): string {
  const c = new THREE.Color()
  heatColor(heat, c)
  return `#${c.getHexString()}`
}

export type ColorMode = 'language' | 'heat'
