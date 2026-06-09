import * as THREE from 'three'
import type { Layout } from '../types'

export const CURVE_SEGMENTS = 22

export interface CurveSet {
  /** sampled points, stride (CURVE_SEGMENTS + 1) * 3, one block per edge */
  points: Float32Array
  edgeCount: number
}

/**
 * Every import edge becomes a quadratic curve whose midpoint bows away from
 * the constellation's centre — edges arc over the void instead of slicing
 * through clusters, which is most of why the final render reads as a sky.
 */
export function buildCurves(layout: Layout): CurveSet {
  const stride = (CURVE_SEGMENTS + 1) * 3
  const points = new Float32Array(layout.edges.length * stride)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const mid = new THREE.Vector3()
  const lift = new THREE.Vector3()

  layout.edges.forEach((edge, e) => {
    const s = layout.byId.get(edge.source)!
    const t = layout.byId.get(edge.target)!
    a.set(s.x, s.y, s.z)
    b.set(t.x, t.y, t.z)
    mid.addVectors(a, b).multiplyScalar(0.5)
    const span = a.distanceTo(b)
    lift.copy(mid)
    if (lift.lengthSq() < 1) lift.set(0, 1, 0)
    lift.normalize().multiplyScalar(span * 0.22 + 1.5)
    mid.add(lift)

    const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid.clone(), b.clone())
    const sampled = curve.getPoints(CURVE_SEGMENTS)
    for (let i = 0; i <= CURVE_SEGMENTS; i += 1) {
      const o = e * stride + i * 3
      points[o] = sampled[i].x
      points[o + 1] = sampled[i].y
      points[o + 2] = sampled[i].z
    }
  })

  return { points, edgeCount: layout.edges.length }
}

export function makeGlowTexture(): THREE.Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
