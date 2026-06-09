import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { languageColor } from '../palette'
import type { Layout } from '../types'
import { createHaloMaterial, createStarMaterial } from './materials'

interface NodesProps {
  layout: Layout
  focusSet: Set<string> | null
  hoveredId: string | null
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}

const tmpMatrix = new THREE.Matrix4()
const tmpColor = new THREE.Color()
const DIM = new THREE.Color('#0e1322')

export function Nodes({ layout, focusSet, hoveredId, onHover, onSelect }: NodesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const haloColorRef = useRef<THREE.BufferAttribute>(null!)
  const starMaterial = useMemo(createStarMaterial, [])
  const haloMaterial = useMemo(createHaloMaterial, [])

  const pulsePhases = useMemo(
    () => layout.nodes.map((_, i) => (i * 0.61803) % (Math.PI * 2)),
    [layout],
  )
  // per-node scale multiplier (focus dimming shrinks, hover swells)
  const scaleFactor = useMemo(() => new Float32Array(layout.nodes.length).fill(1), [layout])

  const halo = useMemo(() => {
    const positions = new Float32Array(layout.nodes.length * 3)
    const sizes = new Float32Array(layout.nodes.length)
    for (const node of layout.nodes) {
      positions[node.index * 3] = node.x
      positions[node.index * 3 + 1] = node.y
      positions[node.index * 3 + 2] = node.z
      sizes[node.index] = node.radius * (6.5 + node.significance * 4)
    }
    return { positions, sizes, colors: new Float32Array(layout.nodes.length * 3) }
  }, [layout])

  // Base transforms once per layout.
  useEffect(() => {
    const mesh = meshRef.current
    for (const node of layout.nodes) {
      tmpMatrix.makeScale(node.radius, node.radius, node.radius)
      tmpMatrix.setPosition(node.x, node.y, node.z)
      mesh.setMatrixAt(node.index, tmpMatrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [layout])

  // Colours and scale react to focus/hover. HDR multipliers push bright stars
  // past the bloom threshold, so significance literally controls glow.
  useEffect(() => {
    const mesh = meshRef.current
    for (const node of layout.nodes) {
      const inFocus = !focusSet || focusSet.has(node.id)
      const hovered = node.id === hoveredId
      if (!inFocus) {
        tmpColor.copy(DIM)
        scaleFactor[node.index] = 0.62
      } else {
        tmpColor.copy(languageColor(node.language))
        tmpColor.multiplyScalar((0.75 + node.significance * 2.6) * (hovered ? 1.55 : 1))
        scaleFactor[node.index] = hovered ? 1.18 : 1
      }
      mesh.setColorAt(node.index, tmpColor)

      // halo follows the star but stays atmospheric
      tmpColor.copy(languageColor(node.language))
      tmpColor.multiplyScalar(
        !inFocus ? 0.004 : (0.045 + node.significance * 0.12) * (hovered ? 2 : 1),
      )
      halo.colors[node.index * 3] = tmpColor.r
      halo.colors[node.index * 3 + 1] = tmpColor.g
      halo.colors[node.index * 3 + 2] = tmpColor.b
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    if (haloColorRef.current) haloColorRef.current.needsUpdate = true
  }, [layout, focusSet, hoveredId, halo, scaleFactor])

  // Gentle breathing so the sky never feels frozen.
  useFrame(({ clock }) => {
    const mesh = meshRef.current
    const t = clock.elapsedTime
    for (const node of layout.nodes) {
      const pulse = 1 + Math.sin(t * 1.1 + pulsePhases[node.index]) * 0.045
      const r = node.radius * pulse * scaleFactor[node.index]
      tmpMatrix.makeScale(r, r, r)
      tmpMatrix.setPosition(node.x, node.y, node.z)
      mesh.setMatrixAt(node.index, tmpMatrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, layout.nodes.length]}
        material={starMaterial}
        onPointerOver={(e) => {
          e.stopPropagation()
          if (e.instanceId !== undefined) {
            onHover(layout.nodes[e.instanceId].id)
            document.body.style.cursor = 'pointer'
          }
        }}
        onPointerOut={() => {
          onHover(null)
          document.body.style.cursor = 'auto'
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (e.instanceId !== undefined) onSelect(layout.nodes[e.instanceId].id)
        }}
      >
        <sphereGeometry args={[1, 24, 16]} />
      </instancedMesh>

      <points frustumCulled={false} material={haloMaterial} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[halo.positions, 3]} />
          <bufferAttribute attach="attributes-aSize" args={[halo.sizes, 1]} />
          <bufferAttribute ref={haloColorRef} attach="attributes-aColor" args={[halo.colors, 3]} />
        </bufferGeometry>
      </points>
    </>
  )
}
