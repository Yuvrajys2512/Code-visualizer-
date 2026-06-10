import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BLAST_STAGGER, BLAST_TAIL, type BlastState } from '../effects'
import type { Layout } from '../types'

interface ShockwaveProps {
  layout: Layout
  blastBox: { state: BlastState | null }
}

/** World units the wavefront travels per second. */
const WAVE_SPEED = 52

/**
 * The visible front of a supernova: a translucent expanding shell whose rim
 * glows where it grazes the camera angle, plus a hot core flash at the
 * origin. The shell is cosmetic — the dependency rings flashing star by star
 * (in Nodes/Edges) carry the actual information.
 */
export function Shockwave({ layout, blastBox }: ShockwaveProps) {
  const shellRef = useRef<THREE.Mesh>(null!)
  const coreRef = useRef<THREE.Sprite>(null!)

  const shellMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uIntensity: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec3 vNormalW;
          varying vec3 vViewW;
          void main() {
            vec4 wPos = modelMatrix * vec4(position, 1.0);
            vNormalW = normalize(mat3(modelMatrix) * normal);
            vViewW = cameraPosition - wPos.xyz;
            gl_Position = projectionMatrix * viewMatrix * wPos;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uIntensity;
          varying vec3 vNormalW;
          varying vec3 vViewW;
          void main() {
            float facing = abs(dot(normalize(vNormalW), normalize(vViewW)));
            float rim = pow(1.0 - facing, 2.4);          // glow at the silhouette
            float sheen = pow(facing, 6.0) * 0.18;        // faint film face-on
            vec3 tint = mix(vec3(0.55, 0.75, 1.0), vec3(1.0), rim);
            gl_FragColor = vec4(tint * (rim + sheen) * uIntensity, (rim + sheen) * uIntensity);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  )

  const coreMaterial = useMemo(() => {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const g = canvas.getContext('2d')!
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.25, 'rgba(190,220,255,0.55)')
    grad.addColorStop(1, 'rgba(120,170,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    })
  }, [])

  useFrame(({ clock }) => {
    const blast = blastBox.state
    const shell = shellRef.current
    const core = coreRef.current
    if (!blast) {
      shell.visible = false
      core.visible = false
      return
    }
    // first frame after the trigger: stamp the launch time
    if (blast.startedAt < 0) blast.startedAt = clock.elapsedTime
    const t = clock.elapsedTime - blast.startedAt
    const life = blast.maxDepth * BLAST_STAGGER + BLAST_TAIL
    if (t > life) {
      blastBox.state = null
      shell.visible = false
      core.visible = false
      return
    }

    const origin = layout.byId.get(blast.originId)
    if (!origin) return
    const fade = 1 - t / life

    shell.visible = true
    shell.position.set(origin.x, origin.y, origin.z)
    const radius = Math.max(0.1, t * WAVE_SPEED)
    shell.scale.setScalar(radius)
    shellMaterial.uniforms.uIntensity.value = 0.9 * fade * fade

    core.visible = true
    core.position.set(origin.x, origin.y, origin.z)
    const flash = Math.exp(-t * 1.4)
    core.scale.setScalar(origin.radius * (10 + t * 26))
    coreMaterial.opacity = flash
  })

  return (
    <>
      <mesh ref={shellRef} visible={false} material={shellMaterial} raycast={() => null}>
        <sphereGeometry args={[1, 48, 32]} />
      </mesh>
      <sprite ref={coreRef} visible={false} material={coreMaterial} raycast={() => null} />
    </>
  )
}
