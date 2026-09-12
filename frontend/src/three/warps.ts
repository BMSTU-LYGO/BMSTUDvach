export type WarpKind = 'signal' | 'tunnel' | 'fracture' | 'soft'

/**
 * Route transition warps. A fullscreen-shader overlay played on top of the
 * page during navigation. The player is registered by WarpCanvas when the
 * network is on; with 3D disabled playWarp() is a no-op.
 */

export function warpKindFor(from: string, to: string): WarpKind {
  if (to === 'platinum' || to === 'error') return 'fracture'
  if (from === 'board' && to === 'thread') return 'tunnel'
  if (from === 'thread' && to === 'board') return 'tunnel'
  if (from === 'home' && to === 'board') return 'signal'
  return 'soft'
}

type WarpPlayer = (kind: WarpKind) => void

let player: WarpPlayer | null = null

export function registerWarpPlayer(fn: WarpPlayer | null) {
  player = fn
}

export function playWarp(kind: WarpKind) {
  player?.(kind)
}

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const frag = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform float uProgress;
  uniform float uTime;
  uniform float uAspect;
  uniform int uKind;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
    float env = smoothstep(0.0, 0.10, uProgress) * (1.0 - smoothstep(0.72, 1.0, uProgress));
    vec3 amber = vec3(0.83, 0.53, 0.16);
    vec3 steel = vec3(0.35, 0.39, 0.50);
    float a = 0.0;
    vec3 col = steel;

    if (uKind == 0) {
      // signal: a wavefront ring travelling out from the source node
      float d = length(p);
      float front = uProgress * 1.5;
      float ring = exp(-pow((d - front) * 5.0, 2.0));
      float trail = exp(-pow((d - front + 0.05) * 16.0, 2.0)) * 0.45;
      float veil = smoothstep(1.0, 0.2, d) * 0.10;
      a = (ring + trail) * 0.85 + veil;
      col = mix(steel, amber, clamp(ring + trail * 1.5, 0.0, 1.0));
    } else if (uKind == 1) {
      // tunnel: depth rings flowing toward the camera
      float d = length(p);
      float w = fract(d * 2.4 - uProgress * 2.6);
      float bands = smoothstep(0.55, 1.0, sin(w * 6.28318) * 0.5 + 0.5);
      float streak = bands * (0.55 - d * 0.28);
      float dive = smoothstep(0.0, 0.55, d) * uProgress;
      a = clamp(streak * 0.5 + dive * 0.75, 0.0, 1.0);
      col = mix(vec3(0.02, 0.025, 0.05), amber * 0.9, streak * 0.7);
    } else if (uKind == 2) {
      // archive fracture: cell shards sliding apart and dissolving
      vec2 g = floor((uv - 0.5) * vec2(16.0 * uAspect, 16.0)) + 0.5;
      float h1 = hash(g);
      float h2 = hash(g + 31.7);
      float dissolve = clamp(uProgress * 1.35 - h1 * 0.35, 0.0, 1.0);
      float edge = smoothstep(0.55, 0.0,
        length(fract((uv - 0.5) * vec2(16.0 * uAspect, 16.0)) - 0.5) * 1.4);
      a = (dissolve * 0.5 + edge * 0.45 * dissolve) * (1.0 - smoothstep(0.75, 1.0, uProgress));
      col = mix(steel, amber, edge);
      void(h2);
    } else {
      // soft: radial veil
      float d = length(p);
      a = smoothstep(1.2, 0.25, d) * uProgress * 0.55;
      col = steel * 0.6;
    }

    a *= env;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
  }
`

const KIND_INDEX: Record<WarpKind, number> = {
  signal: 0,
  tunnel: 1,
  fracture: 2,
  soft: 3,
}

export function warpKindIndex(kind: WarpKind): number {
  return KIND_INDEX[kind]
}

export function makeWarpMaterial(three: typeof import('three')) {
  const mat = new three.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uKind: { value: KIND_INDEX.soft },
    },
  })
  return mat
}
