import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ingestRepo, loadGalleryGraph, loadSampleGraph } from './api'
import { supernovaRumble, wake } from './audio'
import { type BlastState, type ColorMode, computeBlast, type TimelineState } from './effects'
import { runLayout } from './layout'
import { Constellation } from './scene/Constellation'
import type { Graph, Layout } from './types'
import { Overlay, type BlastInfo, type Status } from './ui/Overlay'

export default function App() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [layout, setLayout] = useState<Layout | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [flyToCluster, setFlyToCluster] = useState<{ dir: string; seq: number } | null>(null)
  const [colorMode, setColorMode] = useState<ColorMode>('language')
  const [timelineOn, setTimelineOn] = useState(false)
  const [blastInfo, setBlastInfo] = useState<BlastInfo | null>(null)

  // Mutable per-frame state shared with the render loop — deliberately not
  // React state, so playback and shockwaves never re-render the tree.
  const timeline = useRef<TimelineState>({ era: null, playing: false, speed: 1 }).current
  const blastBox = useRef<{ state: BlastState | null }>({ state: null }).current

  // The audio context may only start on a user gesture.
  useEffect(() => {
    const onFirstGesture = () => wake()
    window.addEventListener('pointerdown', onFirstGesture, { once: true })
    return () => window.removeEventListener('pointerdown', onFirstGesture)
  }, [])

  const buildSky = useCallback(
    async (loader: () => Promise<Graph>) => {
      setStatus({ kind: 'ingesting' })
      setSelectedId(null)
      setHoveredId(null)
      setFlyToCluster(null)
      setBlastInfo(null)
      setTimelineOn(false)
      timeline.era = null
      timeline.playing = false
      blastBox.state = null
      try {
        const graph = await loader()
        setStatus({ kind: 'layout', progress: 0 })
        const result = await runLayout(graph, (progress) =>
          setStatus({ kind: 'layout', progress }),
        )
        setLayout(result)
        setStatus({ kind: 'ready' })
      } catch (err) {
        setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    },
    [timeline, blastBox],
  )

  const handleIngest = useCallback(
    (url: string) => void buildSky(() => ingestRepo(url)),
    [buildSky],
  )

  const handleGallery = useCallback(
    (file: string) => void buildSky(() => loadGalleryGraph(file)),
    [buildSky],
  )

  // Deep links, no backend needed: ?demo loads the bundled sample graph,
  // ?sky=flask opens a gallery sky directly (shareable).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sky = params.get('sky')
    if (sky && /^[\w-]+$/.test(sky)) {
      void buildSky(() => loadGalleryGraph(`${sky}.json`))
    } else if (params.has('demo')) {
      void buildSky(loadSampleGraph)
    }
  }, [buildSky])

  const triggerBlast = useCallback(() => {
    if (!layout || !selectedId) return
    const blast = computeBlast(layout, selectedId)
    blastBox.state = blast
    const affected = blast.depths.size - 1
    supernovaRumble(affected / Math.max(1, layout.nodes.length))
    setBlastInfo({
      originId: selectedId,
      affected,
      share: affected / Math.max(1, layout.nodes.length - 1),
    })
  }, [layout, selectedId, blastBox])

  return (
    <div className="app">
      <Canvas
        camera={{ position: [0, 55, 195], fov: 55, near: 0.5, far: 1200 }}
        dpr={[1, 2]}
        gl={{ antialias: false }}
      >
        {layout && (
          <Constellation
            layout={layout}
            selectedId={selectedId}
            hoveredId={hoveredId}
            flyToCluster={flyToCluster}
            colorMode={colorMode}
            timeline={timeline}
            blastBox={blastBox}
            timelineOn={timelineOn}
            onHover={setHoveredId}
            onSelect={(id) => {
              setSelectedId(id)
              setBlastInfo(null)
              if (id) setFlyToCluster(null)
            }}
          />
        )}
      </Canvas>
      <Overlay
        status={status}
        layout={layout}
        selectedId={selectedId}
        hoveredId={hoveredId}
        colorMode={colorMode}
        timeline={timeline}
        timelineOn={timelineOn}
        blastInfo={blastInfo}
        onIngest={handleIngest}
        onGallery={handleGallery}
        onColorMode={setColorMode}
        onTimelineOn={setTimelineOn}
        onBlast={triggerBlast}
        onFlyToCluster={(dir) => {
          setSelectedId(null)
          setFlyToCluster((prev) => ({ dir, seq: (prev?.seq ?? 0) + 1 }))
        }}
      />
    </div>
  )
}
