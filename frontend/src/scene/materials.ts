import * as THREE from 'three'

/**
 * Node surface: a soft matte sphere lit from above-camera with a thin
 * fresnel rim — reads as a clean physical object, not a glowing plasma orb.
 * Instance colours stay near [0..1.4]; only hover/selection pushes past the
 * bloom threshold, so glow is a deliberate signal rather than ambience.
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
        vec3 n = normalize(vNormalW);
        vec3 v = normalize(vViewW);
        float facing = clamp(dot(n, v), 0.0, 1.0);
        // key light slightly above the camera for gentle modelling
        vec3 l = normalize(v + vec3(0.0, 0.6, 0.0));
        float diffuse = clamp(dot(n, l), 0.0, 1.0);
        float rim = pow(1.0 - facing, 3.0);
        vec3 base = vColor * (0.30 + 0.62 * diffuse);
        vec3 sheen = vColor * pow(diffuse, 8.0) * 0.35;
        vec3 edge = vColor * rim * 0.5;
        gl_FragColor = vec4(base + sheen + edge, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

/**
 * Restrained halo: a tight soft disc behind each node. At rest it is barely
 * a breath of light; hover and selection are what switch it on.
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
        gl_PointSize = min(aSize * (200.0 / -mv.z), 220.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 uv = gl_PointCoord * 2.0 - 1.0;
        float d = length(uv);
        float a = exp(-d * d * 4.5) * smoothstep(1.0, 0.7, d);
        gl_FragColor = vec4(vColor * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}
