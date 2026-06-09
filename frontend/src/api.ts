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
