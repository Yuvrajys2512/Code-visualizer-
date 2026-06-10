import * as THREE from 'three'

/**
 * Node surface: a bioluminescent orb — lit from within, brightest at the
 * core, with a luminous fresnel rim like a jellyfish bell catching light.
 * Instance colours carry modest HDR multipliers so significant files
 * genuinely shine while minor ones merely glow.
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
        float core = smoothstep(0.35, 1.0, facing);
        float rim = pow(1.0 - facing, 2.2);
        vec3 body = vColor * (0.30 + 0.50 * facing);
        vec3 inner = mix(vColor, vec3(1.0), 0.55) * core * core * 0.95;
        vec3 glow = vColor * rim * 1.1;
        gl_FragColor = vec4(body + inner + glow, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

/**
 * Atmospheric halo behind each node — the light an orb sheds into the water
 * around it. Always faintly present; hover and flares turn it up.
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
        gl_PointSize = min(aSize * (240.0 / -mv.z), 280.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 uv = gl_PointCoord * 2.0 - 1.0;
        float d = length(uv);
        float a = exp(-d * d * 3.4) * smoothstep(1.0, 0.75, d);
        gl_FragColor = vec4(vColor * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}
