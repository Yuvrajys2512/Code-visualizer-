export interface GraphNode {
  id: string
  name: string
  dir: string
  loc: number
  language: string
  significance: number
}

export interface GraphEdge {
  source: string
  target: string
  type: string
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
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

export interface Layout {
  nodes: PositionedNode[]
  edges: GraphEdge[]
  byId: Map<string, PositionedNode>
  /** undirected neighbourhood, for focus highlighting */
  neighbours: Map<string, Set<string>>
  inDegree: Map<string, number>
  outDegree: Map<string, number>
}
