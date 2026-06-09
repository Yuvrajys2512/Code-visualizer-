import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

export interface CameraGoal {
  /** changes whenever a new flight should start */
  key: string
  x: number
  y: number
  z: number
  distance: number
}

interface FocusControllerProps {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  goal: CameraGoal | null
}

const goalTarget = new THREE.Vector3()
const goalCamera = new THREE.Vector3()
const offset = new THREE.Vector3()

/**
 * Glides the camera toward a goal (a star or a whole cluster) without ever
 * fighting the user: any manual orbit input cancels the flight.
 */
export function FocusController({ controlsRef, goal }: FocusControllerProps) {
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
    if (!goal) {
      flying.current = false
      return
    }
    goalTarget.set(goal.x, goal.y, goal.z)
    offset.copy(camera.position).sub(goalTarget)
    if (offset.lengthSq() < 1) offset.set(0, 0.3, 1)
    offset.normalize().multiplyScalar(goal.distance)
    goalCamera.copy(goalTarget).add(offset)
    flying.current = true
  }, [goal, camera])

  useFrame((_, delta) => {
    const controls = controlsRef.current
    if (!controls) return
    controls.autoRotate = !goal && !flying.current
    if (!flying.current) return
    const k = 1 - Math.exp(-delta * 4)
    controls.target.lerp(goalTarget, k)
    camera.position.lerp(goalCamera, k)
    controls.update()
    if (camera.position.distanceTo(goalCamera) < 0.4) flying.current = false
  })

  return null
}
