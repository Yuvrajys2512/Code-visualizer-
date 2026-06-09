export interface GraphNode {
  id: string
  name: string
  dir: string
  loc: number
  language: string
  significance: number
  /** graph archetype: entry point, core hub, bridge, orchestrator, … */
  role?: string
  /** mined from docstrings / leading comments / exported symbols */
  description?: string
}

export interface GraphEdge {
  source: string
  target: string
  type: string
}

export interface Cluster {
  dir: string
  label: string
  kind: string
  description: string
  count: number
  language: string
  anchor: string
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  clusters?: Cluster[]
}

/** A node after the force layout has settled. */
export interface PositionedNode extends GraphNode {
  x: number
  y: number
  z: number
  radius: number
  /** index into the instanced mesh */
  index: number
}

/** A cluster anchored at the centroid of its member stars. */
export interface PositionedCluster extends Cluster {
  x: number
  y: number
  z: number
  /** spread of members around the centroid, for camera framing */
  radius: number
}

export interface Layout {
  nodes: PositionedNode[]
  edges: GraphEdge[]
  clusters: PositionedCluster[]
  byId: Map<string, PositionedNode>
  /** undirected neighbourhood, for focus highlighting */
  neighbours: Map<string, Set<string>>
  inDegree: Map<string, number>
  outDegree: Map<string, number>
}
