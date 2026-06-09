import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useState } from 'react'
import { ingestRepo, loadSampleGraph } from './api'
import { runLayout } from './layout'
import { Constellation } from './scene/Constellation'
import type { Graph, Layout } from './types'
import { Overlay, type Status } from './ui/Overlay'

export default function App() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [layout, setLayout] = useState<Layout | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const buildSky = useCallback(async (loader: () => Promise<Graph>) => {
    setStatus({ kind: 'ingesting' })
    setSelectedId(null)
    setHoveredId(null)
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
  }, [])

  const handleIngest = useCallback(
    (url: string) => void buildSky(() => ingestRepo(url)),
    [buildSky],
  )

  // ?demo loads a bundled graph — instant constellation, no backend needed.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('demo')) {
      void buildSky(loadSampleGraph)
    }
  }, [buildSky])

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
            onHover={setHoveredId}
            onSelect={setSelectedId}
          />
        )}
      </Canvas>
      <Overlay
        status={status}
        layout={layout}
        selectedId={selectedId}
        hoveredId={hoveredId}
        onIngest={handleIngest}
      />
    </div>
  )
}
