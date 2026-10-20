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
 * The module is deliberately free of Vue: it builds a scene graph, drives a
 * small camera rig (idle orbit, focus, travel), answers what lies under the
 * pointer and disposes everything it owns.
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
  const vault = new three.LineSegments(
    vaultGeometry,
    keepMaterial(createVaultMaterial(three, { quality })),
  )
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
  dustGeometry.setAttribute(
    'position',
    new three.Float32BufferAttribute(dustPositions, 3),
  )
  dustGeometry.setAttribute('aSeed', new three.Float32BufferAttribute(dustSeeds, 1))
  const dust = new three.Points(
    dustGeometry,
    keepMaterial(createDustMaterial(three, { quality })),
  )
  dust.name = 'archive-dust'
  world.add(dust)

  // --- the plates: one geometry and one material for the whole archive ---
  const fragmentGeometry = keepGeometry(
    new three.PlaneGeometry(FRAGMENT_WIDTH, FRAGMENT_HEIGHT),
  )
  const fragmentMaterial = keepMaterial(createFragmentMaterial(three, { quality }))

  let rings: RingNode[] = []
  let fragments: FragmentNode[] = []
  /** The plates alone — the raycaster never looks at anything else. */
  let fragmentMeshes: Mesh[] = []
  /** The plates by story id — the camera looks a plate up every frame. */
  const fragmentIndex = new Map<number, FragmentNode>()
  let elapsed = 0
  let presence = 0
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
    fragmentMeshes = []
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
    const radii = epochRings.length
      ? epochRings.map((ring) => ring.radius)
      : DUTY_RING_RADII
    radii.forEach((radius, index) => {
      const geometry = keepGeometry(
        new three.EdgesGeometry(
          new three.TorusGeometry(
            radius,
            RING_TUBE,
            6,
            high ? RING_SEGMENTS_HIGH : RING_SEGMENTS_LOW,
          ),
        ),
      )
      const material = keepMaterial(
        createRingMaterial(three, { quality, phase: index * 1.1 }),
      )
      const mesh = new three.LineSegments(geometry, material)
      mesh.name = `archive-ring-${index}`
      mesh.rotation.x = Math.PI / 2 + (index - 1) * 0.3
      mesh.rotation.z = 0.12 * (index - 1)
      world.add(mesh)
      rings.push({
        mesh,
        geometry,
        material,
        spin: 0.05 + radius * 0.008,
        dir: index % 2 ? -1 : 1,
      })
    })

    for (const placement of placeFragments(layoutStories, layoutOptions)) {
      const mesh = new three.Mesh(fragmentGeometry, fragmentMaterial)
      mesh.position.set(placement.x, placement.y, placement.z)
      mesh.rotation.set(0, placement.angle, placement.tilt)
      mesh.scale.setScalar(placement.scale)
      mesh.userData.storyId = placement.id
      mesh.name = `archive-fragment-${placement.id}`
      world.add(mesh)
      fragments.push({
        mesh,
        id: placement.id,
        baseY: placement.y,
        angle: placement.angle,
      })
      fragmentMeshes.push(mesh)
      fragmentIndex.set(placement.id, fragments[fragments.length - 1])
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
   * agree, so the pointer does not flicker on the edge of a plate.
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

    // The camera and the plates moved — the ray needs their fresh matrices.
    camera.updateMatrixWorld()
    scene.updateMatrixWorld(true)
    raycaster.setFromCamera(pointerNdc, camera)
    const hits = raycaster.intersectObjects(fragmentMeshes, false)

    let hitId: number | null = null
    for (const hit of hits) {
      if (!hit.object.visible) continue
      const id = hit.object.userData.storyId
      if (typeof id === 'number') {
        hitId = id
        break
      }
    }

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
    // The idle orbit: the archive turns around the camera.
    orbit.phase += step * ORBIT_SPEED
    idlePose(pose)
    applyPose(pose)
  }

  /**
   * Advance the scene.
   *
   * The frame does no allocation: the plates drift along their own phase,
   * the orbits turn around the core, the halo breathes and the camera
   * either orbits, holds a focus or travels between the two.
   */
  function update(dt: number, snap: ArchiveSpaceSnapshot): void {
    if (disposed) return
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0
    elapsed += step
    reducedMotion = opts.reducedMotion === true || snap.reducedMotion === true

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
      for (const ring of rings) {
        ring.mesh.rotation.z += step * ring.spin * ring.dir
      }
      for (const fragment of fragments) {
        fragment.mesh.position.y =
          fragment.baseY + Math.sin(elapsed * 0.6 + fragment.angle * 3) * FRAGMENT_DRIFT
      }
      haloMesh.scale.setScalar(1 + Math.sin(elapsed * 0.9) * 0.04)
    }

    updateCamera(step)

    // The pointer keeps working even when the motion is reduced.
    updatePointer()
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

    // The camera rig keeps no resources of its own — only its state.
    traveling = false
    pendingHoldId = null
    holdId = null
    focusId = null
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
