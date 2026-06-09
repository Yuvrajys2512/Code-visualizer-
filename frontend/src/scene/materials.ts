import * as THREE from 'three'

/**
 * Star surface: white-hot core fading through the instance colour into a
 * fresnel limb glow. Reads as a plasma orb at any distance — never a flat
 * disc. Instance colours carry HDR multipliers, so only genuinely
 * significant stars push past the bloom threshold.
 */
export function createStarMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      #ifndef USE_INSTANCING_COLOR
      attribute vec3 instanceColor;
      #endif
      varying vec3 vColor;
      varying vec3 vNormalW;
      varying vec3 vViewW;
      void main() {
        vColor = instanceColor;
        vec4 wPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vViewW = cameraPosition - wPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * wPos;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying vec3 vNormalW;
      varying vec3 vViewW;
      void main() {
        float facing = clamp(dot(normalize(vNormalW), normalize(vViewW)), 0.0, 1.0);
        float core = smoothstep(0.42, 1.0, facing);
        float rim = pow(1.0 - facing, 2.1);
        vec3 base = vColor * (0.20 + 0.55 * facing);
        vec3 hot = mix(vColor, vec3(1.0), 0.72) * core * core * 1.55;
        vec3 glow = vColor * rim * 0.95;
        gl_FragColor = vec4(base + hot + glow, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

/**
 * Atmospheric halo rendered as oversized soft points behind each star —
 * the air-glow a long-exposure photo would catch.
 */
export function createHaloMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute vec3 aColor;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(aSize * (260.0 / -mv.z), 320.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 uv = gl_PointCoord * 2.0 - 1.0;
        float d = length(uv);
        float a = exp(-d * d * 3.2) * smoothstep(1.0, 0.78, d);
        gl_FragColor = vec4(vColor * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

/** Soft radial texture shared by nebula sprites and dust. */
export function makeNebulaTexture(stops: [number, string][] = [
  [0, 'rgba(255,255,255,0.85)'],
  [0.4, 'rgba(255,255,255,0.28)'],
  [1, 'rgba(255,255,255,0)'],
]): THREE.Texture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [offset, color] of stops) g.addColorStop(offset, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
