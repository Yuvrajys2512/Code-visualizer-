import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { languageColor } from '../palette'
import type { Layout } from '../types'

interface NodesProps {
  layout: Layout
  focusSet: Set<string> | null
  hoveredId: string | null
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}

const tmpMatrix = new THREE.Matrix4()
const tmpColor = new THREE.Color()
const DIM = new THREE.Color('#1c2030')

export function Nodes({ layout, focusSet, hoveredId, onHover, onSelect }: NodesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const pulsePhases = useMemo(
    () => layout.nodes.map((_, i) => (i * 0.61803) % (Math.PI * 2)),
    [layout],
  )

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

  // Colours react to focus/hover. HDR multipliers push bright nodes past the
  // bloom threshold, so significance literally controls how hard a star glows.
  useEffect(() => {
    const mesh = meshRef.current
    for (const node of layout.nodes) {
      const inFocus = !focusSet || focusSet.has(node.id)
      if (!inFocus) {
        tmpColor.copy(DIM)
      } else {
        tmpColor.copy(languageColor(node.language))
        tmpColor.multiplyScalar(0.75 + node.significance * 2.6)
        if (node.id === hoveredId) tmpColor.multiplyScalar(1.6)
      }
      mesh.setColorAt(node.index, tmpColor)
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [layout, focusSet, hoveredId])

  // Gentle breathing so the sky never feels frozen.
  useFrame(({ clock }) => {
    const mesh = meshRef.current
    const t = clock.elapsedTime
    for (const node of layout.nodes) {
      const pulse = 1 + Math.sin(t * 1.1 + pulsePhases[node.index]) * 0.045
      const r = node.radius * pulse
      tmpMatrix.makeScale(r, r, r)
      tmpMatrix.setPosition(node.x, node.y, node.z)
      mesh.setMatrixAt(node.index, tmpMatrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, layout.nodes.length]}
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
      <sphereGeometry args={[1, 20, 14]} />
      <meshBasicMaterial toneMapped />
    </instancedMesh>
  )
}
