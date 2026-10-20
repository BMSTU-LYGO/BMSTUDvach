import type { Color, ShaderMaterial } from 'three'

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
 *    the whole archive from one place — see `archiveUniforms`.
 * 2. **GLSL ES 1.00 only.** The shaders avoid `texture()`, `invert()` and
 *    anything else WebGL1 does not guarantee, and they use `gl_FragColor`.
 *    Quality tiers are baked into the source (no `#define`), so every tier
 *    compiles as plain GLSL.
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
 * The shared uniform bank. Every factory wires these very objects into its
 * materials, so writing `shared.uTime.value = t` moves the whole archive.
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

  void main() {
    vUv = uv;
    vLocal = position;
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
  uniform float uQuality;
  uniform float uOctaves;
  uniform float uGrain;
  uniform float uFresnelPower;
  uniform float uOpacity;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying vec3 vLocal;

  ${noiseChunk}

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 n = normalize(vNormal);
    // The fresnel rim is the only place light may live.
    float fresnel = pow(1.0 - abs(dot(viewDir, n)), uFresnelPower);

    // Warm paper grain over the local plate position: the high tier stacks
    // the octaves, the low tier keeps a single layer.
    vec2 gp = vLocal.xy * 3.4 + vec2(vLocal.z * 1.7, vLocal.z * 0.9);
    float coarse = mix(valueNoise(gp), fbm(gp), uQuality);
    float fine = hash21(floor(vUv * 320.0)) * step(1.5, uOctaves);
    float grain = clamp((coarse * 0.7 + fine * 0.3) * uGrain, 0.0, 1.0);

    vec3 paper = uColorA;
    vec3 base = mix(paper, paper * 0.38, grain);

    // Focus: the accent lights the very edge of the plate, nothing else.
    float edge = smoothstep(0.30, 1.0, fresnel);
    float focus = clamp(uFocus, 0.0, 1.0) * (0.86 + 0.14 * sin(uTime * 1.6));
    vec3 color = mix(base, uColorB, edge * focus * 0.92);

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

  void main() {
    vLocal = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vDepth = clamp((-mvPosition.z) / 40.0, 0.0, 1.0);
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

  varying vec3 vLocal;
  varying float vDepth;

  ${noiseChunk}

  void main() {
    // A slow breath of brightness.
    float breath = 0.68 + 0.32 * sin(uTime * 0.8 + uPhase);

    // Running noise: a scrolling field sampled on a fixed projection of the
    // local position, so the highlight travels along the orbit whatever
    // plane the ring was built in.
    vec2 np = vec2(vLocal.x + vLocal.z * 0.61, vLocal.y - vLocal.z * 0.43);
    vec2 q = np * uNoiseScale + vec2(uTime * uSpeed, uTime * uSpeed * 0.6);
    float n = mix(valueNoise(q), fbm(q), uQuality);
    float travel = 0.55 + 0.45 * n;

    vec3 color = mix(uColorA, uColorB, clamp(uFocus, 0.0, 1.0) * 0.9);
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
    pos.x += sin(uTime * (0.12 + uSpeed * 0.18) + s * 6.2831) * 0.28;
    pos.y += cos(uTime * (0.09 + uSpeed * 0.14) + s * 4.1) * 0.2;
    pos.z += sin(uTime * (0.07 + uSpeed * 0.11) + s * 9.7) * 0.14;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float dist = length(mvPosition.xyz);
    vFlicker =
      (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 1.7 + s * 12.566))) *
      (1.0 - smoothstep(5.0, 42.0, dist));

    // The low tier keeps every mote the same size.
    float size = mix(1.0, 0.7 + 0.6 * fract(s * 7.31), uQuality);
    gl_PointSize = uSize * size * (1.0 + 0.18 * sin(uTime * 0.9 + s * 6.28));
    gl_Position = projectionMatrix * mvPosition;
  }
`

/** Ambient dust — fragment stage: a soft additive mote. */
const dustFrag = /* glsl */ `
  uniform float uFocus;
  uniform float uDim;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;

  varying float vFlicker;

  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c);
    if (d > 0.5) discard;
    float soft = 1.0 - smoothstep(0.05, 0.5, d);
    vec3 color = mix(uColorA, uColorB, clamp(uFocus, 0.0, 1.0) * 0.5);
    float alpha = soft * vFlicker * uOpacity * clamp(uDim, 0.0, 1.0);
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
}

/** Options of the fragment plate. */
export interface FragmentMaterialOptions extends ArchiveMaterialOptions {
  /** Strength of the paper grain. */
  grain?: number
  /** Exponent of the fresnel rim. */
  fresnelPower?: number
}

/** Options of an orbit ring. */
export interface RingMaterialOptions extends ArchiveMaterialOptions {
  /** Phase of the breath — give every ring its own offset. */
  phase?: number
  /** Scale of the travelling noise field. */
  noiseScale?: number
  /** Speed of the travelling noise field. */
  speed?: number
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
 * A fragment plate: a sheet of warm paper standing in the archive.
 *
 * The fresnel rim is the only lit edge, the grain gives the sheet its
 * paper tone and the accent only shows up in the rim while the fragment is
 * focused.
 */
export function fragmentMaterial(
  three: ThreeModule,
  opts: FragmentMaterialOptions = {},
): ShaderMaterial {
  const quality = resolveQuality(opts.quality)
  const octaves = OCTAVES[quality]
  const uniforms: ArchiveUniforms = {
    ...archiveUniforms(),
    uColorA: { value: new three.Color(opts.colorA ?? PAPER) },
    uColorB: { value: new three.Color(opts.colorB ?? ACCENT) },
    uQuality: { value: quality === 'high' ? 1 : 0 },
    uOctaves: { value: octaves },
    uGrain: { value: opts.grain ?? 0.6 },
    uFresnelPower: { value: opts.fresnelPower ?? 2.4 },
    uOpacity: { value: opts.opacity ?? 0.9 },
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
 */
export function ringMaterial(
  three: ThreeModule,
  opts: RingMaterialOptions = {},
): ShaderMaterial {
  const quality = resolveQuality(opts.quality)
  const octaves = OCTAVES[quality]
  const uniforms: ArchiveUniforms = {
    ...archiveUniforms(),
    uColorA: { value: new three.Color(opts.colorA ?? STEEL) },
    uColorB: { value: new three.Color(opts.colorB ?? AMBER) },
    uQuality: { value: quality === 'high' ? 1 : 0 },
    uOctaves: { value: octaves },
    uPhase: { value: opts.phase ?? 0 },
    uNoiseScale: { value: opts.noiseScale ?? 1.4 },
    uSpeed: { value: opts.speed ?? 0.25 },
    uOpacity: { value: opts.opacity ?? 0.55 },
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
    ...archiveUniforms(),
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
    ...archiveUniforms(),
    uColorA: { value: new three.Color(opts.colorA ?? STEEL_LIGHT) },
    uColorB: { value: new three.Color(opts.colorB ?? AMBER) },
    uQuality: { value: quality === 'high' ? 1 : 0 },
    uOctaves: { value: OCTAVES[quality] },
    uSize: { value: opts.size ?? (quality === 'high' ? 3.2 : 2.4) },
    uSpeed: { value: opts.speed ?? 1 },
    uOpacity: { value: opts.opacity ?? 0.4 },
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
    ...archiveUniforms(),
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
 * Dispose a batch of archive materials.
 *
 * Materials are cheap but they hold GPU programs — a scene that rebuilds
 * its fragments has to give them back.
 */
export function disposeArchiveMaterials(
  materials: Array<{ dispose: () => void } | null | undefined>,
): void {
  for (const material of materials) {
    if (!material) continue
    try {
      material.dispose()
    } catch {
      /* already disposed */
    }
  }
}
