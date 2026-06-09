import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from 'd3-force-3d'
import type { Graph, GraphEdge, Layout, PositionedNode } from './types'

const WORLD_RADIUS = 120

interface SimNode extends PositionedNode {
  vx?: number
  vy?: number
  vz?: number
}

function topDir(dir: string): string {
  return dir.split('/')[0] ?? ''
}

/**
 * Weak gravity toward the centroid of each cluster key. Combined with link
 * forces this is what makes folders condense into legible constellations
 * instead of one undifferentiated ball.
 */
function clusterForce(keyOf: (n: SimNode) => string, strength: number) {
  let nodes: SimNode[] = []
  const force = (alpha: number) => {
    const sums = new Map<string, { x: number; y: number; z: number; n: number }>()
    for (const node of nodes) {
      const key = keyOf(node)
      let s = sums.get(key)
      if (!s) sums.set(key, (s = { x: 0, y: 0, z: 0, n: 0 }))
      s.x += node.x
      s.y += node.y
      s.z += node.z
      s.n += 1
    }
    const k = strength * alpha
    for (const node of nodes) {
      const s = sums.get(keyOf(node))!
      if (s.n < 2) continue
      node.vx! += (s.x / s.n - node.x) * k
      node.vy! += (s.y / s.n - node.y) * k
      node.vz! += (s.z / s.n - node.z) * k
    }
  }
  force.initialize = (n: SimNode[]) => {
    nodes = n
  }
  return force
}

/** Deterministic seed positions: each top-level dir starts in its own sky sector. */
function seedPositions(nodes: SimNode[]) {
  const clusters = [...new Set(nodes.map((n) => topDir(n.dir)))].sort()
  const golden = Math.PI * (3 - Math.sqrt(5))
  const anchor = new Map<string, [number, number, number]>()
  clusters.forEach((key, i) => {
    const y = clusters.length === 1 ? 0 : 1 - (2 * i) / (clusters.length - 1)
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    anchor.set(key, [Math.cos(theta) * r, y, Math.sin(theta) * r])
  })
  let rand = 1234567
  const next = () => {
    // deterministic LCG so the same repo always forms the same sky
    rand = (rand * 1103515245 + 12345) % 2147483648
    return rand / 2147483648 - 0.5
  }
  for (const node of nodes) {
    const [ax, ay, az] = anchor.get(topDir(node.dir))!
    node.x = ax * 70 + next() * 50
    node.y = ay * 70 + next() * 50
    node.z = az * 70 + next() * 50
  }
}

export async function runLayout(
  graph: Graph,
  onProgress?: (fraction: number) => void,
): Promise<Layout> {
  const nodes: SimNode[] = graph.nodes.map((n, index) => ({
    ...n,
    index,
    x: 0,
    y: 0,
    z: 0,
    radius: 1.1 + n.significance * 4.2,
  }))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const edges = graph.edges.filter((e) => byId.has(e.source) && byId.has(e.target))
  seedPositions(nodes)

  const links = edges.map((e) => ({ source: e.source, target: e.target }))
  const sameDir = (l: { source: string; target: string }) => {
    const a = byId.get(l.source)!
    const b = byId.get(l.target)!
    return a.dir === b.dir ? 2 : topDir(a.dir) === topDir(b.dir) ? 1 : 0
  }
  const linkDepth = links.map(sameDir)

  const simulation = forceSimulation(nodes, 3)
    .force(
      'link',
      forceLink(links)
        .id((d: SimNode) => d.id)
        .distance((_l: unknown, i: number) => [70, 38, 20][linkDepth[i]])
        .strength((_l: unknown, i: number) => [0.12, 0.3, 0.5][linkDepth[i]]),
    )
    .force('charge', forceManyBody().strength(-60).distanceMax(160))
    .force('collide', forceCollide((n: SimNode) => n.radius + 2.5).iterations(2))
    .force('dir', clusterForce((n) => n.dir, 0.14))
    .force('topdir', clusterForce((n) => topDir(n.dir), 0.05))
    .stop()

  const TICKS = 320
  const CHUNK = 16
  for (let i = 0; i < TICKS; i += CHUNK) {
    for (let j = 0; j < CHUNK; j += 1) simulation.tick()
    onProgress?.(Math.min(1, (i + CHUNK) / TICKS))
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  // Normalise so every repo, large or small, fills the same volume.
  let maxDist = 1
  for (const n of nodes) {
    maxDist = Math.max(maxDist, Math.hypot(n.x, n.y, n.z))
  }
  const scale = WORLD_RADIUS / maxDist
  for (const n of nodes) {
    n.x *= scale
    n.y *= scale
    n.z *= scale
  }

  const neighbours = new Map<string, Set<string>>()
  const inDegree = new Map<string, number>()
  const outDegree = new Map<string, number>()
  for (const n of nodes) {
    neighbours.set(n.id, new Set())
    inDegree.set(n.id, 0)
    outDegree.set(n.id, 0)
  }
  const cleanEdges: GraphEdge[] = edges.map((e) => ({ ...e }))
  for (const e of cleanEdges) {
    neighbours.get(e.source)!.add(e.target)
    neighbours.get(e.target)!.add(e.source)
    outDegree.set(e.source, outDegree.get(e.source)! + 1)
    inDegree.set(e.target, inDegree.get(e.target)! + 1)
  }

  const positioned: PositionedNode[] = nodes.map((n) => {
    const { vx: _vx, vy: _vy, vz: _vz, ...rest } = n
    return rest
  })
  return {
    nodes: positioned,
    edges: cleanEdges,
    byId: new Map(positioned.map((n) => [n.id, n])),
    neighbours,
    inDegree,
    outDegree,
  }
}
