import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

export const LABEL_FONT = '/fonts/SpaceGrotesk-500.ttf'
export const LABEL_FONT_BOLD = '/fonts/SpaceGrotesk-700.ttf'

interface FadingLabelProps {
  position: [number, number, number]
  text: string
  subText?: string
  fontSize: number
  color: string
  subColor?: string
  baseOpacity: number
  bold?: boolean
  /** below this camera distance the label fades out (you're flying past it) */
  near: number
  /** beyond this it fades into the void */
  far: number
  depthTest?: boolean
}

const tmp = new THREE.Vector3()

/**
 * Billboard text that behaves like something in a real instrument display:
 * fades out as you fly through it, fades into the distance, and keeps a
 * bounded on-screen size instead of filling the viewport up close.
 */
export function FadingLabel({
  position,
  text,
  subText,
  fontSize,
  color,
  subColor,
  baseOpacity,
  bold,
  near,
  far,
  depthTest = true,
}: FadingLabelProps) {
  const groupRef = useRef<THREE.Group>(null!)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mainRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subRef = useRef<any>(null)

  useFrame(({ camera }) => {
    const d = camera.position.distanceTo(tmp.set(position[0], position[1], position[2]))
    const fadeIn = THREE.MathUtils.smoothstep(d, near, near * 1.8)
    const fadeOut = 1 - THREE.MathUtils.smoothstep(d, far, far * 1.6)
    const opacity = baseOpacity * fadeIn * fadeOut
    // keep an apparent size: shrink when close, grow modestly when far
    const scale = THREE.MathUtils.clamp(d / 85, 0.5, 1.25)
    if (groupRef.current) {
      groupRef.current.scale.setScalar(scale)
      groupRef.current.visible = opacity > 0.01
    }
    if (mainRef.current) {
      mainRef.current.fillOpacity = opacity
      mainRef.current.outlineOpacity = opacity * 0.9
    }
    if (subRef.current) {
      subRef.current.fillOpacity = opacity * 0.72
      subRef.current.outlineOpacity = opacity * 0.7
    }
  })

  return (
    <Billboard position={position}>
      <group ref={groupRef}>
        <Text
          ref={mainRef}
          font={bold ? LABEL_FONT_BOLD : LABEL_FONT}
          fontSize={fontSize}
          letterSpacing={0.02}
          color={color}
          fillOpacity={0}
          outlineWidth={0.055}
          outlineColor="#000000"
          outlineOpacity={0}
          anchorX="center"
          anchorY="bottom"
          renderOrder={10}
          material-depthTest={depthTest}
        >
          {text}
        </Text>
        {subText && (
          <Text
            ref={subRef}
            font={LABEL_FONT}
            fontSize={fontSize * 0.44}
            letterSpacing={0.14}
            color={subColor ?? color}
            fillOpacity={0}
            outlineWidth={0.045}
            outlineColor="#000000"
            outlineOpacity={0}
            anchorX="center"
            anchorY="top"
            position={[0, -fontSize * 0.28, 0]}
            renderOrder={10}
            material-depthTest={depthTest}
          >
            {subText.toUpperCase()}
          </Text>
        )}
      </group>
    </Billboard>
  )
}
