import type {
  BufferGeometry,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
} from 'three'

import {
  hashId,
  placeFragments,
  ringsFor,
  type LayoutInputStory,
  type LayoutOptions,
} from '@/three/archive/layout'
import {
  archiveUniforms,
  disposeArchiveMaterials,
  dustMaterial as createDustMaterial,
  emptyHaloMaterial as createEmptyHaloMaterial,
  fragmentMaterial as createFragmentMaterial,
  ringMaterial as createRingMaterial,
  vaultMaterial as createVaultMaterial,
  type ArchiveQuality,
} from '@/three/archive/materials'
import type { ArchiveStoryRef } from '@/three/sceneState'

/**
 * The `three` namespace as a type-only dependency: the scene hands the
 * module in, so this file never pulls `three` in at runtime — the same
 * contract `src/three/network.ts` uses.
 */
type ThreeModule = typeof import('three')

/**
 * The archive space of the platinum section: a self-contained three.js
 * scene that turns a list of stories into a spatial structure — epoch rings
 * of orbits, one paper plate per story, an amber core and ambient dust.
 *
 * The module is deliberately free of Vue, of raycasting and of any input
 * handling: it builds a scene graph, updates it and disposes it. The camera
 * rig, the pointer and the travel between stories arrive with the next
 * revision of this file.
 *
 * Everything is deterministic: the same set of stories always produces the
 * same archive, and the dust is seeded by a hash instead of `Math.random`.
 */

/** A snapshot of the archive state the scene has to reflect. */
export interface ArchiveSpaceSnapshot {
  /** Stories currently placed in the archive. */
  stories: ArchiveStoryRef[]
  /** Story the archive focuses on (null = free orbit). */
  focusedStory: number | null
  /** Story the user opened (null = nothing opened). */
  selectedStory: number | null
  /** The user asked for reduced motion — the scene stops moving. */
  reducedMotion: boolean
}

/** The public handle of the archive scene. */
export interface ArchiveSpaceController {
  /** The scene to render. */
  scene: Scene
  /** The camera of the scene (a static rig until the travel lands). */
  camera: PerspectiveCamera
  /** Replace the stories of the archive — rings and plates are rebuilt. */
  setStories(stories: ArchiveStoryRef[]): void
  /** Advance the scene by `dt` seconds. */
  update(dt: number, snap: ArchiveSpaceSnapshot): void
  /** Release every geometry, material and object the scene owns. */
  dispose(): void
}

/** Options of the archive space. */
export interface ArchiveSpaceOptions {
  /** Hard cap on the number of fragments (default 60). */
  maxFragments?: number
  /** Extra layout knobs (radii, spacing) forwarded to the pure layout. */
  layout?: LayoutOptions
}

/** Radii of the bare orbits an empty archive keeps alive. */
const DUTY_RING_RADII = [3.0, 4.8, 6.6]
/** Tube thickness of an orbit. */
const RING_TUBE = 0.035
/** Radial segments of an orbit — the low tier keeps it cheap. */
const RING_SEGMENTS_HIGH = 96
const RING_SEGMENTS_LOW = 40
/** Size of a story plate. */
const FRAGMENT_WIDTH = 0.85
const FRAGMENT_HEIGHT = 1.1
/** Radius of the amber core. */
const VAULT_RADIUS = 1.1
/** Radius of the halo around the core. */
const HALO_RADIUS = 1.4
/** Radius of the dust volume. */
const DUST_RADIUS = 8
/** Motes of the dust — the low tier keeps it sparse. */
const DUST_COUNT_HIGH = 200
const DUST_COUNT_LOW = 60
/** Default fragment budget. */
const DEFAULT_MAX_FRAGMENTS = 60
/** Focus amount of the materials while a story is focused. */
const FOCUS_AMOUNT = 0.9
/** Amplitude of the vertical drift of a plate. */
const FRAGMENT_DRIFT = 0.35

/** One orbit of the archive. */
interface RingNode {
  mesh: LineSegments
  geometry: BufferGeometry
  material: ShaderMaterial
  /** Rotation speed, radians per second. */
  spin: number
  /** Direction of the rotation. */
  dir: number
}

/** One story plate of the archive. */
interface FragmentNode {
  mesh: Mesh
  /** Story the plate belongs to. */
  id: number
  /** Height the plate drifts around. */
  baseY: number
  /** Angle of the plate — the phase of its drift. */
  angle: number
}

/**
 * A deterministic [0, 1) value of an index — the dust and every other
 * procedural detail derive from it, so the scene never changes between two
 * runs of the same build.
 */
function unitOf(index: number, salt: string): number {
  return (hashId(`${index}:${salt}`) % 1000000) / 1000000
}

/**
 * Build the archive space.
 *
 * The scene is built around a single `world` group: the orbits, the plates,
 * the core and the dust all live inside it, so the presence fade can scale
 * the whole archive at once. The camera is a static rig for now.
 */
export function buildArchiveSpace(
  three: ThreeModule,
  quality: ArchiveQuality,
  opts: ArchiveSpaceOptions = {},
): ArchiveSpaceController {
  const high = quality === 'high'

  const scene = new three.Scene()

  const camera = new three.PerspectiveCamera(50, 1, 0.1, 200)
  camera.position.set(0, 2.2, 12.5)
  camera.lookAt(0, 0, 0)

  const world = new three.Group()
  world.name = 'archive-space'
  scene.add(world)

  // The shared uniform bank of the archive: one clock, one focus, one dim.
  const uniforms = archiveUniforms()

  // Everything the scene owns is tracked, so `dispose` can give it back.
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<ShaderMaterial>()
  const keepGeometry = <T extends BufferGeometry>(geometry: T): T => {
    geometries.add(geometry)
    return geometry
  }
  const keepMaterial = <T extends ShaderMaterial>(material: T): T => {
    materials.add(material)
    return material
  }

  // --- the core: an amber vault inside a soft halo -----------------------
  const vaultGeometry = keepGeometry(
    new three.EdgesGeometry(new three.DodecahedronGeometry(VAULT_RADIUS)),
  )
  const vault = new three.LineSegments(vaultGeometry, keepMaterial(createVaultMaterial(three, { quality })))
  vault.name = 'vault'
  world.add(vault)

  const haloGeometry = keepGeometry(new three.SphereGeometry(HALO_RADIUS, 20, 20))
  const haloMaterial = keepMaterial(createEmptyHaloMaterial(three, { quality }))
  // The halo owns its visibility: it is the light of an *empty* archive and
  // must not follow the presence fade of the rest of the scene.
  const haloDim = { value: 0 }
  haloMaterial.uniforms.uDim = haloDim
  const haloMesh = new three.Mesh(haloGeometry, haloMaterial)
  haloMesh.name = 'archive-halo'
  world.add(haloMesh)

  // --- the dust ----------------------------------------------------------
  const dustCount = high ? DUST_COUNT_HIGH : DUST_COUNT_LOW
  const dustGeometry = keepGeometry(new three.BufferGeometry())
  const dustPositions = new Float32Array(dustCount * 3)
  const dustSeeds = new Float32Array(dustCount)
  for (let i = 0; i < dustCount; i++) {
    // A point of a spherical volume: the radius is cubed, the angles are
    // plain — the motes spread evenly instead of clumping at the core.
    const radius = DUST_RADIUS * Math.cbrt(unitOf(i, 'radius'))
    const theta = unitOf(i, 'theta') * Math.PI * 2
    const cosPhi = unitOf(i, 'phi') * 2 - 1
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi))
    dustPositions[i * 3] = radius * sinPhi * Math.cos(theta)
    dustPositions[i * 3 + 1] = radius * cosPhi
    dustPositions[i * 3 + 2] = radius * sinPhi * Math.sin(theta)
    dustSeeds[i] = unitOf(i, 'seed')
  }
  dustGeometry.setAttribute('position', new three.Float32BufferAttribute(dustPositions, 3))
  dustGeometry.setAttribute('aSeed', new three.Float32BufferAttribute(dustSeeds, 1))
  const dust = new three.Points(dustGeometry, keepMaterial(createDustMaterial(three, { quality })))
  dust.name = 'archive-dust'
  world.add(dust)

  // --- the plates: one geometry and one material for the whole archive ---
  const fragmentGeometry = keepGeometry(new three.PlaneGeometry(FRAGMENT_WIDTH, FRAGMENT_HEIGHT))
  const fragmentMaterial = keepMaterial(createFragmentMaterial(three, { quality }))

  let rings: RingNode[] = []
  let fragments: FragmentNode[] = []
  let elapsed = 0
  let presence = 0
  let disposed = false

  /** Drop the orbits of the previous story set — they belong to it alone. */
  function clearRings(): void {
    for (const ring of rings) {
      world.remove(ring.mesh)
      ring.geometry.dispose()
      ring.material.dispose()
      geometries.delete(ring.geometry)
      materials.delete(ring.material)
    }
    rings = []
  }

  /** Drop the plates of the previous story set — they share the geometry. */
  function clearFragments(): void {
    for (const fragment of fragments) world.remove(fragment.mesh)
    fragments = []
  }

  /**
   * Rebuild the archive for a set of stories.
   *
   * The orbits follow the epochs of the layout; an empty archive keeps three
   * bare orbits alive so the space never looks broken, and lights the halo
   * around the core.
   */
  function setStories(stories: ArchiveStoryRef[]): void {
    if (disposed) return
    clearRings()
    clearFragments()

    const layoutStories: LayoutInputStory[] = (stories ?? []).map((story) => ({
      id: story.id,
      sourceType: story.sourceType ?? undefined,
      year: story.year ?? undefined,
    }))
    const layoutOptions: LayoutOptions = {
      maxFragments: opts.maxFragments ?? DEFAULT_MAX_FRAGMENTS,
      ...opts.layout,
    }

    const epochRings = ringsFor(layoutStories, layoutOptions)
    const radii = epochRings.length ? epochRings.map((ring) => ring.radius) : DUTY_RING_RADII
    radii.forEach((radius, index) => {
      const geometry = keepGeometry(
        new three.EdgesGeometry(
          new three.TorusGeometry(radius, RING_TUBE, 6, high ? RING_SEGMENTS_HIGH : RING_SEGMENTS_LOW),
        ),
      )
      const material = keepMaterial(createRingMaterial(three, { quality, phase: index * 1.1 }))
      const mesh = new three.LineSegments(geometry, material)
      mesh.name = `archive-ring-${index}`
      mesh.rotation.x = Math.PI / 2 + (index - 1) * 0.3
      mesh.rotation.z = 0.12 * (index - 1)
      world.add(mesh)
      rings.push({ mesh, geometry, material, spin: 0.05 + radius * 0.008, dir: index % 2 ? -1 : 1 })
    })

    for (const placement of placeFragments(layoutStories, layoutOptions)) {
      const mesh = new three.Mesh(fragmentGeometry, fragmentMaterial)
      mesh.position.set(placement.x, placement.y, placement.z)
      mesh.rotation.set(0, placement.angle, placement.tilt)
      mesh.scale.setScalar(placement.scale)
      mesh.userData.storyId = placement.id
      mesh.name = `archive-fragment-${placement.id}`
      world.add(mesh)
      fragments.push({ mesh, id: placement.id, baseY: placement.y, angle: placement.angle })
    }

    // An empty archive is a lit, breathing space — not a void.
    haloDim.value = layoutStories.length === 0 ? 1 : 0
  }

  /**
   * Advance the scene.
   *
   * The frame does no allocation: the plates drift along their own phase,
   * the orbits turn around the core and the halo breathes.
   */
  function update(dt: number, snap: ArchiveSpaceSnapshot): void {
    if (disposed) return
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0
    elapsed += step

    // The presence fades the archive in from the very first frame.
    presence += (1 - presence) * Math.min(1, step * 2)
    uniforms.uTime.value = elapsed
    uniforms.uDim.value = presence
    uniforms.uFocus.value = snap.focusedStory != null ? FOCUS_AMOUNT : 0
    // The presence scales the archive as a whole — the plates keep their own
    // scale factor untouched.
    world.scale.setScalar(0.9 + 0.1 * presence)

    if (snap.reducedMotion) return

    for (const ring of rings) {
      ring.mesh.rotation.z += step * ring.spin * ring.dir
    }
    for (const fragment of fragments) {
      fragment.mesh.position.y =
        fragment.baseY + Math.sin(elapsed * 0.6 + fragment.angle * 3) * FRAGMENT_DRIFT
    }
    haloMesh.scale.setScalar(1 + Math.sin(elapsed * 0.9) * 0.04)
  }

  /** Give every geometry, material and object back to the GPU. */
  function dispose(): void {
    if (disposed) return
    disposed = true

    scene.remove(world)
    clearRings()
    clearFragments()

    disposeArchiveMaterials(Array.from(materials))
    materials.clear()
    for (const geometry of geometries) geometry.dispose()
    geometries.clear()
  }

  // The archive starts empty: three bare orbits and the lit halo.
  setStories([])

  return { scene, camera, setStories, update, dispose }
}
