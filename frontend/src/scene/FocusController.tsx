import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { Layout } from '../types'

interface FocusControllerProps {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  layout: Layout
  selectedId: string | null
}

const goalTarget = new THREE.Vector3()
const goalCamera = new THREE.Vector3()
const offset = new THREE.Vector3()

/**
 * Glides the camera toward a selected star without ever fighting the user:
 * any manual orbit input cancels the flight.
 */
export function FocusController({ controlsRef, layout, selectedId }: FocusControllerProps) {
  const camera = useThree((s) => s.camera)
  const flying = useRef(false)

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const cancel = () => {
      flying.current = false
    }
    controls.addEventListener('start', cancel)
    return () => controls.removeEventListener('start', cancel)
  }, [controlsRef])

  useEffect(() => {
    if (!selectedId) {
      flying.current = false
      return
    }
    const node = layout.byId.get(selectedId)
    if (!node) return
    goalTarget.set(node.x, node.y, node.z)
    offset.copy(camera.position).sub(goalTarget)
    const distance = Math.max(26, node.radius * 11)
    if (offset.lengthSq() < 1) offset.set(0, 0.3, 1)
    offset.normalize().multiplyScalar(distance)
    goalCamera.copy(goalTarget).add(offset)
    flying.current = true
  }, [selectedId, layout, camera])

  useFrame((_, delta) => {
    const controls = controlsRef.current
    if (!controls) return
    controls.autoRotate = !selectedId && !flying.current
    if (!flying.current) return
    const k = 1 - Math.exp(-delta * 4)
    controls.target.lerp(goalTarget, k)
    camera.position.lerp(goalCamera, k)
    controls.update()
    if (camera.position.distanceTo(goalCamera) < 0.4) flying.current = false
  })

  return null
}
