import { useMemo, useState } from 'react'
import { languageColorHex } from '../palette'
import type { Layout } from '../types'

export type Status =
  | { kind: 'idle' }
  | { kind: 'ingesting' }
  | { kind: 'layout'; progress: number }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }

interface OverlayProps {
  status: Status
  layout: Layout | null
  selectedId: string | null
  hoveredId: string | null
  onIngest: (url: string) => void
}

export function Overlay({ status, layout, selectedId, hoveredId, onIngest }: OverlayProps) {
  const [url, setUrl] = useState('https://github.com/fastapi/full-stack-fastapi-template')
  const busy = status.kind === 'ingesting' || status.kind === 'layout'

  const languages = useMemo(() => {
    if (!layout) return []
    const counts = new Map<string, number>()
    for (const n of layout.nodes) counts.set(n.language, (counts.get(n.language) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [layout])

  const inspected = useMemo(() => {
    const id = hoveredId ?? selectedId
    return id && layout ? layout.byId.get(id) ?? null : null
  }, [layout, hoveredId, selectedId])

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
            </p>
            <div className="legend">
              {languages.map(([lang, count]) => (
                <span key={lang} className="chip">
                  <i style={{ background: languageColorHex(lang) }} />
                  {lang} <em>{count}</em>
                </span>
              ))}
            </div>
            <p className="hint">drag to orbit · scroll to dive · click a star to focus · click the void to release</p>
          </>
        )}
      </div>

      {inspected && (
        <div className="panel inspector">
          <div className="inspector-title">
            <i style={{ background: languageColorHex(inspected.language) }} />
            <strong>{inspected.name}</strong>
          </div>
          {inspected.dir && <p className="path">{inspected.dir}/</p>}
          <div className="facts">
            <span>{inspected.language}</span>
            <span>{inspected.loc} loc</span>
            <span>{layout!.inDegree.get(inspected.id)} imported by</span>
            <span>{layout!.outDegree.get(inspected.id)} imports</span>
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
        </div>
      )}
    </div>
  )
}
