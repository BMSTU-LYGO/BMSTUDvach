import { useQuality3D } from '@/composables/useQuality3D'

export type WarpKind = 'signal' | 'tunnel' | 'fracture' | 'soft' | 'dive'

/**
 * Accent tier of the warp overlay. The low tier draws the plain veil: no
 * travelling light, no ink grain — the transition still happens, it just
 * does not spend the frame budget on the material nuances.
 */
export type WarpQuality = 'high' | 'low'

export interface WarpMaterialOptions {
  /**
   * Accent tier of the overlay. Defaults to the resolved 3D quality of the
   * app, so the veil follows the same budget as the scene behind it.
   */
  quality?: WarpQuality
}

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
  uniform float uAccent;
  uniform float uGrain;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // the accent band: one slow band of warm light crossing the veil, the
  // way the light travels over a sheet of paper. It replaces the flat fill
  // — the transition reads as a lit surface, not as a coloured rectangle
  float accentBand(vec2 p, float t) {
    float travel = (fract(t * 0.32) - 0.5) * 2.4;
    float axis = p.y * 1.15 + p.x * 0.55;
    float offset = axis - travel;
    return exp(-pow(offset * 2.4, 2.0));
  }

  // the ink grain: the faintest unevenness over the veil. It hashes the
  // screen cells, so it never flickers — the veil is paper, not a film
  float inkGrain(vec2 p) {
    return hash(floor(p * 240.0));
  }

  // signal: nested wavefronts stacked around a front travelling outwards,
  // so the ring reads as a layered signal, not a single pulse
  float signalFront(float d, float front) {
    float core = exp(-pow((d - front * 0.55) * 3.0, 2.0)) * 0.18;
    float lead = exp(-pow((d - front) * 9.0, 2.0));
    float mid = exp(-pow((d - front * 0.82) * 16.0, 2.0)) * 0.7;
    float tail = exp(-pow((d - front * 1.18) * 28.0, 2.0)) * 0.5;
    return core + lead + mid + tail;
  }

  // tunnel: ring band at radius d compressed by 1/(d+offset) foreshortening,
  // so the bands crowd the horizon instead of spacing out linearly
  float tunnelRing(float d, float prog) {
    float z = 1.0 / (d + 0.09);
    return smoothstep(0.62, 1.0, sin(fract(z * 0.55 - prog * 1.5) * 6.28318) * 0.5 + 0.5);
  }

  // dive: the field the plunging camera smears — a hot core plus a mid ring,
  // sampled at concentric radii so the blur streaks radiate outwards
  float diveField(float d, float reach) {
    return exp(-pow(d * 4.2, 2.0)) + exp(-pow((d - reach) * 5.5, 2.0)) * 0.35;
  }

  // six radial taps with outward-decaying weight — the cheap zoom-blur of a
  // camera falling forward; taps are pulled towards the core so the light
  // streaks radiate outwards as the dive deepens
  float diveSmear(float d, float spread, float reach) {
    return (diveField(d, reach)
      + diveField(d / (1.0 + spread * 0.32), reach) * 0.80
      + diveField(d / (1.0 + spread * 0.64), reach) * 0.62
      + diveField(d / (1.0 + spread * 0.96), reach) * 0.46
      + diveField(d / (1.0 + spread * 1.28), reach) * 0.32
      + diveField(d / (1.0 + spread * 1.60), reach) * 0.20) / 3.40;
  }

  // soft: honeycomb lattice — two offset grids cross-hatched into hexagons,
  // so the veil reads as a breathing network, not rows of squares
  float hexLattice(vec2 q) {
    vec2 h = vec2(1.0, 1.7320508);
    vec2 a = mod(q, h) - h * 0.5;
    vec2 b = mod(q - h * 0.5, h) - h * 0.5;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    float edge = max(abs(gv.x) * 0.8660254 + abs(gv.y) * 0.5, abs(gv.y));
    return 1.0 - smoothstep(0.30, 0.46, edge);
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
      // signal travel: a front leaving the core for the board node —
      // nested rings, radial spokes, sparkle tail, chromatic shimmer
      float d = length(p);
      vec2 dir = p / max(d, 1e-4);
      float front = uProgress * 1.5;

      float jitter = 0.004 * uAspect;
      float chanR = signalFront(length(p + dir * jitter), front);
      float chanG = signalFront(d, front);
      float chanB = signalFront(length(p - dir * jitter), front);
      float body = max(chanR, max(chanG, chanB));

      // radial rays from the source, per-spoke hash gaps, breathed by time
      float ang = atan(p.y, p.x);
      float spoke = floor(ang * 3.8197);
      float gap = smoothstep(0.28, 0.86, hash(vec2(spoke, 4.0)));
      float ray = pow(sin(ang * 24.0 - uTime * 3.0) * 0.5 + 0.5, 3.0) * gap
        * smoothstep(0.05, 0.5, d) * (1.0 - smoothstep(1.0, 1.45, d));

      // sparse sparks along the wake, flickering on discrete time steps
      vec2 cell = floor(p * 20.0);
      float sparkle = step(0.972, hash(cell + floor(uTime * 30.0) * 2.31))
        * smoothstep(1.0, 0.2, d) * uProgress;

      // the breath of the front: slow and shallow, a pulse and not a strobe
      float pulse = 1.0 + 0.12 * sin(uTime * 24.0);
      float veil = smoothstep(1.15, 0.2, d) * 0.10;

      a = (body * 0.6 + ray * 0.4 + sparkle * 0.5) * pulse + veil;

      vec3 tint = mix(steel, amber, clamp(d / 0.9, 0.0, 1.0));
      float aberration = clamp((chanR - chanB) * 1.8, -1.0, 1.0);
      col = tint * (0.9 + aberration * 0.35) + amber * chanG * 0.22;
    } else if (uKind == 1) {
      // depth tunnel: the camera falls through rings that crowd the horizon,
      // walls carry hash-banded data packets, vignette keeps the edges soft
      float d = length(p);
      float ang = atan(p.y, p.x);

      // three-tap radial smear — the cheap "motion blur" of the walls
      float ring = tunnelRing(d, uProgress) * 0.55
        + tunnelRing(d * 1.08, uProgress) * 0.30
        + tunnelRing(d * 0.92, uProgress) * 0.25;

      float sector = floor(ang * 9.5493);
      float row = floor((1.0 / (d + 0.09)) * 2.5 - uTime * 2.0);
      float ph = hash(vec2(sector * 13.0 + row * 3.7, row * 1.3 + 5.0));
      float packet = smoothstep(0.60, 0.95, ph) * (0.4 + 0.6 * fract(ph * 7.0));

      float ribs = pow(sin(ang * 12.0) * 0.5 + 0.5, 4.0) * 0.22
        * smoothstep(0.05, 0.3, d) * (1.0 - smoothstep(0.9, 1.3, d));

      float vignette = 1.0 - smoothstep(0.4, 1.2, d);
      float horizon = exp(-pow(d * 3.4, 2.0)) * (0.38 + 0.18 * sin(uTime * 18.0));

      a = clamp((ring * 0.55 + packet * 0.85 + ribs) * vignette + horizon + uProgress * 0.10, 0.0, 1.0);

      vec3 deep = vec3(0.02, 0.025, 0.05);
      col = mix(deep, amber * 0.9, clamp(packet * 0.85 + ring * 0.18, 0.0, 1.0));
      col += steel * ring * 0.10 * vignette + amber * horizon * 0.25;
    } else if (uKind == 2) {
      // archive fracture: cells tear out of the grid, tumble away from the
      // centre and leave amber seams; the middle is swallowed
      vec2 cells = vec2(20.0 * uAspect, 20.0);
      vec2 gv = (uv - 0.5) * cells;
      vec2 gi = floor(gv);
      vec2 gf = fract(gv) - 0.5;

      float h1 = hash(gi);
      float h2 = hash(gi + 31.7);
      float h3 = hash(gi + 77.3);

      vec2 away = normalize(gi + 0.5 + vec2(0.0011, 0.0023));
      float speed = 0.35 + h1 * 0.65;
      float shatter = smoothstep(0.0, 0.7, uProgress);
      vec2 push = away * shatter * speed * 1.4;

      float spin = h3 * 6.28318 + uProgress * (0.8 + h2 * 1.4);
      float cs = cos(spin);
      float sn = sin(spin);
      vec2 local = mat2(cs, -sn, sn, cs) * gf - push;

      float reach = max(abs(local.x), abs(local.y));
      float seam = min(abs(local.x), abs(local.y));
      float fill = (1.0 - smoothstep(0.30, 0.48, reach)) * (0.35 + h3 * 0.5) * shatter;
      float glow = 1.0 - smoothstep(0.0, 0.12, seam);

      // the core gets sucked in while the shards are still flying
      float d = length(p);
      float swallow = (1.0 - shatter) * exp(-pow(d * 3.2, 2.0)) * 0.9;

      a = clamp(fill * 0.75 + glow * 0.8 * shatter + swallow, 0.0, 1.0);

      vec3 shard = mix(steel * 0.55, amber, h2 * 0.85);
      col = shard * (0.35 + 0.65 * fill);
      col += mix(amber, steel * 1.6, h2 * 0.5) * glow * (0.6 + 0.5 * h1);
      col += vec3(0.9, 0.75, 0.55) * swallow * 0.6;
    } else if (uKind == 3) {
      // soft: breath of the network — a calm radial veil over a barely-there
      // honeycomb lattice, graded between steel and amber, never acidic
      float d = length(p);
      vec2 hq = p * 11.0 + vec2(0.0, uTime * 0.12);
      float lattice = hexLattice(hq);

      // low-frequency breathing so the network never sits perfectly still
      vec2 cell = floor(p * 3.5 + vec2(uTime * 0.10, -uTime * 0.07));
      float breath = 0.55 + 0.45 * hash(cell);
      float sway = 0.75 + 0.25 * sin(uTime * 1.6 + hash(cell) * 6.28318);

      a = smoothstep(1.2, 0.25, d) * uProgress * 0.55
        + lattice * breath * sway * 0.12 * smoothstep(1.25, 0.3, d);

      float pattern = clamp(lattice * breath, 0.0, 1.0);
      col = mix(steel * 0.6, amber * 0.3, pattern) * (0.9 + 0.1 * sway);
    } else if (uKind == 4) {
      // core dive: the camera plunges into a pulsing core — radial zoom-blur
      // taps stretch outwards, the vignette closes like an iris and the far
      // edges disintegrate into a faint chromatic fringe
      float d = length(p);
      vec2 dir = p / max(d, 1e-4);

      // the further from the core, the longer the smear; the ring the camera
      // falls through is pulled in on narrow frames so it stays on screen
      float reach = 0.55 * clamp(uAspect, 0.75, 1.25);
      float spread = 0.14 + uProgress * 0.42 + smoothstep(0.25, 1.15, d) * 0.48;
      float ca = 0.002;
      float sr = diveSmear(length(p + dir * ca), spread, reach);
      float sg = diveSmear(d, spread, reach);
      float sb = diveSmear(length(p - dir * ca), spread, reach);

      float body = max(sg, max(sr, sb));
      float core = exp(-d * 4.2) * (0.74 + 0.16 * sin(uTime * 14.0));
      float vignette = (1.0 - smoothstep(0.3, 1.1, d)) * (0.5 + 0.5 * uProgress);

      a = clamp(body * 0.55 + core * 0.75 * vignette + uProgress * 0.05, 0.0, 1.0);

      vec3 deep = steel * 0.30;
      vec3 base = mix(deep, amber, clamp(0.15 + core * 0.9, 0.0, 1.0));
      col = base * vignette + vec3(sr - sg, 0.0, sb - sg) * 0.5 + amber * core * 0.30;
      col = max(col, vec3(0.0));
    } else {
      // unknown kind: stay out of the way — a dim veil, never a flash
      float d = length(p);
      a = smoothstep(1.2, 0.25, d) * uProgress * 0.2;
      col = steel * 0.6;
    }

    a *= env;
    if (a < 0.003) discard;

    // the accent band: the veil is lit, not filled
    if (uAccent > 0.0) {
      float band = accentBand(p, uProgress);
      col = mix(col, amber, band * uAccent * 0.30);
      a *= 0.90 + band * 0.22 * uAccent;
    }

    // the ink grain: the faintest unevenness over the veil
    if (uGrain > 0.0) {
      float grain = inkGrain(uv) - 0.5;
      col *= 1.0 + grain * uGrain;
      a *= 1.0 + grain * uGrain * 0.7;
    }

    gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
  }
`

const KIND_INDEX: Record<WarpKind, number> = {
  signal: 0,
  tunnel: 1,
  fracture: 2,
  soft: 3,
  dive: 4,
}

export function warpKindIndex(kind: WarpKind): number {
  return KIND_INDEX[kind]
}

/**
 * The accent tier of the overlay. Without an explicit tier the veil follows
 * the resolved 3D quality of the app: a scene that runs on the low tier
 * must not pay for the material nuances of its transition either.
 */
function resolveQuality(explicit?: WarpQuality): WarpQuality {
  if (explicit) return explicit
  return useQuality3D().resolved.value === 'high' ? 'high' : 'low'
}

export function makeWarpMaterial(
  three: typeof import('three'),
  opts: WarpMaterialOptions = {},
) {
  const quality = resolveQuality(opts.quality)
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
      // The low tier draws the plain veil: no travelling band, no grain.
      uAccent: { value: quality === 'high' ? 1 : 0 },
      uGrain: { value: quality === 'high' ? 0.06 : 0 },
    },
  })
  return mat
}
