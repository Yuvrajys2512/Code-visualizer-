declare module 'd3-force-3d' {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export function forceSimulation(nodes?: any[], numDimensions?: number): any
  export function forceLink(links?: any[]): any
  export function forceManyBody(): any
  export function forceCenter(x?: number, y?: number, z?: number): any
  export function forceCollide(radius?: any): any
  export function forceX(x?: any): any
  export function forceY(y?: any): any
  export function forceZ(z?: any): any
  export function forceRadial(radius?: any, x?: number, y?: number, z?: number): any
}
