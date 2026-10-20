import type { Color, ShaderMaterial, Vector3 } from 'three'

/**
 * The `three` namespace as a type-only dependency: the scene hands the
 * module in, so this file never pulls `three` in at runtime — the same
 * contract `src/three/network.ts` uses.
 */
type ThreeModule = typeof import('three')

/**
 * Procedural materials of the Archive Space scene.
 *
 * The archive is a *reading* space, not a cyber-network: the fragments are
 * paper plates on warm ink, the orbits are quiet lines, the vault is a slow
 * amber core. Everything is procedural (no textures) so the scene stays
 * cheap to build and cheap to dispose.
 *
 * Two rules hold for every material here:
 *
 * 1. **One uniform contract.** Every material exposes `uTime`, `uFocus` and
 *    `uDim` (plus `uColorA` / `uColorB` / `uQuality`). The three shared
 *    uniforms are the *same objects* in every material, so the scene drives
 *    the whole archive from one place — see `archiveUniforms` (the default
 *    bank) and `createArchiveUniforms` (a bank of its own, owned by one
 *    scene). The point the archive gazes at (`uFocusPoint`) belongs to the
 *    same bank: it is what turns "something is focused" into "this plate
 *    answers" — one accent, not sixty of them.
 * 2. **GLSL ES 1.00 only.** The shaders avoid `texture()`, `invert()` and
 *    anything else WebGL1 does not guarantee, and they use `gl_FragColor`.
 *    Quality tiers are baked into the source (no `#define`), so every tier
 *    compiles as plain GLSL.
 *
 * A third rule keeps the scene cheap: **no textures at all**. Every surface
 * is procedural, so a material owns nothing but its shader program — the
 * low tier pays for a third of the noise samples of the high tier, never
 * for a texture that has to be uploaded, sampled and released again.
 */

/** Quality tier of an archive material. */
export type ArchiveQuality = 'high' | 'low'

/** Minimal uniform shape — mirrors three's `IUniform` without importing it. */
export interface ArchiveUniform<T> {
  value: T
}

/**
 * The three uniforms every archive material shares by reference:
 * the clock, the focus amount and the visibility.
 */
export interface ArchiveCoreUniforms {
  /** Seconds since the scene started — drives every animation. */
  uTime: ArchiveUniform<number>
  /** Focus amount (0..1) — the fragment the pointer or the list is on. */
  uFocus: ArchiveUniform<number>
  /** Visibility: 1 = fully present, 0 = gone. */
  uDim: ArchiveUniform<number>
}

/**
 * Uniform bag of an archive material: the shared core, the palette pair,
 * the quality tier and any per-material extras.
 *
 * `uQuality` is the detail dial of the tier (1 = high, 0 = low) and
 * `uOctaves` mirrors the octave count baked into the shader source — both
 * are readable by the scene, which may want to adapt on its own.
 */
export type ArchiveUniforms = ArchiveCoreUniforms & {
  uColorA: ArchiveUniform<Color>
  uColorB: ArchiveUniform<Color>
  uQuality: ArchiveUniform<number>
  uOctaves: ArchiveUniform<number>
} & {
  [key: string]: ArchiveUniform<unknown>
}

/* --- palette (docs/ART_DIRECTION.md — «Редакционный архив») --------------- */

/** Warm paper — the base tone of a fragment plate. */
const PAPER = 0xf2ede0
/** Restrained teal accent — the focus light of a fragment. */
const ACCENT = 0x2f4f4e
/** Amber — the warm highlight of the orbits and the core. */
const AMBER = 0xd4882a
/** Brighter amber — the inner pulse of the vault. */
const AMBER_BRIGHT = 0xffa840
/** Cool steel — the resting colour of an orbit. */
const STEEL = 0x5a6480
/** Lighter steel — the dust. */
const STEEL_LIGHT = 0x8a94b8

/** Noise octaves per tier — 'low' drops the second layer of the grain. */
const OCTAVES: Record<ArchiveQuality, number> = { high: 3, low: 1 }

/**
 * How much of the accent the rim of a resting plate keeps.
 *
 * The archive is ink first and light second: a plate that nobody reads
 * shows a whisper of the teal accent on its rim — the printed edge of a
 * page — and nothing else.
 */
const ACCENT_REST = 0.12
/**
 * The strength of the paper through-light on the high tier.
 *
 * The bleed is the expensive path of the plate: a soft falloff, a drifting
 * spot of light and a second colour. The low tier sets it to zero — the
 * picture is honestly simpler, not broken.
 */
const BLEED_HIGH = 0.55
/**
 * How far the focus of the reader reaches on a plate, in world units.
 *
 * The plates of a ring stand a fraction of a unit apart, so a tight reach
 * keeps the accent on one sheet: the focused one answers, its neighbour
 * only whispers.
 */
const PLATE_FOCUS_REACH = 0.45
/**
 * How far the focus reaches along an orbit, in world units.
 *
 * An orbit is a long line: the amber walks to the arc around the focused
 * plate instead of flooding the whole ring.
 */
const RING_FOCUS_REACH = 2.4

/**
 * The shared uniform bank. Every factory wires these very objects into its
 * materials, so writing `shared.uTime.value = t` moves the whole archive.
 *
 * It is the *default* bank — the one every material shares when no other
 * bank is given. A scene that must not share its clock with another scene
 * (two archives on one page) asks for its own: `createArchiveUniforms`.
 */
const shared: ArchiveCoreUniforms = {
  uTime: { value: 0 },
  uFocus: { value: 0 },
  uDim: { value: 1 },
}

/**
 * Bake the octave count into the shader source.
 *
 * The GLSL lives in named constants; `FBM_OCTAVES` is a placeholder that we
 * substitute here. A GLSL `#define` would have done the same, but it turns
 * the shader into something no plain GLSL compiler (or headless check) can
 * read — so the tiers are assembled in JS instead.
 */
function withOctaves(source: string, octaves: number): string {
  return source.replace(/FBM_OCTAVES/g, String(Math.max(1, Math.round(octaves))))
}

/* --- GLSL ---------------------------------------------------------------- */

/**
 * Cheap hash noise shared by the shaders that need grain.
 *
 * `hash21` is a value hash, `valueNoise` interpolates it, `fbm` stacks
 * `FBM_OCTAVES` of them. No textures, no derivatives, WebGL1-safe.
 */
const noiseChunk = /* glsl */ `
  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < FBM_OCTAVES; i++) {
      sum += amp * valueNoise(p);
      p = p * 2.03;
      amp = amp * 0.5;
    }
    // Normalised, so one octave and three octaves share the same range.
    return sum / (1.0 - pow(0.5, float(FBM_OCTAVES)));
  }
`

/** Fragment plate — vertex stage (a flat plate: normal + uv + local pos). */
const fragmentVert = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vCentre;

  void main() {
    vUv = uv;
    vLocal = position;
    // The centre of the sheet in the archive: the model matrix places the
    // plate, so the centre is the same for every vertex of it. The focus
    // stage compares it with the point the reader is on — and only that
    // one plate answers.
    vCentre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    vNormal = normalMatrix * normal;
    gl_Position = projectionMatrix * mvPosition;
  }
`

/** Fragment plate — fragment stage. */
const fragmentFrag = /* glsl */ `
  uniform float uTime;
  uniform float uFocus;
  uniform float uDim;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uEdgeColor;
  uniform float uQuality;
  uniform float uOctaves;
  uniform float uGrain;
  uniform float uFresnelPower;
  uniform float uOpacity;
  uniform float uBleed;
  uniform float uAccentRest;
  uniform vec3 uFocusPoint;
  uniform float uFocusRadius;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vCentre;

  ${noiseChunk}

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 n = normalize(vNormal);
    // The fresnel rim is the only place light may live.
    float fresnel = pow(1.0 - abs(dot(viewDir, n)), uFresnelPower);

    // Warm paper grain over the local plate position: the high tier stacks
    // the octaves, the low tier keeps a single layer. The branch is uniform
    // (uQuality never changes per draw), so the unused layer is really
    // skipped instead of computed and multiplied by zero.
    vec2 gp = vLocal.xy * 3.4 + vec2(vLocal.z * 1.7, vLocal.z * 0.9);
    // The fibre of the paper drifts a hair with the clock — the sheet is
    // alive, never a sticker. The drift is slow enough to read as grain.
    gp += vec2(uTime * 0.02, uTime * -0.014);
    float coarse = uQuality > 0.5 ? fbm(gp) : valueNoise(gp);
    // The fine layer belongs to the high tier alone.
    float fine = uQuality > 0.5 ? hash21(floor(vUv * 320.0)) * step(1.5, uOctaves) : 0.0;
    float grain = clamp((coarse * 0.7 + fine * 0.3) * uGrain, 0.0, 1.0);

    vec3 paper = uColorA;
    vec3 base = mix(paper, paper * 0.38, grain);

    // The rim of the sheet is the only place an accent may live.
    float edge = smoothstep(0.30, 1.0, fresnel);

    // At rest the rim keeps a whisper of the accent — ink, not light.
    vec3 color = mix(base, uColorB, edge * uAccentRest);

    // The focus lights exactly one plate of the archive: the one the
    // reader is on. Its rim ignites in amber — the single accent of the
    // moment, and it never leaves the edge.
    float reach = 1.0 - smoothstep(0.0, uFocusRadius, distance(vCentre, uFocusPoint));
    // The squared falloff keeps the neighbour of the focused plate a
    // whisper instead of a second accent.
    float focus = clamp(uFocus, 0.0, 1.0) * reach * reach;
    // The edge breathes — a slow swell, never a flash.
    focus *= 0.86 + 0.14 * sin(uTime * 1.6);
    color = mix(color, uEdgeColor, edge * focus * 0.9);

    // The paper is thin: where the sheet turns edge-on the warm light of
    // the core passes through it. The bleed lives on the rim and only
    // while the plate is in focus — a paper glow, never a neon.
    float thin = 1.0 - abs(dot(viewDir, n));
    float bleed = uBleed * smoothstep(0.45, 1.0, thin) * focus;
    // A slow spot of light wanders over the sheet, so the bleed reads as
    // a lamp standing over the page.
    vec2 spot = vec2(0.5 + 0.24 * sin(uTime * 0.21), 0.5 + 0.2 * cos(uTime * 0.17));
    float lamp = 1.0 - smoothstep(0.05, 0.6, distance(vUv, spot));
    vec3 bleedColor = mix(uColorA, uEdgeColor, 0.55);
    color = mix(color, bleedColor, bleed * (0.35 + 0.65 * lamp));

    float alpha = uOpacity * (0.55 + fresnel * 0.45) * clamp(uDim, 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
  }
`

/**
 * Orbit ring — vertex stage.
 *
 * Rings are drawn as lines: no normals are available, so the shader stays
 * on `position` only.
 */
const ringVert = /* glsl */ `
  varying vec3 vLocal;
  varying float vDepth;
  varying vec3 vWorld;

  void main() {
    vLocal = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vDepth = clamp((-mvPosition.z) / 40.0, 0.0, 1.0);
    // The place of the vertex in the archive: the amber of the focus walks
    // along the orbit to the arc around the plate the reader is on.
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`

/** Orbit ring — fragment stage: a breathing line with a travelling noise. */
const ringFrag = /* glsl */ `
  uniform float uTime;
  uniform float uFocus;
  uniform float uDim;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uQuality;
  uniform float uOpacity;
  uniform float uPhase;
  uniform float uNoiseScale;
  uniform float uSpeed;
  uniform vec3 uFocusPoint;
  uniform float uFocusRadius;

  varying vec3 vLocal;
  varying float vDepth;
  varying vec3 vWorld;

  ${noiseChunk}

  void main() {
    // A slow breath of brightness.
    float breath = 0.68 + 0.32 * sin(uTime * 0.8 + uPhase);

    // Running noise: a scrolling field sampled on a fixed projection of the
    // local position, so the highlight travels along the orbit whatever
    // plane the ring was built in.
    vec2 np = vec2(vLocal.x + vLocal.z * 0.61, vLocal.y - vLocal.z * 0.43);
    vec2 q = np * uNoiseScale + vec2(uTime * uSpeed, uTime * uSpeed * 0.6);
    // Same branch as on the plate: the low tier samples the noise once.
    float n = uQuality > 0.5 ? fbm(q) : valueNoise(q);
    float travel = 0.55 + 0.45 * n;

    // The amber answers only around the focused plate: the orbit warms up
    // where the reader stands, it does not flood the archive.
    float reach = 1.0 - smoothstep(0.0, uFocusRadius, distance(vWorld, uFocusPoint));
    float focus = clamp(uFocus, 0.0, 1.0) * reach;

    vec3 color = mix(uColorA, uColorB, focus * 0.9);
    float alpha =
      uOpacity * breath * travel * clamp(uDim, 0.0, 1.0) * (1.0 - vDepth * 0.35);
    gl_FragColor = vec4(color * (0.8 + travel * 0.45), alpha);
  }
`

/** Vault core — vertex stage. */
const vaultVert = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vLocal;

  void main() {
    vLocal = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    vNormal = normalMatrix * normal;
    gl_Position = projectionMatrix * mvPosition;
  }
`

/** Vault core — fragment stage: a drifting rim over an amber pulse. */
const vaultFrag = /* glsl */ `
  uniform float uTime;
  uniform float uFocus;
  uniform float uDim;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uQuality;
  uniform float uOpacity;
  uniform float uPulseSpeed;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vLocal;

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 n = normalize(vNormal);
    // The low tier keeps a softer rim, the high tier a sharper one.
    float fresnel = pow(1.0 - abs(dot(viewDir, n)), mix(2.8, 2.2, uQuality));

    // The rim highlight drifts slowly across the shell.
    float drift = 0.5 + 0.5 * sin(uTime * 0.32 + vLocal.y * 1.7 + vLocal.x * 0.9);
    float focus = clamp(uFocus, 0.0, 1.0);
    float rim = fresnel * (0.55 + 0.45 * drift) * (1.0 + focus * 0.5);

    // An amber pulse breathing inside the core.
    float pulse = 0.5 + 0.5 * sin(uTime * uPulseSpeed);

    vec3 color = mix(
      uColorA,
      uColorB,
      clamp(rim * 0.9 + pulse * 0.18, 0.0, 1.0)
    );
    // Below half visibility the core is practically gone.
    float presence = smoothstep(0.5, 1.0, clamp(uDim, 0.0, 1.0));
    float alpha = uOpacity * (0.22 + rim * 0.78) * presence;
    gl_FragColor = vec4(color, alpha);
  }
`

/**
 * Ambient dust — vertex stage.
 *
 * The scene **must** provide an `aSeed` attribute (one float per point):
 * it carries the individual phase of every mote. Without it the attribute
 * reads as 0 and the whole cloud blinks in unison — still valid, but dead.
 */
const dustVert = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uSpeed;
  uniform float uQuality;

  attribute float aSeed;

  varying float vFlicker;

  void main() {
    vec3 pos = position;
    float s = aSeed;
    // The depth of the mote decides how fast it drifts: the near ones race,
    // the far ones crawl. The high tier pays for the extra transform, the
    // low tier keeps every mote on one speed — simpler, not broken.
    float depth = 0.5;
    if (uQuality > 0.5) {
      vec4 viewPos = modelViewMatrix * vec4(pos, 1.0);
      depth = clamp(1.0 - length(viewPos.xyz) / 34.0, 0.0, 1.0);
    }
    float pace = 0.55 + depth * 0.9;
    pos.x += sin(uTime * (0.12 + uSpeed * 0.18) * pace + s * 6.2831) * 0.28 * pace;
    pos.y += cos(uTime * (0.09 + uSpeed * 0.14) * pace + s * 4.1) * 0.2 * pace;
    pos.z += sin(uTime * (0.07 + uSpeed * 0.11) * pace + s * 9.7) * 0.14 * pace;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float dist = length(mvPosition.xyz);
    vFlicker =
      (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 1.7 + s * 12.566))) *
      (1.0 - smoothstep(5.0, 42.0, dist));

    // The low tier keeps every mote the same size.
    float size = mix(1.0, 0.7 + 0.6 * fract(s * 7.31), uQuality);
    // The near motes are the big ones: the cloud gets a depth instead of a
    // swarm.
    float nearness = mix(0.7, 1.3, depth);
    gl_PointSize =
      uSize * size * (1.0 + 0.18 * sin(uTime * 0.9 + s * 6.28)) * nearness;
    gl_Position = projectionMatrix * mvPosition;
  }
`

/** Ambient dust — fragment stage: a soft additive mote. */
const dustFrag = /* glsl */ `
  uniform float uFocus;
  uniform float uDim;
  uniform float uDust;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;

  varying float vFlicker;

  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c);
    if (d > 0.5) discard;
    float soft = 1.0 - smoothstep(0.05, 0.5, d);
    vec3 color = mix(uColorA, uColorB, clamp(uFocus, 0.0, 1.0) * 0.4);
    // The dust follows the presence of the archive and its own emptiness:
    // an archive without stories keeps no motes at all.
    float alpha =
      soft * vFlicker * uOpacity * clamp(uDim, 0.0, 1.0) * clamp(uDust, 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
  }
`

/** Empty-state halo — vertex stage (a camera-facing plane). */
const emptyHaloVert = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** Empty-state halo — fragment stage: a soft, always-additive breathing glow. */
const emptyHaloFrag = /* glsl */ `
  uniform float uTime;
  uniform float uFocus;
  uniform float uDim;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uQuality;
  uniform float uOpacity;
  uniform float uPhase;

  varying vec2 vUv;

  void main() {
    vec2 c = vUv - vec2(0.5);
    float d = clamp(length(c) * 2.0, 0.0, 1.0);
    // The low tier keeps a tighter, simpler glow.
    float inner = mix(0.55, 0.0, uQuality);
    float halo = 1.0 - smoothstep(inner, 1.0, d);
    halo = halo * halo;

    // A slow breath — never a flash.
    float breath = 0.78 + 0.22 * sin(uTime * 0.45 + uPhase);
    vec3 color = mix(uColorA, uColorB, clamp(uFocus, 0.0, 1.0) * 0.45);
    float alpha = halo * breath * uOpacity * clamp(uDim, 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
  }
`

/* --- factories ------------------------------------------------------------ */

/** Options shared by every archive material. */
export interface ArchiveMaterialOptions {
  /** Quality tier — 'high' gets the full noise, 'low' a cheaper variant. */
  quality?: ArchiveQuality
  /** Base colour (hex). */
  colorA?: number
  /** Secondary colour (hex) — the focus tint of the material. */
  colorB?: number
  /** Base opacity of the material. */
  opacity?: number
  /**
   * The uniform bank of the material.
   *
   * Without it the material joins the default bank of the module — the one
   * every archive material shares. A scene that owns its archive gives its
   * own bank (`createArchiveUniforms`) to every material it builds, so two
   * archives on one page never overwrite each other's clock.
   */
  uniforms?: ArchiveUniforms
}

/** Options of the fragment plate. */
export interface FragmentMaterialOptions extends ArchiveMaterialOptions {
  /** Strength of the paper grain. */
  grain?: number
  /** Exponent of the fresnel rim. */
  fresnelPower?: number
  /** Colour of the ignited edge — the amber of the focus. */
  edgeColor?: number
  /**
   * Strength of the paper through-light.
   *
   * The high tier lights the bleed by itself; the low tier keeps it at
   * zero, so the cheap path really costs less.
   */
  bleed?: number
  /** How much of the accent the rim of a resting plate keeps. */
  accentRest?: number
  /** How far the focus of the reader reaches, in world units. */
  focusRadius?: number
}

/** Options of an orbit ring. */
export interface RingMaterialOptions extends ArchiveMaterialOptions {
  /** Phase of the breath — give every ring its own offset. */
  phase?: number
  /** Scale of the travelling noise field. */
  noiseScale?: number
  /** Speed of the travelling noise field. */
  speed?: number
  /** How far the focus reaches along the orbit, in world units. */
  focusRadius?: number
}

/** Options of the vault core. */
export interface VaultMaterialOptions extends ArchiveMaterialOptions {
  /** Speed of the inner amber pulse. */
  pulseSpeed?: number
}

/** Options of the ambient dust. */
export interface DustMaterialOptions extends ArchiveMaterialOptions {
  /** Base size of a mote in pixels. */
  size?: number
  /** Speed of the drift. */
  speed?: number
}

/** Options of the empty-state halo. */
export interface EmptyHaloMaterialOptions extends ArchiveMaterialOptions {
  /** Phase of the breath. */
  phase?: number
}

function resolveQuality(quality: ArchiveQuality | undefined): ArchiveQuality {
  return quality === 'low' ? 'low' : 'high'
}

/**
 * The shared uniforms of the archive, ready to be handed to a material.
 *
 * The three core uniforms (`uTime`, `uFocus`, `uDim`) are the very objects
 * every archive material uses, so the scene drives the whole scene from a
 * single place. `extra` adds per-material uniforms (phase, size, ...);
 * overriding `uTime`/`uFocus`/`uDim` breaks that sharing — do not.
 */
export function archiveUniforms(
  extra?: Record<string, ArchiveUniform<unknown>>,
): ArchiveUniforms {
  const uniforms: Record<string, ArchiveUniform<unknown>> = {
    uTime: shared.uTime,
    uFocus: shared.uFocus,
    uDim: shared.uDim,
  }
  if (extra) {
    for (const key of Object.keys(extra)) uniforms[key] = extra[key]
  }
  return uniforms as ArchiveUniforms
}

/**
 * A uniform bank of its own — the one a scene owns.
 *
 * The default bank of `archiveUniforms` is a module-level singleton: every
 * material that does not bring its own bank joins it. That is convenient for
 * a single archive and wrong for two of them (the clock of the older scene
 * would keep running inside the newer one), so a scene builds its own bank
 * and hands it to every material it creates.
 */
export function createArchiveUniforms(
  extra?: Record<string, ArchiveUniform<unknown>>,
): ArchiveUniforms {
  const uniforms: Record<string, ArchiveUniform<unknown>> = {
    uTime: { value: 0 },
    uFocus: { value: 0 },
    uDim: { value: 1 },
  }
  if (extra) {
    for (const key of Object.keys(extra)) uniforms[key] = extra[key]
  }
  return uniforms as ArchiveUniforms
}

/**
 * The core uniforms of a material: the bank it was given, or the default
 * one. The palette and the quality dials are added by the factory itself.
 */
function coreUniforms(opts: ArchiveMaterialOptions): ArchiveUniforms {
  return opts.uniforms ?? archiveUniforms()
}

/** Whether a uniform value is a point of three's vector type. */
function isVector3(value: unknown): value is Vector3 {
  return (
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    'y' in value &&
    'z' in value
  )
}

/**
 * The point the archive gazes at: the place of the plate the reader is on.
 *
 * The scene owns the point — it puts it into its uniform bank and moves it
 * every frame, so every material of the archive answers the same focus. A
 * material built without such a bank keeps a point of its own, and the
 * accent simply never reaches it.
 */
function focusPointOf(
  core: ArchiveUniforms,
  three: ThreeModule,
): ArchiveUniform<Vector3> {
  const own = core.uFocusPoint
  if (own && isVector3(own.value)) return own as ArchiveUniform<Vector3>
  return { value: new three.Vector3() }
}

/**
 * A fragment plate: a sheet of warm paper standing in the archive.
 *
 * The fresnel rim is the only lit edge, the grain gives the sheet its
 * paper tone and the accent only shows up in the rim while the fragment is
 * focused.
 *
 * The low tier samples the noise once instead of three times and skips the
 * fine grain layer altogether — the branch is uniform, so the hash really is
 * not evaluated. The result is the same picture, a third of the noise work.
 */
export function fragmentMaterial(
  three: ThreeModule,
  opts: FragmentMaterialOptions = {},
): ShaderMaterial {
  const quality = resolveQuality(opts.quality)
  const octaves = OCTAVES[quality]
  const core = coreUniforms(opts)
  const uniforms: ArchiveUniforms = {
    ...core,
    uColorA: { value: new three.Color(opts.colorA ?? PAPER) },
    uColorB: { value: new three.Color(opts.colorB ?? ACCENT) },
    uEdgeColor: { value: new three.Color(opts.edgeColor ?? AMBER) },
    uQuality: { value: quality === 'high' ? 1 : 0 },
    uOctaves: { value: octaves },
    uGrain: { value: opts.grain ?? 0.6 },
    uFresnelPower: { value: opts.fresnelPower ?? 2.4 },
    uOpacity: { value: opts.opacity ?? 0.9 },
    // The paper through-light is the expensive path of the plate: the low
    // tier switches it off instead of computing it and throwing it away.
    uBleed: { value: opts.bleed ?? (quality === 'high' ? BLEED_HIGH : 0) },
    uAccentRest: { value: opts.accentRest ?? ACCENT_REST },
    uFocusPoint: focusPointOf(core, three),
    uFocusRadius: { value: opts.focusRadius ?? PLATE_FOCUS_REACH },
  }
  return new three.ShaderMaterial({
    uniforms,
    vertexShader: fragmentVert,
    fragmentShader: withOctaves(fragmentFrag, octaves),
    transparent: true,
    depthWrite: false,
    side: three.DoubleSide,
  })
}

/**
 * An orbit ring: a quiet line that breathes and carries a travelling
 * highlight. Works on `LineSegments` — the shader needs no normals.
 *
 * The low tier samples the travelling field once instead of three times.
 */
export function ringMaterial(
  three: ThreeModule,
  opts: RingMaterialOptions = {},
): ShaderMaterial {
  const quality = resolveQuality(opts.quality)
  const octaves = OCTAVES[quality]
  const core = coreUniforms(opts)
  const uniforms: ArchiveUniforms = {
    ...core,
    uColorA: { value: new three.Color(opts.colorA ?? STEEL) },
    uColorB: { value: new three.Color(opts.colorB ?? AMBER) },
    uQuality: { value: quality === 'high' ? 1 : 0 },
    uOctaves: { value: octaves },
    uPhase: { value: opts.phase ?? 0 },
    uNoiseScale: { value: opts.noiseScale ?? 1.4 },
    uSpeed: { value: opts.speed ?? 0.25 },
    uOpacity: { value: opts.opacity ?? 0.55 },
    uFocusPoint: focusPointOf(core, three),
    uFocusRadius: { value: opts.focusRadius ?? RING_FOCUS_REACH },
  }
  return new three.ShaderMaterial({
    uniforms,
    vertexShader: ringVert,
    fragmentShader: withOctaves(ringFrag, octaves),
    transparent: true,
    depthWrite: false,
  })
}

/**
 * The vault core: the storage at the centre of the archive.
 *
 * A slowly drifting fresnel rim over an amber pulse. Below half visibility
 * (`uDim < 0.5`) the core is practically gone.
 */
export function vaultMaterial(
  three: ThreeModule,
  opts: VaultMaterialOptions = {},
): ShaderMaterial {
  const quality = resolveQuality(opts.quality)
  const uniforms: ArchiveUniforms = {
    ...coreUniforms(opts),
    uColorA: { value: new three.Color(opts.colorA ?? AMBER) },
    uColorB: { value: new three.Color(opts.colorB ?? AMBER_BRIGHT) },
    uQuality: { value: quality === 'high' ? 1 : 0 },
    uOctaves: { value: OCTAVES[quality] },
    uPulseSpeed: { value: opts.pulseSpeed ?? 1.1 },
    uOpacity: { value: opts.opacity ?? 0.8 },
  }
  return new three.ShaderMaterial({
    uniforms,
    vertexShader: vaultVert,
    fragmentShader: vaultFrag,
    transparent: true,
    depthWrite: false,
    side: three.DoubleSide,
  })
}

/**
 * Ambient dust — a `PointsMaterial` replacement on a shader.
 *
 * The scene **must** set the `aSeed` attribute on the point geometry: it
 * carries the individual phase of every mote. Without it the attribute
 * reads as 0 and the cloud blinks in unison.
 */
export function dustMaterial(
  three: ThreeModule,
  opts: DustMaterialOptions = {},
): ShaderMaterial {
  const quality = resolveQuality(opts.quality)
  const uniforms: ArchiveUniforms = {
    ...coreUniforms(opts),
    uColorA: { value: new three.Color(opts.colorA ?? STEEL_LIGHT) },
    uColorB: { value: new three.Color(opts.colorB ?? AMBER) },
    uQuality: { value: quality === 'high' ? 1 : 0 },
    uOctaves: { value: OCTAVES[quality] },
    uSize: { value: opts.size ?? (quality === 'high' ? 3.2 : 2.4) },
    uSpeed: { value: opts.speed ?? 1 },
    uOpacity: { value: opts.opacity ?? 0.4 },
    // How much of the dust the archive shows: an archive without stories
    // keeps no motes — the space is a lit void, not a swarm.
    uDust: { value: 1 },
  }
  return new three.ShaderMaterial({
    uniforms,
    vertexShader: dustVert,
    fragmentShader: dustFrag,
    transparent: true,
    depthWrite: false,
    blending: three.AdditiveBlending,
  })
}

/**
 * The halo of an empty archive: a soft additive glow behind bare orbits.
 *
 * Purely additive and deliberately slow — an empty archive breathes, it
 * never flashes.
 */
export function emptyHaloMaterial(
  three: ThreeModule,
  opts: EmptyHaloMaterialOptions = {},
): ShaderMaterial {
  const quality = resolveQuality(opts.quality)
  const uniforms: ArchiveUniforms = {
    ...coreUniforms(opts),
    uColorA: { value: new three.Color(opts.colorA ?? AMBER) },
    uColorB: { value: new three.Color(opts.colorB ?? AMBER_BRIGHT) },
    uQuality: { value: quality === 'high' ? 1 : 0 },
    uOctaves: { value: OCTAVES[quality] },
    uPhase: { value: opts.phase ?? 0 },
    uOpacity: { value: opts.opacity ?? 0.16 },
  }
  return new three.ShaderMaterial({
    uniforms,
    vertexShader: emptyHaloVert,
    fragmentShader: emptyHaloFrag,
    transparent: true,
    depthWrite: false,
    blending: three.AdditiveBlending,
    side: three.DoubleSide,
  })
}

/**
 * The texture slots a material may own. The archive materials are fully
 * procedural and never fill a slot — the list exists so a future material
 * that brings a texture cannot leak it.
 */
const TEXTURE_SLOTS = [
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'lightMap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'specularMap',
] as const

/** Whether a value is a three.js texture (it disposes itself). */
function isTexture(value: unknown): value is { isTexture: true; dispose: () => void } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { isTexture?: unknown }).isTexture === true
  )
}

/**
 * Collect the textures of a material — the ones in the uniform bag and the
 * ones in the classic slots. Every texture is collected once, even when two
 * materials share it.
 */
function collectTextures(
  material: { dispose: () => void },
  textures: Set<{ dispose: () => void }>,
): void {
  const bag = material as unknown as {
    uniforms?: Record<string, { value?: unknown }>
    [slot: string]: unknown
  }
  if (bag.uniforms) {
    for (const key of Object.keys(bag.uniforms)) {
      const value = bag.uniforms[key]?.value
      if (isTexture(value)) textures.add(value)
    }
  }
  for (const slot of TEXTURE_SLOTS) {
    const value = bag[slot]
    if (isTexture(value)) textures.add(value)
  }
}

/**
 * Dispose a batch of archive materials.
 *
 * Materials are cheap but they hold GPU programs — a scene that rebuilds
 * its fragments has to give them back. Every texture a material owns goes
 * with it (once, even when two materials share one).
 *
 * The list may be any iterable — the scene hands over the set of the
 * materials it tracked, so nothing has to be copied first.
 */
export function disposeArchiveMaterials(
  materials: Iterable<{ dispose: () => void } | null | undefined>,
): void {
  const textures = new Set<{ dispose: () => void }>()
  for (const material of materials) {
    if (!material) continue
    try {
      material.dispose()
    } catch {
      /* already disposed */
    }
    try {
      collectTextures(material, textures)
    } catch {
      /* a material without a uniform bag is fine */
    }
  }
  for (const texture of textures) {
    try {
      texture.dispose()
    } catch {
      /* already disposed */
    }
  }
}
