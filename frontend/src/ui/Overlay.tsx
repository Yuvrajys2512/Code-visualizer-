import { useEffect, useMemo, useState } from 'react'
import { type GalleryEntry, loadGalleryIndex } from '../api'
import { isMuted, setMuted } from '../audio'
import { type ColorMode, heatColorHex, type TimelineState } from '../effects'
import { languageColorHex } from '../palette'
import type { Layout } from '../types'
import { TimelineBar } from './TimelineBar'

export type Status =
  | { kind: 'idle' }
  | { kind: 'ingesting' }
  | { kind: 'layout'; progress: number }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }

export interface BlastInfo {
  originId: string
  affected: number
  share: number
}

interface OverlayProps {
  status: Status
  layout: Layout | null
  selectedId: string | null
  hoveredId: string | null
  colorMode: ColorMode
  timeline: TimelineState
  timelineOn: boolean
  blastInfo: BlastInfo | null
  onIngest: (url: string) => void
  onGallery: (file: string) => void
  onColorMode: (mode: ColorMode) => void
  onTimelineOn: (on: boolean) => void
  onBlast: () => void
  onFlyToCluster: (dir: string) => void
}

export function Overlay({
  status,
  layout,
  selectedId,
  hoveredId,
  colorMode,
  timeline,
  timelineOn,
  blastInfo,
  onIngest,
  onGallery,
  onColorMode,
  onTimelineOn,
  onBlast,
  onFlyToCluster,
}: OverlayProps) {
  const [url, setUrl] = useState('https://github.com/fastapi/full-stack-fastapi-template')
  const [gallery, setGallery] = useState<GalleryEntry[]>([])
  const [muted, setMutedState] = useState(isMuted)
  const busy = status.kind === 'ingesting' || status.kind === 'layout'

  useEffect(() => {
    void loadGalleryIndex().then(setGallery)
  }, [])

  const languages = useMemo(() => {
    if (!layout) return []
    const counts = new Map<string, number>()
    for (const n of layout.nodes) counts.set(n.language, (counts.get(n.language) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [layout])

  const hasHeat = useMemo(
    () => !!layout && layout.nodes.some((n) => n.heat !== undefined),
    [layout],
  )

  const inspected = useMemo(() => {
    const id = hoveredId ?? selectedId
    return id && layout ? layout.byId.get(id) ?? null : null
  }, [layout, hoveredId, selectedId])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  return (
    <div className="overlay">
      <div className="panel header">
        <h1>constellation</h1>
        <p className="tagline">a repository, as a night sky</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy && url.trim()) onIngest(url.trim())
          }}
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            spellCheck={false}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !url.trim()}>
            {busy ? 'forming…' : 'visualise'}
          </button>
        </form>
        {status.kind === 'error' && <p className="error">{status.message}</p>}
        {layout && status.kind === 'ready' && (
          <>
            <p className="stats">
              {layout.nodes.length} files · {layout.edges.length} imports
              {layout.history && <> · {layout.history.commits.toLocaleString()} commits</>}
            </p>
            {hasHeat && (
              <div className="mode-toggle">
                <button
                  className={colorMode === 'language' ? 'on' : ''}
                  onClick={() => onColorMode('language')}
                >
                  spectral
                </button>
                <button
                  className={colorMode === 'heat' ? 'on' : ''}
                  onClick={() => onColorMode('heat')}
                  title="recently-edited files burn bright; untouched code cools"
                >
                  activity
                </button>
              </div>
            )}
            {colorMode === 'language' ? (
              <div className="legend">
                {languages.map(([lang, count]) => (
                  <span key={lang} className="chip">
                    <i style={{ background: languageColorHex(lang) }} />
                    {lang} <em>{count}</em>
                  </span>
                ))}
              </div>
            ) : (
              <div className="legend">
                <span className="chip">
                  <i style={{ background: heatColorHex(0.05) }} /> dormant
                </span>
                <span className="chip">
                  <i style={{ background: heatColorHex(0.6) }} /> active
                </span>
                <span className="chip">
                  <i style={{ background: heatColorHex(1) }} /> burning
                </span>
              </div>
            )}
            <p className="hint">drag to orbit · scroll to dive · click a star to focus · click the void to release</p>
          </>
        )}
      </div>

      <button className="panel sound-toggle" onClick={toggleMute} title={muted ? 'unmute' : 'mute'}>
        {muted ? '🔇' : '🔊'}
      </button>

      {layout && status.kind === 'ready' && layout.clusters.length > 0 && (
        <div className="panel atlas">
          <p className="atlas-title">constellations</p>
          {layout.clusters.map((cluster) => (
            <button
              key={cluster.dir}
              className="atlas-row"
              title={cluster.description}
              onClick={() => onFlyToCluster(cluster.dir)}
            >
              <i style={{ background: languageColorHex(cluster.language) }} />
              <span className="atlas-label">{cluster.label}</span>
              {cluster.kind && <span className="atlas-kind">{cluster.kind}</span>}
              <em>{cluster.count}</em>
            </button>
          ))}
        </div>
      )}

      {layout?.history && status.kind === 'ready' && (
        <TimelineBar
          span={layout.history}
          timeline={timeline}
          timelineOn={timelineOn}
          onTimelineOn={onTimelineOn}
        />
      )}

      {inspected && (
        <div className="panel inspector">
          <div className="inspector-title">
            <i style={{ background: languageColorHex(inspected.language) }} />
            <strong>{inspected.name}</strong>
          </div>
          {inspected.dir && <p className="path">{inspected.dir}/</p>}
          {inspected.role && inspected.role !== 'module' && (
            <span className={`role role-${inspected.role.replace(/\s+/g, '-')}`}>
              {inspected.role}
            </span>
          )}
          {inspected.description && <p className="desc">{inspected.description}</p>}
          <div className="facts">
            <span>{inspected.language}</span>
            <span>{inspected.loc} loc</span>
            <span>{layout!.inDegree.get(inspected.id)} imported by</span>
            <span>{layout!.outDegree.get(inspected.id)} imports</span>
            {inspected.born && (
              <span>
                born {new Date(inspected.born * 1000).toLocaleDateString(undefined, {
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            )}
          </div>
          <div className="sig-bar">
            <div
              className="sig-fill"
              style={{
                width: `${Math.round(inspected.significance * 100)}%`,
                background: languageColorHex(inspected.language),
              }}
            />
          </div>
          <p className="sig-caption">significance {inspected.significance.toFixed(2)}</p>
          {selectedId === inspected.id && (
            <>
              <button className="blast-btn" onClick={onBlast}>
                ◉ detonate — show blast radius
              </button>
              {blastInfo && blastInfo.originId === inspected.id && (
                <p className="blast-result">
                  a change here ripples through <strong>{blastInfo.affected}</strong>{' '}
                  {blastInfo.affected === 1 ? 'file' : 'files'} —{' '}
                  {Math.round(blastInfo.share * 100)}% of the sky
                </p>
              )}
            </>
          )}
        </div>
      )}

      {busy && (
        <div className="veil">
          <div className="pulse" />
          <p>
            {status.kind === 'ingesting'
              ? 'cloning & reading the repository…'
              : `forming constellation… ${Math.round((status as { progress: number }).progress * 100)}%`}
          </p>
        </div>
      )}

      {status.kind === 'idle' && (
        <div className="veil idle">
          <p>point it at a repository and watch the architecture appear</p>
          {gallery.length > 0 && (
            <div className="gallery">
              <span className="gallery-title">or step into a famous sky</span>
              <div className="gallery-row">
                {gallery.map((entry) => (
                  <button
                    key={entry.file}
                    className="gallery-card"
                    title={entry.blurb}
                    onClick={() => onGallery(entry.file)}
                  >
                    {entry.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
