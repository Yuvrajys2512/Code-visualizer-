import type { Graph } from './types'

export async function ingestRepo(repoUrl: string): Promise<Graph> {
  const res = await fetch('/api/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_url: repoUrl }),
  })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body.detail) detail = String(body.detail)
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail)
  }
  return res.json()
}

export async function loadSampleGraph(): Promise<Graph> {
  const res = await fetch('/sample-graph.json')
  if (!res.ok) throw new Error('sample graph not found')
  return res.json()
}

/** A famous repo, pre-analyzed and bundled — the wow with zero waiting. */
export interface GalleryEntry {
  name: string
  repo: string
  file: string
  blurb: string
}

export async function loadGalleryIndex(): Promise<GalleryEntry[]> {
  try {
    const res = await fetch('/gallery/index.json')
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export async function loadGalleryGraph(file: string): Promise<Graph> {
  const res = await fetch(`/gallery/${file}`)
  if (!res.ok) throw new Error('gallery graph not found')
  return res.json()
}
