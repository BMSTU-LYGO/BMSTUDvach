import type {
  BufferGeometry,
  Intersection,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
} from 'three'

import {
  archiveLayout,
  hashId,
  type LayoutInputStory,
  type LayoutOptions,
} from '@/three/archive/layout'
import {
  createArchiveUniforms,
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
 * The module is deliberately free of Vue: it builds a scene graph, drives a
 * small camera rig (idle orbit, focus, travel), answers what lies under the
 * pointer and disposes everything it owns.
 *
 * Everything is deterministic: the same set of stories always produces the
 * same archive, and the dust is seeded by a hash instead of `Math.random`.
 *
 * ## The budget of the scene
 *
 * The archive is a background of a page that also has to read well, so it
 * stays inside a fixed budget:
 *
 * - **One geometry and one material for every plate.** Sixty plates cost
 *   sixty draw calls, but they share a single `BufferGeometry` and a single
 *   `ShaderMaterial` — the GPU uploads the plate once, no matter how many
 *   stories the archive holds.
 * - **Sixty fragments.** The cap is a hard one (`DEFAULT_MAX_FRAGMENTS`);
 *   the stories beyond it keep their place in the DOM list, only the plates
 *   are capped.
 * - **The orbits are cached.** A rebuild of the archive (a new story set)
 *   reuses the geometry of a radius and the material of a ring index
 *   instead of building a new torus every time.
 * - **The frame allocates nothing.** The plates drift, the orbits turn and
 *   the camera moves over preallocated buffers; the raycast reuses its hit
 *   list and runs on a throttle.
 * - **The low tier keeps the composition.** Same rings, same plates, same
 *   core — only the segments, the motes of the dust and the noise samples
 *   of the shaders are cheaper.
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

/** The travel of the camera towards a story — the view animates with it. */
export interface ArchiveOpenResult {
  /** The story the camera travels to. */
  id: number
  /** Where the camera stands when the story is opened. */
  from: { x: number; y: number; z: number }
  /** Where the camera ends up. */
  to: { x: number; y: number; z: number }
}

/** The public handle of the archive scene. */
export interface ArchiveSpaceController {
  /** The scene to render. */
  scene: Scene
  /** The camera of the scene. */
  camera: PerspectiveCamera
  /** Replace the stories of the archive — rings and plates are rebuilt. */
  setStories(stories: ArchiveStoryRef[]): void
  /** Advance the scene by `dt` seconds. */
  update(dt: number, snap: ArchiveSpaceSnapshot): void
  /** Release every geometry, material and object the scene owns. */
  dispose(): void
  /** Choose the focused fragment — the camera does not move on its own. */
  focus(id: number | null): void
  /** Fly the camera to the focused fragment. */
  travelToFocus(durationMs?: number): void
  /** Drop the focus and fly back to the idle orbit. */
  releaseFocus(): void
  /** The pointer of the user in NDC — the same contract `network.ts` uses. */
  setPointer(ndcX: number, ndcY: number): void
  /** The story under the pointer, or `null` when the pointer hits nothing. */
  pointerStoryId(): number | null
  /** Focus a story and fly to it — returns the two ends of the travel. */
  openStory(id: number): ArchiveOpenResult | null
  /** Drift the camera by hand (a drag) — no OrbitControls involved. */
  orbitBy(dx: number, dy: number): void
}

/** Options of the archive space. */
export interface ArchiveSpaceOptions {
  /** Hard cap on the number of fragments (default 60). */
  maxFragments?: number
  /** Extra layout knobs (radii, spacing) forwarded to the pure layout. */
  layout?: LayoutOptions
  /** Force the reduced motion mode on (the snapshot can ask for it too). */
  reducedMotion?: boolean
}

/** Radii of the bare orbits an empty archive keeps alive. */
const DUTY_RING_RADII = [3.0, 4.8, 6.6]
/** Tube thickness of an orbit. */
const RING_TUBE = 0.035
/** Segments along an orbit — the low tier keeps it coarse. */
const RING_SEGMENTS_HIGH = 96
const RING_SEGMENTS_LOW = 40
/** Segments around the cross-section of an orbit. */
const RING_RADIAL_SEGMENTS_HIGH = 6
const RING_RADIAL_SEGMENTS_LOW = 4
/** Size of a story plate. */
const FRAGMENT_WIDTH = 0.85
const FRAGMENT_HEIGHT = 1.1
/** Radius of the amber core. */
const VAULT_RADIUS = 1.1
/** Radius of the halo around the core. */
const HALO_RADIUS = 1.4
/** Segments of the halo sphere — the low tier keeps it soft and cheap. */
const HALO_SEGMENTS_HIGH = 20
const HALO_SEGMENTS_LOW = 12
/** Radius of the dust volume. */
const DUST_RADIUS = 8
/** Motes of the dust — the low tier keeps it sparse. */
const DUST_COUNT_HIGH = 200
const DUST_COUNT_LOW = 36
/**
 * The fragment budget of the archive: the scene never places more plates
 * than this, whatever the API returns.
 *
 * Sixty plates of a shared geometry and a shared material are sixty draw
 * calls of a background scene — cheap enough to live next to the text of
 * the page. The stories beyond the cap keep their place in the DOM list.
 */
const DEFAULT_MAX_FRAGMENTS = 60
/** Focus amount of the materials while a story is focused. */
const FOCUS_AMOUNT = 0.9
/** Amplitude of the vertical drift of a plate. */
const FRAGMENT_DRIFT = 0.35
/**
 * How much slower an empty archive drifts.
 *
 * A space without stories is a lit void: it breathes, but it does not turn
 * like a show.
 */
const EMPTY_DRIFT = 0.45

/** Idle orbit of the camera: radius and height of the platinum preset. */
const ORBIT_RADIUS = 12.5
const ORBIT_HEIGHT = 2.2
/** Idle orbit speed in radians per second — a drift, not a spin. */
const ORBIT_SPEED = 0.05
/** Vertical bob of the idle orbit (amplitude / speed). */
const ORBIT_BOB = 0.5
const ORBIT_BOB_SPEED = 0.1
/** Limits of the manual drag. */
const ORBIT_MIN_HEIGHT = -1.5
const ORBIT_MAX_HEIGHT = 6
/** Sensitivity of the manual drag (radians per pixel / units per pixel). */
const ORBIT_DRAG_AZIMUTH = 0.005
const ORBIT_DRAG_HEIGHT = 0.01
/** Default duration of a camera travel, in milliseconds. */
const TRAVEL_DURATION_MS = 650
/** How far the camera parks from the focused plate. */
const FOCUS_DISTANCE = 2.6
/** How much above the focused plate the camera parks. */
const FOCUS_LIFT = 0.6
/** A raycast happens at most every N frames (the pointer change breaks it). */
const RAYCAST_INTERVAL = 3
/** A new hover is published only after two checks in a row agree. */
const HOVER_CONFIRMATIONS = 2
/**
 * How far outside of the canvas the pointer may be before the raycast is
 * skipped: a pointer that left the canvas cannot reach a plate.
 */
const POINTER_MARGIN = 1.05

/** One orbit of the archive. */
interface RingNode {
  mesh: LineSegments
  /** Geometry of the orbit — swapped when the radius of the ring changes. */
  geometry: BufferGeometry
  /** Material of the orbit — one per ring index (own breath phase). */
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

/** Where the camera stands and what it looks at. */
interface CameraPose {
  x: number
  y: number
  z: number
  /** Look-at point. */
  lx: number
  ly: number
  lz: number
}

/**
 * A deterministic [0, 1) value of an index — the dust and every other
 * procedural detail derive from it, so the scene never changes between two
 * runs of the same build.
 */
function unitOf(index: number, salt: string): number {
  return (hashId(`${index}:${salt}`) % 1000000) / 1000000
}

/** Linear interpolation between two numbers. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Clamp a number into a range. */
function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x))
}

/**
 * The easing of a camera travel — a local copy of the one the transition
 * director uses, so the archive does not depend on the route transitions.
 */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * The edge lines of a solid.
 *
 * `EdgesGeometry` copies the positions into a buffer of its own, so the
 * solid itself never reaches the GPU — it is given back right away instead
 * of waiting for the garbage collector.
 */
function edgesOf(three: ThreeModule, source: BufferGeometry): BufferGeometry {
  const edges = new three.EdgesGeometry(source)
  source.dispose()
  return edges
}

/**
 * Build the archive space.
 *
 * The scene is built around a single `world` group: the orbits, the plates,
 * the core and the dust all live inside it, so the presence fade can scale
 * the whole archive at once. The camera is a small rig of its own: an idle
 * orbit around the core, a focus that frames a single plate and a travel
 * that moves between the two.
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

  // The uniform bank of this scene: one clock, one focus, one dim. It
  // belongs to the scene, so a second archive on the same page never
  // overwrites the clock of the first one.
  //
  // The bank carries the point the archive gazes at as well: the world
  // position of the focused plate. Every material compares it with its own
  // place, so exactly one plate answers the reader — the accent of the
  // archive stays singular.
  const focusPoint = new three.Vector3()
  const uniforms = createArchiveUniforms({
    uFocusPoint: { value: focusPoint },
  })

  // Everything the scene owns is tracked, so `dispose` can give it back —
  // every geometry and every material exactly once.
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
    edgesOf(three, new three.DodecahedronGeometry(VAULT_RADIUS)),
  )
  const vault = new three.LineSegments(
    vaultGeometry,
    keepMaterial(createVaultMaterial(three, { quality, uniforms })),
  )
  vault.name = 'vault'
  world.add(vault)

  const haloGeometry = keepGeometry(
    new three.SphereGeometry(
      HALO_RADIUS,
      high ? HALO_SEGMENTS_HIGH : HALO_SEGMENTS_LOW,
      high ? HALO_SEGMENTS_HIGH : HALO_SEGMENTS_LOW,
    ),
  )
  const haloMaterial = keepMaterial(
    createEmptyHaloMaterial(three, { quality, uniforms }),
  )
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
  dustGeometry.setAttribute(
    'position',
    new three.Float32BufferAttribute(dustPositions, 3),
  )
  dustGeometry.setAttribute('aSeed', new three.Float32BufferAttribute(dustSeeds, 1))
  const dustMaterial = keepMaterial(createDustMaterial(three, { quality, uniforms }))
  const dust = new three.Points(dustGeometry, dustMaterial)
  dust.name = 'archive-dust'
  world.add(dust)

  // --- the plates: one geometry and one material for the whole archive ---
  const fragmentGeometry = keepGeometry(
    new three.PlaneGeometry(FRAGMENT_WIDTH, FRAGMENT_HEIGHT),
  )
  const fragmentMaterial = keepMaterial(
    createFragmentMaterial(three, { quality, uniforms }),
  )

  // --- the orbits: their resources are cached, their nodes are pooled ---
  /**
   * The geometry of an orbit, by radius. A rebuild of the archive reuses
   * the torus of a radius it already built — the ring resources live as
   * long as the scene does, not as long as a story set does.
   */
  const ringGeometries = new Map<string, BufferGeometry>()
  /** The material of an orbit, by ring index (every ring breathes on its own). */
  const ringMaterials = new Map<number, ShaderMaterial>()
  /** The ring nodes — pooled, one per ring slot. */
  const ringPool: RingNode[] = []
  /** The rings that are in the world right now. */
  let rings: RingNode[] = []
  /** The plate meshes — pooled, one per slot. */
  const fragmentPool: Mesh[] = []
  /** The plates of the current story set. */
  let fragments: FragmentNode[] = []
  /** The plates alone — the raycaster never looks at anything else. */
  const fragmentMeshes: Mesh[] = []
  /** The plates by story id — the camera looks a plate up every frame. */
  const fragmentIndex = new Map<number, FragmentNode>()
  let elapsed = 0
  let presence = 0
  /**
   * How much of the dust the archive shows right now: an archive without
   * stories keeps no motes, a full one drifts in the light of the core.
   */
  let dustPresence = 0
  let disposed = false

  // --- the camera rig ----------------------------------------------------
  /**
   * The idle orbit of the camera. It starts at the platinum preset of the
   * network scene (0, 2.2, 12.5), so the camera does not jump when the
   * route changes, and it is re-anchored whenever a travel parks it.
   */
  const orbit = {
    phase: Math.PI / 2,
    radius: ORBIT_RADIUS,
    height: ORBIT_HEIGHT,
    lookY: 0,
  }
  /** The story the archive focuses on. */
  let focusId: number | null = null
  /** The story the camera is parked at (set by a finished focus travel). */
  let holdId: number | null = null
  /** The story a running travel is heading to. */
  let pendingHoldId: number | null = null
  /** The focus the outside world last asked for — the sync gate. */
  let syncedFocus: number | null = null
  /** Whether the motion is reduced (the option or the snapshot can ask). */
  let reducedMotion = opts.reducedMotion === true

  let traveling = false
  let travelElapsed = 0
  let travelDuration = TRAVEL_DURATION_MS / 1000
  const travelFrom: CameraPose = { x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0 }
  const travelTo: CameraPose = { x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0 }
  /** The pose of the camera in the current frame — reused, never allocated. */
  const pose: CameraPose = { x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0 }
  /** The world position of the focused plate. */
  const focusWorld = new three.Vector3()
  /** The point the camera looks at. */
  const lookTarget = new three.Vector3()

  // --- the pointer -------------------------------------------------------
  const pointerNdc = new three.Vector2(999, 999)
  const raycaster = new three.Raycaster()
  /** The hits of the last raycast — the list is reused, never reallocated. */
  const hitBuffer: Intersection[] = []
  /** Whether the pointer moved since the last raycast. */
  let pointerDirty = true
  /** The frame counter of the scene — the raycast is throttled by it. */
  let frameCounter = 0
  /** The hover the outside world sees. */
  let hoveredStory: number | null = null
  /** The hover the raycast is currently confirming. */
  let pendingHover: number | null = null
  /** How many checks in a row confirmed the pending hover. */
  let pendingHoverCount = 0

  /** The geometry of an orbit — built once per radius, kept until dispose. */
  function ringGeometryFor(radius: number): BufferGeometry {
    const key = radius.toFixed(6)
    const cached = ringGeometries.get(key)
    if (cached) return cached
    const source = new three.TorusGeometry(
      radius,
      RING_TUBE,
      high ? RING_RADIAL_SEGMENTS_HIGH : RING_RADIAL_SEGMENTS_LOW,
      high ? RING_SEGMENTS_HIGH : RING_SEGMENTS_LOW,
    )
    const geometry = keepGeometry(edgesOf(three, source))
    ringGeometries.set(key, geometry)
    return geometry
  }

  /** The material of an orbit — one per ring index, kept until dispose. */
  function ringMaterialFor(index: number): ShaderMaterial {
    const cached = ringMaterials.get(index)
    if (cached) return cached
    const material = keepMaterial(
      createRingMaterial(three, { quality, phase: index * 1.1, uniforms }),
    )
    ringMaterials.set(index, material)
    return material
  }

  /** The node of an orbit — pooled, so a rebuild allocates no object. */
  function ringNode(index: number, radius: number): RingNode {
    const geometry = ringGeometryFor(radius)
    const material = ringMaterialFor(index)
    const pooled = ringPool[index]
    if (pooled) {
      pooled.geometry = geometry
      pooled.material = material
      pooled.mesh.geometry = geometry
      pooled.mesh.material = material
      return pooled
    }
    const mesh = new three.LineSegments(geometry, material)
    mesh.name = `archive-ring-${index}`
    const node: RingNode = { mesh, geometry, material, spin: 0, dir: 1 }
    ringPool[index] = node
    return node
  }

  /** The mesh of a plate — pooled, so a rebuild allocates no object. */
  function fragmentMesh(index: number): Mesh {
    const pooled = fragmentPool[index]
    if (pooled) return pooled
    const mesh = new three.Mesh(fragmentGeometry, fragmentMaterial)
    fragmentPool[index] = mesh
    return mesh
  }

  /** Take the orbits of the previous story set out of the world. */
  function detachRings(): void {
    for (let i = 0; i < rings.length; i++) world.remove(rings[i].mesh)
    rings = []
  }

  /** Take the plates of the previous story set out of the world. */
  function detachFragments(): void {
    for (let i = 0; i < fragments.length; i++) world.remove(fragments[i].mesh)
    fragments = []
    fragmentMeshes.length = 0
    fragmentIndex.clear()
  }

  /** The plate of a story, if the archive holds it. */
  function fragmentById(id: number | null): FragmentNode | undefined {
    if (id == null) return undefined
    return fragmentIndex.get(id)
  }

  /**
   * Rebuild the archive for a set of stories.
   *
   * The orbits follow the epochs of the layout; an empty archive keeps three
   * bare orbits alive so the space never looks broken, and lights the halo
   * around the core.
   *
   * A rebuild allocates no three.js object: the rings and the plates come
   * out of their pools, the ring resources come out of their cache.
   */
  function setStories(stories: ArchiveStoryRef[]): void {
    if (disposed) return
    detachRings()
    detachFragments()

    const layoutStories: LayoutInputStory[] = (stories ?? []).map((story) => ({
      id: story.id,
      sourceType: story.sourceType ?? undefined,
      year: story.year ?? undefined,
    }))
    const layoutOptions: LayoutOptions = {
      maxFragments: opts.maxFragments ?? DEFAULT_MAX_FRAGMENTS,
      ...opts.layout,
    }

    // One pass, one normalisation: the rings and the plates come from the
    // same layout, so the archive never places a plate on a ring it did
    // not build.
    const layout = archiveLayout(layoutStories, layoutOptions)
    const radii = layout.rings.length
      ? layout.rings.map((ring) => ring.radius)
      : DUTY_RING_RADII
    for (let index = 0; index < radii.length; index++) {
      const radius = radii[index]
      const node = ringNode(index, radius)
      node.mesh.rotation.x = Math.PI / 2 + (index - 1) * 0.3
      node.mesh.rotation.z = 0.12 * (index - 1)
      node.spin = 0.05 + radius * 0.008
      node.dir = index % 2 ? -1 : 1
      world.add(node.mesh)
      rings.push(node)
    }

    for (let index = 0; index < layout.placements.length; index++) {
      const placement = layout.placements[index]
      const mesh = fragmentMesh(index)
      mesh.position.set(placement.x, placement.y, placement.z)
      mesh.rotation.set(0, placement.angle, placement.tilt)
      mesh.scale.setScalar(placement.scale)
      mesh.userData.storyId = placement.id
      mesh.name = `archive-fragment-${placement.id}`
      world.add(mesh)
      const node: FragmentNode = {
        mesh,
        id: placement.id,
        baseY: placement.y,
        angle: placement.angle,
      }
      fragments.push(node)
      fragmentMeshes.push(mesh)
      fragmentIndex.set(placement.id, node)
    }

    // An empty archive is a lit, breathing space — not a void.
    haloDim.value = layoutStories.length === 0 ? 1 : 0
  }

  // --- the camera --------------------------------------------------------

  /**
   * The idle pose of the camera: the orbit of the archive, with the slow
   * vertical bob on top of it.
   */
  function idlePose(out: CameraPose): CameraPose {
    out.x = Math.cos(orbit.phase) * orbit.radius
    out.z = Math.sin(orbit.phase) * orbit.radius
    out.y = orbit.height + Math.sin(elapsed * ORBIT_BOB_SPEED) * ORBIT_BOB
    out.lx = 0
    out.ly = orbit.lookY
    out.lz = 0
    return out
  }

  /**
   * The pose that frames a single plate: the camera parks outside of it, on
   * the ray from the core through the plate, a little above.
   */
  function focusPose(fragment: FragmentNode, out: CameraPose): CameraPose {
    // The plate drifts, so the pose is derived from its live world position.
    fragment.mesh.getWorldPosition(focusWorld)
    const radial = Math.hypot(focusWorld.x, focusWorld.z)
    const nx = radial > 1e-4 ? focusWorld.x / radial : 0
    const nz = radial > 1e-4 ? focusWorld.z / radial : 1
    out.x = focusWorld.x + nx * FOCUS_DISTANCE
    out.y = focusWorld.y + FOCUS_LIFT
    out.z = focusWorld.z + nz * FOCUS_DISTANCE
    out.lx = focusWorld.x
    out.ly = focusWorld.y
    out.lz = focusWorld.z
    return out
  }

  /**
   * Re-anchor the idle orbit on the pose the camera currently holds, so the
   * orbit continues from there instead of snapping to a point of the circle.
   */
  function reanchorOrbit(): void {
    orbit.phase = Math.atan2(camera.position.z, camera.position.x)
    orbit.radius = Math.hypot(camera.position.x, camera.position.z)
    orbit.height = camera.position.y - Math.sin(elapsed * ORBIT_BOB_SPEED) * ORBIT_BOB
  }

  /** Put the camera on a pose and point it at the look-at of the pose. */
  function applyPose(target: CameraPose): void {
    camera.position.set(target.x, target.y, target.z)
    lookTarget.set(target.lx, target.ly, target.lz)
    camera.lookAt(lookTarget)
  }

  /** Start a travel from where the camera stands to a pose. */
  function startTravel(target: CameraPose, durationMs: number): void {
    travelFrom.x = camera.position.x
    travelFrom.y = camera.position.y
    travelFrom.z = camera.position.z
    travelFrom.lx = lookTarget.x
    travelFrom.ly = lookTarget.y
    travelFrom.lz = lookTarget.z
    travelTo.x = target.x
    travelTo.y = target.y
    travelTo.z = target.z
    travelTo.lx = target.lx
    travelTo.ly = target.ly
    travelTo.lz = target.lz
    travelDuration = Math.max(0.001, durationMs / 1000)
    travelElapsed = 0
    traveling = true
  }

  /**
   * Choose the focused fragment. The camera stays where it is — only an
   * explicit `travelToFocus` moves it.
   */
  function focus(id: number | null): void {
    if (disposed) return
    focusId = id != null && Number.isFinite(id) ? id : null
  }

  /**
   * Fly the camera to the focused plate and park in front of it. Under
   * reduced motion the travel lands in a single frame.
   */
  function travelToFocus(durationMs: number = TRAVEL_DURATION_MS): void {
    if (disposed) return
    const fragment = fragmentById(focusId)
    if (!fragment) return
    const target = focusPose(fragment, pose)
    pendingHoldId = fragment.id
    startTravel(target, durationMs)
    if (reducedMotion) {
      // No travel at all: the camera is there in the next frame.
      traveling = false
      pendingHoldId = null
      holdId = fragment.id
      applyPose(target)
    }
  }

  /**
   * Drop the focus and fly back to the idle orbit of the current phase.
   */
  function releaseFocus(): void {
    if (disposed) return
    focusId = null
    holdId = null
    pendingHoldId = null
    startTravel(idlePose(pose), TRAVEL_DURATION_MS)
    if (reducedMotion) {
      traveling = false
      applyPose(pose)
    }
  }

  /**
   * Focus a story and fly to it. The two ends of the travel are returned so
   * the view can animate the story in along with the camera.
   */
  function openStory(id: number): ArchiveOpenResult | null {
    if (disposed) return null
    const fragment = fragmentById(id)
    if (!fragment) return null
    const from = {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    }
    focus(id)
    travelToFocus()
    const target = focusPose(fragment, pose)
    return {
      id,
      from,
      to: { x: target.x, y: target.y, z: target.z },
    }
  }

  /**
   * Drift the camera by hand. A travel wins over the drag: the camera is
   * on its way somewhere and a drag would fight it.
   */
  function orbitBy(dx: number, dy: number): void {
    if (disposed || traveling) return
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
    // The deltas are applied to the orbit itself, so the camera glides to
    // the new azimuth instead of teleporting — the idle orbit damps the
    // step over the following frames.
    orbit.phase += dx * ORBIT_DRAG_AZIMUTH
    orbit.height = clamp(
      orbit.height + dy * ORBIT_DRAG_HEIGHT,
      ORBIT_MIN_HEIGHT,
      ORBIT_MAX_HEIGHT,
    )
  }

  /** The pointer of the user in NDC — the same contract `network.ts` uses. */
  function setPointer(ndcX: number, ndcY: number): void {
    if (disposed) return
    if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return
    if (pointerNdc.x === ndcX && pointerNdc.y === ndcY) return
    pointerNdc.set(ndcX, ndcY)
    pointerDirty = true
  }

  /** The story under the pointer, or `null` when the pointer hits nothing. */
  function pointerStoryId(): number | null {
    return hoveredStory
  }

  /**
   * Look for a plate under the pointer.
   *
   * The raycast is throttled — it runs when the pointer moved or every few
   * frames — and a new hover is published only after two checks in a row
   * agree, so the pointer does not flicker on the edge of a plate. The hit
   * list is reused, so a check allocates nothing but the hit records
   * themselves.
   */
  function updatePointer(): void {
    frameCounter += 1
    if (!pointerDirty && frameCounter % RAYCAST_INTERVAL !== 0) return
    pointerDirty = false

    if (fragmentMeshes.length === 0) {
      if (hoveredStory !== null) {
        hoveredStory = null
        pendingHover = null
        pendingHoverCount = 0
      }
      return
    }

    // A pointer that left the canvas cannot reach a plate: no ray needed.
    if (
      pointerNdc.x < -POINTER_MARGIN ||
      pointerNdc.x > POINTER_MARGIN ||
      pointerNdc.y < -POINTER_MARGIN ||
      pointerNdc.y > POINTER_MARGIN
    ) {
      if (hoveredStory !== null) {
        hoveredStory = null
        pendingHover = null
        pendingHoverCount = 0
      }
      return
    }

    // The camera and the plates moved — the ray needs their fresh matrices.
    camera.updateMatrixWorld()
    scene.updateMatrixWorld(true)
    raycaster.setFromCamera(pointerNdc, camera)
    hitBuffer.length = 0
    raycaster.intersectObjects(fragmentMeshes, false, hitBuffer)

    let hitId: number | null = null
    for (let i = 0; i < hitBuffer.length; i++) {
      const hit = hitBuffer[i]
      if (!hit.object.visible) continue
      const id = hit.object.userData.storyId
      if (typeof id === 'number') {
        hitId = id
        break
      }
    }
    hitBuffer.length = 0

    if (hitId === hoveredStory) {
      pendingHover = null
      pendingHoverCount = 0
      return
    }
    if (pendingHover === hitId) {
      pendingHoverCount += 1
    } else {
      pendingHover = hitId
      pendingHoverCount = 1
    }
    if (pendingHoverCount >= HOVER_CONFIRMATIONS) {
      hoveredStory = hitId
      pendingHover = null
      pendingHoverCount = 0
    }
  }

  /**
   * Drive the camera for one frame: it either travels, holds the plate it
   * flew to, or drifts around the archive.
   */
  function updateCamera(step: number): void {
    if (traveling) {
      travelElapsed += step
      const t = Math.min(1, travelElapsed / travelDuration)
      const eased = easeInOutCubic(t)
      // A travel towards a plate follows the plate while it drifts.
      const held = fragmentById(pendingHoldId)
      if (held) focusPose(held, travelTo)
      camera.position.x = lerp(travelFrom.x, travelTo.x, eased)
      camera.position.y = lerp(travelFrom.y, travelTo.y, eased)
      camera.position.z = lerp(travelFrom.z, travelTo.z, eased)
      lookTarget.set(
        lerp(travelFrom.lx, travelTo.lx, eased),
        lerp(travelFrom.ly, travelTo.ly, eased),
        lerp(travelFrom.lz, travelTo.lz, eased),
      )
      camera.lookAt(lookTarget)
      if (t >= 1) {
        traveling = false
        camera.position.set(travelTo.x, travelTo.y, travelTo.z)
        lookTarget.set(travelTo.lx, travelTo.ly, travelTo.lz)
        camera.lookAt(lookTarget)
        if (pendingHoldId !== null) {
          // The camera stays with the plate it travelled to.
          holdId = pendingHoldId
          pendingHoldId = null
        } else {
          reanchorOrbit()
        }
      }
      return
    }

    const held = holdId !== null ? fragmentById(holdId) : undefined
    if (held) {
      // The camera holds the plate it flew to and follows its drift.
      focusPose(held, pose)
      applyPose(pose)
      return
    }

    if (holdId !== null) {
      // The plate the camera held is gone (the story set changed) — the
      // camera glides back to the idle orbit instead of standing still.
      holdId = null
      pendingHoldId = null
      startTravel(idlePose(pose), TRAVEL_DURATION_MS)
      if (reducedMotion) {
        traveling = false
        applyPose(pose)
      }
      return
    }
    if (reducedMotion) return
    // The idle orbit: the archive turns around the camera. An archive
    // without stories drifts slower — a lit void, not a show.
    orbit.phase += step * ORBIT_SPEED * (fragments.length ? 1 : EMPTY_DRIFT)
    idlePose(pose)
    applyPose(pose)
  }

  /**
   * Advance the scene.
   *
   * The frame does no allocation: the plates drift along their own phase,
   * the orbits turn around the core, the halo breathes and the camera
   * either orbits, holds a focus or travels between the two. The loops walk
   * the arrays by index — an iterator would be garbage of its own.
   */
  function update(dt: number, snap: ArchiveSpaceSnapshot): void {
    if (disposed) return
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0
    reducedMotion = opts.reducedMotion === true || snap.reducedMotion === true
    // Under reduced motion the clock of the shaders stops: the archive keeps
    // its last frame instead of breathing — the static equivalent of every
    // animation of the scene.
    if (!reducedMotion) elapsed += step

    // The presence fades the archive in from the very first frame.
    presence += (1 - presence) * Math.min(1, step * 2)
    uniforms.uTime.value = elapsed
    uniforms.uDim.value = presence
    uniforms.uFocus.value = snap.focusedStory != null ? FOCUS_AMOUNT : 0
    // The presence scales the archive as a whole — the plates keep their own
    // scale factor untouched.
    world.scale.setScalar(0.9 + 0.1 * presence)

    // The focus of the outside world is followed, but only when it really
    // changed — a local `focus` must not be undone by a repeated snapshot.
    if (snap.focusedStory !== syncedFocus) {
      syncedFocus = snap.focusedStory
      focusId = snap.focusedStory
    }

    if (!reducedMotion) {
      for (let i = 0; i < rings.length; i++) {
        const ring = rings[i]
        ring.mesh.rotation.z += step * ring.spin * ring.dir
      }
      for (let i = 0; i < fragments.length; i++) {
        const fragment = fragments[i]
        fragment.mesh.position.y =
          fragment.baseY + Math.sin(elapsed * 0.6 + fragment.angle * 3) * FRAGMENT_DRIFT
      }
      haloMesh.scale.setScalar(1 + Math.sin(elapsed * 0.9) * 0.04)
    }

    // The point the archive gazes at follows the focused plate: the amber
    // of the archive lights the sheet the reader is on, not the whole
    // archive. Without a focus the point falls back to the core, where
    // no plate can reach it.
    const focused = fragmentById(focusId)
    if (focused) focused.mesh.getWorldPosition(focusPoint)
    else focusPoint.set(0, 0, 0)

    // An archive without stories keeps no dust: the space is a lit void
    // that drifts slowly, not a swarm of motes around nothing.
    const dustTarget = fragments.length ? 1 : 0
    dustPresence += (dustTarget - dustPresence) * Math.min(1, step * 2)
    dustMaterial.uniforms.uDust.value = dustPresence

    updateCamera(step)

    // The pointer keeps working even when the motion is reduced.
    updatePointer()
  }

  /** Give every geometry, material and object back to the GPU. */
  function dispose(): void {
    if (disposed) return
    disposed = true

    scene.remove(world)
    detachRings()
    detachFragments()
    // The pooled nodes leave the world as well — a node that is not
    // attached any more is simply ignored by `remove`.
    for (let i = 0; i < ringPool.length; i++) {
      const node = ringPool[i]
      if (node) world.remove(node.mesh)
    }
    for (let i = 0; i < fragmentPool.length; i++) {
      const mesh = fragmentPool[i]
      if (mesh) world.remove(mesh)
    }

    // Every material and every geometry is given back exactly once: the
    // sets hold each of them a single time, and the flag above keeps a
    // second `dispose` from running this block again.
    disposeArchiveMaterials(materials)
    materials.clear()
    for (const geometry of geometries) geometry.dispose()
    geometries.clear()
    ringGeometries.clear()
    ringMaterials.clear()

    rings = []
    fragments = []
    ringPool.length = 0
    fragmentPool.length = 0
    fragmentMeshes.length = 0
    fragmentIndex.clear()
    hitBuffer.length = 0

    // The camera rig keeps no resources of its own — only its state.
    traveling = false
    travelElapsed = 0
    pendingHoldId = null
    holdId = null
    focusId = null
    syncedFocus = null
    hoveredStory = null
    pendingHover = null
    pendingHoverCount = 0
    pointerDirty = true
  }

  // The archive starts empty: three bare orbits and the lit halo.
  setStories([])

  return {
    scene,
    camera,
    setStories,
    update,
    dispose,
    focus,
    travelToFocus,
    releaseFocus,
    setPointer,
    pointerStoryId,
    openStory,
    orbitBy,
  }
}
