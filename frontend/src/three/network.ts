import type {
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Points,
  QuadraticBezierCurve3,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Texture,
} from 'three'
import type { QualityResolved } from '@/composables/useQuality3D'
import type { BoardSummary, SceneMode } from './sceneState'
import { prefersReducedMotion } from '@/composables/useGsap'

type ThreeModule = typeof import('three')

export interface NetworkSnapshot {
  mode: SceneMode
  boardSlug: string | null
  highlightedBoard: string | null
}

/**
 * Camera travel request. Mirrors `CameraTravelRequest` from the transition
 * director so the director can drive the camera without importing us.
 */
export interface CameraTravelRequest {
  preset: SceneMode
  durationMs: number
  easing: 'easeInOutCubic'
  /**
   * Shared element for this trip: the board node the camera keeps looking
   * at while it travels (home↔board reads as one continuous camera move).
   * `undefined` leaves the current anchor untouched, `null` clears it.
   */
  sharedSlug?: string | null
}

export interface NetworkController {
  scene: Scene
  camera: PerspectiveCamera
  setBoards(boards: BoardSummary[]): void
  /** Board descriptors currently feeding the constellation (defensive copy). */
  getBoards(): BoardSummary[]
  setStoryCount(count: number): void
  pulseAt(slug: string): void
  sendReply(): void
  /** 404 'rescue' ping: ring at the lost node + amber flash. */
  rescue(): void
  /** Signal Dock focus state — subtle core brighten, nothing more. */
  setComposerFocus(on: boolean): void
  /** Thread launched: board ring answers with a stronger camera kick. */
  launchPulse(slug: string): void
  /** Report probe / delivery: danger ring at the core. */
  dangerFlash(strength?: number): void
  setPointer(ndcX: number, ndcY: number): void
  /**
   * Slug of the board node under the last pointer position (`setPointer`),
   * or `null` when the pointer hits empty space. Lets the HTML cards answer
   * a 3D hover — the reverse direction of `highlightBoard`.
   */
  getNodeAtPointer(): string | null
  /**
   * Cinematic camera travel to a mode preset. While it runs the presence
   * lerp stands down, so the move reads as one deliberate camera move
   * instead of two competing eases.
   */
  travelTo(request: CameraTravelRequest): void
  /** Topology morph hook: the presence rebuild reads these timers. */
  morphTo(target: SceneMode, durationMs: number): void
  /**
   * Shared-element continuity (home↔board): the board node stays the focus
   * of attention while the camera travels and glows brighter than any
   * hover highlight. Pass `null` to release the anchor.
   */
  anchorSharedElement(slug: string | null): void
  /**
   * Shared-element continuity (board→thread): a reinforced packet flies
   * from a board node into the core, announcing the thread we enter.
   */
  launchEnvoyPacket(fromSlug: string): void
  update(dt: number, snap: NetworkSnapshot): void
  dispose(): void
}

/** Stable hash for deterministic node layout. */
function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

const AMBER = 0xd4882a
const AMBER_BRIGHT = 0xffa840
const DANGER = 0xb3402f
const STEEL = 0x5a6480
const STEEL_LIGHT = 0x8a94b8
const DEEP = 0x1a1e2e
const GLOW = 0xffcc66

/** Near edge of the constellation shell. */
const BASE_RADIUS = 5.0
/** Radial distance between two adjacent `order` tiers. */
const TIER_SPACING = 4.0
/** Smallest possible node size (threadCount = 0). */
const MIN_SCALE = 0.5
/** Size span added on top of `MIN_SCALE` for the busiest board. */
const SCALE_SPAN = 0.8
/** Dimmest ambient glow (threadCount = 0 boards). */
const GLOW_MIN = 0.5
/** Extra ambient glow for the busiest board of the loaded set. */
const GLOW_SPAN = 1.5
/** Hover highlight outranks the ambient glow. */
const HOVER_GLOW = 2.5
/** Inter-board neighbours of the hovered node glow at a middle intensity. */
const NEIGHBOR_GLOW = 1.5
/** Static links each board node keeps to its nearest neighbours. */
const INTER_BOARD_LINKS = 3
/** Ambient pulse cadence: the quietest loaded board signals every 5s… */
const PULSE_INTERVAL_MAX = 5.0
/** …the busiest one every 2s. */
const PULSE_INTERVAL_MIN = 2.0
/** Reduced motion: one unhurried ambient beat instead of 2–5s. */
const PULSE_INTERVAL_REDUCED = 10.0
/** Auto-orbit radius of the home camera — matches `cameraPresets.home.z`. */
const ORBIT_RADIUS = 17
/** Auto-orbit angular speed (rad/s): a drift, not a spin. */
const ORBIT_SPEED = 0.05
/** Vertical bob of the home camera while it orbits (amplitude / speed). */
const ORBIT_BOB_AMPLITUDE = 0.5
const ORBIT_BOB_SPEED = 0.1
/** How far the camera drifts towards a hovered node, as a fraction of its offset. */
const FOCUS_STRENGTH = 0.2
/** Look-at anchor of a hover: between the core and the node, not on the node. */
const FOCUS_LOOK_AT = 0.3

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x))
}

/**
 * Unique node silhouettes: hash(slug) picks the solid, so every board reads
 * as its own shape instead of N copies of the same icosahedron.
 */
const GEOMETRY_VARIANTS = [
  'icosahedron',
  'octahedron',
  'dodecahedron',
  'tetrahedron',
  'box',
] as const

type GeometryVariant = (typeof GEOMETRY_VARIANTS)[number]

/** Boxes sit slightly wider so they read the same size as the polyhedra. */
const BOX_SCALE = 1.45

/** Unique node accents: hash(slug) picks one color out of the palette. */
const NODE_PALETTE = [AMBER, STEEL, STEEL_LIGHT, DEEP, GLOW]

/** Base speed (rad/s) of the per-board node spin. */
const MIN_SPIN = 0.1

function variantGeometry(
  three: ThreeModule,
  variant: GeometryVariant,
  radius: number,
  detail: number,
): BufferGeometry {
  switch (variant) {
    case 'octahedron':
      return new three.OctahedronGeometry(radius, detail)
    case 'dodecahedron':
      return new three.DodecahedronGeometry(radius, detail)
    case 'tetrahedron':
      return new three.TetrahedronGeometry(radius, detail)
    case 'box':
      return new three.BoxGeometry(
        radius * BOX_SCALE,
        radius * BOX_SCALE,
        radius * BOX_SCALE,
      )
    default:
      return new three.IcosahedronGeometry(radius, detail)
  }
}

interface BoardNode {
  slug: string
  /** The board this node represents — `threadCount`/`order` drive the look. */
  board: BoardSummary
  pos: { x: number; y: number; z: number }
  group: Group
  mat: ShaderMaterial
  edgeMat: LineBasicMaterial
  scale: number
  baseScale: number
  phase: number
  /** Shape picked by hash(slug) — see GEOMETRY_VARIANTS. */
  variant: GeometryVariant
  /** Accent picked by hash(slug) from NODE_PALETTE (hover outranks it). */
  color: number
  /** Spin speed (rad/s) picked by hash(slug). */
  rotationSpeed: number
  /** Seconds accumulated towards the next ambient pulse. */
  pulseTimer: number
}

interface Pulse {
  ring: Mesh
  mat: ShaderMaterial
  life: number
  active: boolean
  danger: boolean
}

interface Packet {
  mesh: Mesh
  mat: ShaderMaterial
  trail: Points
  trailMat: ShaderMaterial
  curve: QuadraticBezierCurve3
  t: number
  active: boolean
}

interface Fragment {
  mesh: LineSegments
  /** Accent plates are amber, the rest steel — both share their material. */
  accent: boolean
  ringIdx: number
  angle: number
}

interface RingMesh {
  mesh: LineSegments
  spin: number
  dir: number
}

/**
 * The persistent "engineering network": board nodes wired to a central
 * backbone, ambient dust, signal pulses and reply packets — plus three
 * special sets that fade in per route: the platinum archive (rings and
 * fragments), the lost node (404) and the calm thread core.
 *
 * One scene graph, five modes, presence-lerped transitions.
 *
 * Enhanced with:
 * - Custom shader materials (fresnel glow, animated edges, particle trails)
 * - 3D constellation layout (not just 2D Fibonacci)
 * - Cinematic camera with breathing and mode-specific presets
 * - Depth layers and atmospheric fog simulation
 * - Richer color palette and smoother transitions
 */
export function buildNetwork(
  three: ThreeModule,
  quality: QualityResolved,
): NetworkController {
  const high = quality === 'high'
  const tracked: { dispose: () => void }[] = []
  const keep = <T extends { dispose: () => void }>(x: T): T => {
    tracked.push(x)
    return x
  }

  const scene = new three.Scene()
  scene.fog = new three.FogExp2(DEEP, 0.018)

  const camera = new three.PerspectiveCamera(50, 1, 0.1, 200)
  camera.position.set(0, 1.2, 17)

  const world = new three.Group()
  scene.add(world)

  // --- custom shader definitions -----------------------------------------
  const glowVertexShader = /* glsl */ `
    uniform float uTime;
    uniform float uPulse;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying float vFresnel;
    
    void main() {
      vec3 pos = position;
      float wave = sin(pos.y * 2.0 + uTime * 1.5) * 0.02 * uPulse;
      pos += normal * wave;
      
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      vViewPosition = -mvPosition.xyz;
      vNormal = normalMatrix * normal;
      
      vec3 viewDir = normalize(vViewPosition);
      vFresnel = 1.0 - abs(dot(viewDir, normalize(vNormal)));
      
      gl_Position = projectionMatrix * mvPosition;
    }
  `

  const glowFragmentShader = /* glsl */ `
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform float uGlowIntensity;
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying float vFresnel;
    
    void main() {
      float fresnel = pow(vFresnel, 2.5);
      float pulse = 0.8 + 0.2 * sin(uTime * 2.0);
      vec3 color = uColor * (1.0 + fresnel * uGlowIntensity * pulse);
      float alpha = uOpacity * (0.6 + fresnel * 0.4);
      gl_FragColor = vec4(color, alpha);
    }
  `

  const edgeVertexShader = /* glsl */ `
    uniform float uTime;
    uniform float uFlow;
    varying float vFlow;
    varying vec3 vPosition;
    
    void main() {
      vPosition = position;
      vFlow = fract(position.y * 0.1 + uTime * uFlow);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `

  const edgeFragmentShader = /* glsl */ `
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform float uTime;
    varying float vFlow;
    varying vec3 vPosition;
    
    void main() {
      float flow = smoothstep(0.0, 0.3, vFlow) * smoothstep(1.0, 0.7, vFlow);
      float pulse = 0.7 + 0.3 * sin(uTime * 1.5 + vPosition.x * 0.5);
      vec3 color = uColor * (0.8 + flow * 0.4);
      float alpha = uOpacity * pulse * (0.6 + flow * 0.4);
      gl_FragColor = vec4(color, alpha);
    }
  `

  const dustVertexShader = /* glsl */ `
    uniform float uTime;
    uniform float uSize;
    attribute float aPhase;
    attribute float aSpeed;
    varying float vAlpha;
    
    void main() {
      vec3 pos = position;
      pos.x += sin(uTime * aSpeed + aPhase) * 0.3;
      pos.y += cos(uTime * aSpeed * 0.7 + aPhase) * 0.2;
      pos.z += sin(uTime * aSpeed * 0.5 + aPhase * 2.0) * 0.15;
      
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      float dist = length(mvPosition.xyz);
      vAlpha = smoothstep(30.0, 5.0, dist) * (0.5 + 0.5 * sin(uTime * 2.0 + aPhase));
      
      gl_PointSize = uSize * (1.0 + 0.3 * sin(uTime + aPhase));
      gl_Position = projectionMatrix * mvPosition;
    }
  `

  const dustFragmentShader = /* glsl */ `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying float vAlpha;
    
    void main() {
      float dist = length(gl_PointCoord - vec2(0.5));
      if (dist > 0.5) discard;
      float alpha = smoothstep(0.5, 0.0, dist) * vAlpha * uOpacity;
      gl_FragColor = vec4(uColor, alpha);
    }
  `

  const pulseVertexShader = /* glsl */ `
    uniform float uScale;
    varying vec2 vUv;
    
    void main() {
      vUv = uv;
      vec3 pos = position * uScale;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `

  const pulseFragmentShader = /* glsl */ `
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform float uLife;
    varying vec2 vUv;
    
    void main() {
      vec2 center = vUv - 0.5;
      float dist = length(center);
      float ring = smoothstep(0.4, 0.35, dist) * smoothstep(0.2, 0.25, dist);
      float glow = exp(-dist * 4.0) * 0.6;
      float alpha = (ring + glow) * uOpacity * (1.0 - uLife);
      gl_FragColor = vec4(uColor * (1.0 + glow * 0.5), alpha);
    }
  `

  const packetVertexShader = /* glsl */ `
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    
    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPosition = -mvPosition.xyz;
      vNormal = normalMatrix * normal;
      gl_Position = projectionMatrix * mvPosition;
    }
  `

  const packetFragmentShader = /* glsl */ `
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    
    void main() {
      vec3 viewDir = normalize(vViewPosition);
      vec3 normal = normalize(vNormal);
      float fresnel = pow(1.0 - abs(dot(viewDir, normal)), 3.0);
      float pulse = 0.8 + 0.2 * sin(uTime * 8.0);
      vec3 color = uColor * (1.0 + fresnel * 0.8) * pulse;
      float alpha = uOpacity * (0.7 + fresnel * 0.3);
      gl_FragColor = vec4(color, alpha);
    }
  `

  // --- ambient dust (GPU particles) --------------------------------------
  const dustCount = high ? 200 : 80
  const dustGeo = keep(new three.BufferGeometry())
  const dustPositions = new Float32Array(dustCount * 3)
  const dustPhases = new Float32Array(dustCount)
  const dustSpeeds = new Float32Array(dustCount)

  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = (Math.random() - 0.5) * 50
    dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 30
    dustPositions[i * 3 + 2] = -20 + Math.random() * 25
    dustPhases[i] = Math.random() * Math.PI * 2
    dustSpeeds[i] = 0.2 + Math.random() * 0.4
  }

  dustGeo.setAttribute('position', new three.BufferAttribute(dustPositions, 3))
  dustGeo.setAttribute('aPhase', new three.BufferAttribute(dustPhases, 1))
  dustGeo.setAttribute('aSpeed', new three.BufferAttribute(dustSpeeds, 1))

  const dustMat = keep(
    new three.ShaderMaterial({
      vertexShader: dustVertexShader,
      fragmentShader: dustFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: three.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: high ? 3.5 : 2.5 },
        uColor: { value: new three.Color(STEEL_LIGHT) },
        uOpacity: { value: 0.4 },
      },
    }),
  )
  const dustPoints = new three.Points(dustGeo, dustMat)
  world.add(dustPoints)

  // --- backbone core (layered geometry) ----------------------------------
  const coreGroup = new three.Group()
  world.add(coreGroup)

  const coreInnerMat = keep(
    new three.ShaderMaterial({
      vertexShader: glowVertexShader,
      fragmentShader: glowFragmentShader,
      transparent: true,
      side: three.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 1 },
        uColor: { value: new three.Color(AMBER_BRIGHT) },
        uOpacity: { value: 0.9 },
        uGlowIntensity: { value: 1.5 },
      },
    }),
  )
  const coreInner = new three.Mesh(
    keep(new three.IcosahedronGeometry(0.4, high ? 2 : 1)),
    coreInnerMat,
  )
  coreGroup.add(coreInner)

  const coreEdgeMat = keep(
    new three.LineBasicMaterial({
      color: AMBER,
      transparent: true,
      opacity: 0.85,
    }),
  )
  const coreEdge = new three.LineSegments(
    keep(new three.EdgesGeometry(new three.OctahedronGeometry(0.55))),
    coreEdgeMat,
  )
  coreGroup.add(coreEdge)

  const coreGlowMat = keep(
    new three.ShaderMaterial({
      vertexShader: glowVertexShader,
      fragmentShader: glowFragmentShader,
      transparent: true,
      side: three.BackSide,
      blending: three.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 1 },
        uColor: { value: new three.Color(GLOW) },
        uOpacity: { value: 0.15 },
        uGlowIntensity: { value: 2.0 },
      },
    }),
  )
  const coreGlow = new three.Mesh(
    keep(new three.SphereGeometry(0.8, 16, 16)),
    coreGlowMat,
  )
  coreGroup.add(coreGlow)

  // --- board nodes + edges (3D constellation) ----------------------------
  const networkGroup = new three.Group()
  world.add(networkGroup)
  let nodes: BoardNode[] = []
  let nodeOwned: { dispose: () => void }[] = []
  /** Board descriptors behind the current nodes (copy — see `setBoards`). */
  let currentBoards: BoardSummary[] = []
  /** Busiest board of the loaded set — the ambient glow reference point. */
  let maxThreadCount = 1

  function makeLabel(txt: string) {
    const cv = document.createElement('canvas')
    cv.width = 256
    cv.height = 80
    const c = cv.getContext('2d')
    if (c) {
      c.font = '600 34px "JetBrains Mono", monospace'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillStyle = 'rgba(212, 136, 42, 0.95)'
      c.fillText(txt, 128, 42)
    }
    const tex = keep(new three.CanvasTexture(cv))
    const mat = keep(
      new three.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
    )
    const sprite = new three.Sprite(mat)
    sprite.scale.set(3, 0.95, 1)
    return sprite
  }

  function setBoards(boards: BoardSummary[]) {
    for (const child of [...networkGroup.children]) networkGroup.remove(child)
    for (const m of nodeOwned) m.dispose()
    nodeOwned = []
    nodes = []
    // Keep our own copy: callers hand over reactive arrays they keep mutating.
    currentBoards = boards.slice()

    // Spatial hierarchy stats — computed once, the tiers are relative to the
    // board set that is currently loaded.
    const total = boards.length
    const minOrder = Math.min(...boards.map((b) => b.order))
    const maxOrder = Math.max(...boards.map((b) => b.order))
    const orderSpan = maxOrder - minOrder || 1
    // The busiest board of the loaded set defines the full size range; the
    // floor keeps an all-zero (or empty) dataset from dividing by zero.
    const localMaxThreadCount = Math.max(1, ...boards.map((b) => b.threadCount))
    maxThreadCount = localMaxThreadCount
    boards.forEach((board, idx) => {
      const slug = board.slug
      // Deterministic per-board look: same slug → same shape, color, spin.
      const seed = hash(slug)
      const variant = GEOMETRY_VARIANTS[seed % GEOMETRY_VARIANTS.length]
      const color = NODE_PALETTE[seed % NODE_PALETTE.length]
      const rotationSpeed = MIN_SPIN + (seed % 100) * 0.005
      // order → radial tier: low order (important boards) sit near the core.
      const normalizedOrder = clamp((board.order - minOrder) / orderSpan, 0, 1)
      const radius = BASE_RADIUS + normalizedOrder * TIER_SPACING
      // threadCount → size: busy boards read as bigger signals.
      const normalizedThreadCount = clamp(board.threadCount / localMaxThreadCount, 0, 1)
      const baseScale = MIN_SCALE + normalizedThreadCount * SCALE_SPAN
      // 3D constellation layout - distribute in spherical shell
      const phi = Math.acos(1 - (2 * (idx + 0.5)) / total)
      const theta = Math.PI * (1 + Math.sqrt(5)) * idx + (seed % 100) * 0.01
      const pos = {
        x: radius * Math.sin(phi) * Math.cos(theta),
        y: radius * Math.sin(phi) * Math.sin(theta) * 0.6,
        z: radius * Math.cos(phi) * 0.8 - 2,
      }

      const group = new three.Group()
      group.position.set(pos.x, pos.y, pos.z)
      group.scale.setScalar(baseScale)

      // Node geometry with glow shader
      const nodeMat = new three.ShaderMaterial({
        vertexShader: glowVertexShader,
        fragmentShader: glowFragmentShader,
        transparent: true,
        side: three.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uPulse: { value: 1 },
          uColor: { value: new three.Color(color) },
          uOpacity: { value: 0.7 },
          uGlowIntensity: { value: 1.2 },
        },
      })
      nodeOwned.push(nodeMat)

      const nodeGeo = keep(variantGeometry(three, variant, 0.55, high ? 2 : 1))
      const nodeMesh = new three.Mesh(nodeGeo, nodeMat)
      group.add(nodeMesh)

      // Inner core
      const innerMat = new three.MeshBasicMaterial({
        color: AMBER,
        transparent: true,
        opacity: 0.9,
      })
      const innerGeo = keep(new three.SphereGeometry(0.12, 12, 12))
      nodeOwned.push(innerMat, innerGeo)
      group.add(new three.Mesh(innerGeo, innerMat))

      // Edge wireframe — same silhouette, slightly larger, own accent.
      const edgeMat = new three.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35,
      })
      nodeOwned.push(edgeMat)
      // The inner geometry is kept as well: `EdgesGeometry` copies the
      // positions, but the source it was built from is a GPU buffer of its
      // own and has to be released with the wrapper.
      const edgeGeo = keep(
        new three.EdgesGeometry(keep(variantGeometry(three, variant, 0.6, 0))),
      )
      const edgeMesh = new three.LineSegments(edgeGeo, edgeMat)
      group.add(edgeMesh)

      const label = makeLabel(`/${slug}/`)
      label.position.set(0, 0.9, 0)
      group.add(label)

      networkGroup.add(group)
      nodes.push({
        slug,
        board,
        pos,
        group,
        mat: nodeMat,
        edgeMat,
        scale: baseScale,
        baseScale,
        phase: (seed % 100) * 0.0628,
        variant,
        color,
        rotationSpeed,
        pulseTimer: 0,
      })

      // Connection edge to core with flow shader
      const connectionMat = new three.ShaderMaterial({
        vertexShader: edgeVertexShader,
        fragmentShader: edgeFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: three.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uFlow: { value: 0.3 },
          uColor: { value: new three.Color(STEEL) },
          uOpacity: { value: 0.18 },
        },
      })
      nodeOwned.push(connectionMat)

      const points = []
      const segments = 20
      for (let i = 0; i <= segments; i++) {
        const t = i / segments
        const curve = Math.sin(t * Math.PI) * 0.8
        points.push(new three.Vector3(pos.x * t, pos.y * t + curve, pos.z * t))
      }
      const connectionGeo = keep(new three.BufferGeometry().setFromPoints(points))
      const connection = new three.Line(connectionGeo, connectionMat)
      connection.userData = { slug, kind: 'edge' }
      networkGroup.add(connection)
    })

    // Inter-board connections: each node keeps thin static links to its
    // nearest neighbours, so the constellation reads as a network instead
    // of free-floating dots. Static on purpose — nothing to animate here,
    // only the hover lighting (see `update`) reacts to them.
    const linked = new Set<string>()
    for (const node of nodes) {
      const nearest = nodes
        .filter((other) => other.slug !== node.slug)
        .map((other) => ({
          slug: other.slug,
          pos: other.pos,
          dist: Math.hypot(
            other.pos.x - node.pos.x,
            other.pos.y - node.pos.y,
            other.pos.z - node.pos.z,
          ),
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, INTER_BOARD_LINKS)
      for (const other of nearest) {
        // A→B is B→A: link the pair once.
        const key = [node.slug, other.slug].sort().join('|')
        if (linked.has(key)) continue
        linked.add(key)

        const linkGeo = new three.BufferGeometry().setFromPoints([
          new three.Vector3(node.pos.x, node.pos.y, node.pos.z),
          new three.Vector3(other.pos.x, other.pos.y, other.pos.z),
        ])
        const linkMat = new three.LineBasicMaterial({
          color: STEEL,
          transparent: true,
          opacity: 0.15,
        })
        const link = new three.Line(linkGeo, linkMat)
        link.userData = { kind: 'inter-board', from: node.slug, to: other.slug }
        nodeOwned.push(linkGeo, linkMat)
        networkGroup.add(link)
      }
    }
  }

  /** Boards behind the current nodes, without aliasing the caller's array. */
  function getBoards(): BoardSummary[] {
    return currentBoards.slice()
  }

  // --- hover tooltip (3D label) -------------------------------------------
  let hoverLabel: Sprite | null = null
  let hoverLabelTex: Texture | null = null
  let hoverLabelMat: SpriteMaterial | null = null
  /** Slug the live label was rendered for — a new hover re-renders it. */
  let hoverLabelSlug: string | null = null

  function disposeHoverLabel(): void {
    if (hoverLabel) world.remove(hoverLabel)
    hoverLabelTex?.dispose()
    hoverLabelMat?.dispose()
    hoverLabel = null
    hoverLabelTex = null
    hoverLabelMat = null
    hoverLabelSlug = null
  }

  /** Board name + thread count, drawn once per highlighted slug. */
  function makeHoverLabel(board: BoardSummary): void {
    disposeHoverLabel()
    const cv = document.createElement('canvas')
    cv.width = 512
    cv.height = 128
    const c = cv.getContext('2d')
    if (c) {
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.font = '600 48px "Inter", sans-serif'
      c.fillStyle = 'rgba(212, 136, 42, 0.95)'
      c.fillText(board.name || board.slug, 256, 40)
      c.font = '400 32px "JetBrains Mono", monospace'
      c.fillStyle = 'rgba(138, 130, 115, 0.9)'
      c.fillText(`${board.threadCount} signals`, 256, 90)
    }
    hoverLabelTex = new three.CanvasTexture(cv)
    hoverLabelMat = new three.SpriteMaterial({
      map: hoverLabelTex,
      transparent: true,
      depthWrite: false,
    })
    hoverLabel = new three.Sprite(hoverLabelMat)
    hoverLabel.scale.set(4, 1, 1)
    hoverLabel.visible = false
    world.add(hoverLabel)
    hoverLabelSlug = board.slug
  }

  /**
   * Slug of the board node under the last pointer position, or `null` when
   * the pointer hits empty space (or the network is not on screen).
   */
  function getNodeAtPointer(): string | null {
    if (nodes.length === 0 || !networkGroup.visible) return null
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(
      nodes.map((n) => n.group),
      true,
    )
    for (const hit of hits) {
      let obj: Object3D | null = hit.object
      while (obj) {
        const node = nodes.find((n) => n.group === obj)
        if (node) return node.slug
        obj = obj.parent
      }
    }
    return null
  }

  // --- signal pulses -----------------------------------------------------
  const pulsePool: Pulse[] = []
  for (let i = 0; i < 8; i++) {
    const mat = keep(
      new three.ShaderMaterial({
        vertexShader: pulseVertexShader,
        fragmentShader: pulseFragmentShader,
        transparent: true,
        side: three.DoubleSide,
        blending: three.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uScale: { value: 1 },
          uColor: { value: new three.Color(AMBER) },
          uOpacity: { value: 0 },
          uLife: { value: 0 },
        },
      }),
    )
    const geo = keep(new three.PlaneGeometry(1.5, 1.5))
    const ring = new three.Mesh(geo, mat)
    ring.visible = false
    world.add(ring)
    pulsePool.push({ ring, mat, life: 0, active: false, danger: false })
  }

  function fireRing(danger: boolean, x: number, y: number, z: number, kick: number) {
    const p = pulsePool.find((x2) => !x2.active)
    if (!p) return
    p.ring.position.set(x, y, z)
    p.ring.lookAt(camera.position)
    p.mat.uniforms.uScale.value = 1
    p.mat.uniforms.uColor.value.setHex(danger ? DANGER : AMBER_BRIGHT)
    p.mat.uniforms.uOpacity.value = 1
    p.mat.uniforms.uLife.value = 0
    p.ring.visible = true
    p.life = 0.0001
    p.active = true
    p.danger = danger
    cameraKick = Math.min(0.6, cameraKick + kick)
    return p
  }

  function pulseAt(slug: string) {
    const node = nodes.find((n) => n.slug === slug)
    if (!node) return
    fireRing(false, node.pos.x, node.pos.y, node.pos.z, 0.35)
  }

  function launchPulse(slug: string) {
    const node = nodes.find((n) => n.slug === slug)
    if (node) fireRing(false, node.pos.x, node.pos.y, node.pos.z, 0.55)
    else fireRing(false, 0, 0, 0, 0.55)
  }

  let dangerFlashT = 0
  function dangerFlash(strength = 1) {
    fireRing(true, 0, 0, 0, 0.18 * strength)
    dangerFlashT = Math.min(1.2, dangerFlashT + 0.5 * strength)
  }

  // --- reply packets with trails -----------------------------------------
  const packetPool: Packet[] = []
  for (let i = 0; i < 6; i++) {
    const mat = keep(
      new three.ShaderMaterial({
        vertexShader: packetVertexShader,
        fragmentShader: packetFragmentShader,
        transparent: true,
        blending: three.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new three.Color(AMBER_BRIGHT) },
          uOpacity: { value: 1 },
        },
      }),
    )
    const geo = keep(new three.SphereGeometry(0.15, 12, 12))
    const mesh = new three.Mesh(geo, mat)
    mesh.visible = false
    world.add(mesh)

    const trailCount = 20
    const trailGeo = keep(new three.BufferGeometry())
    const trailPositions = new Float32Array(trailCount * 3)
    trailGeo.setAttribute('position', new three.BufferAttribute(trailPositions, 3))

    const trailMat = keep(
      new three.ShaderMaterial({
        vertexShader: dustVertexShader,
        fragmentShader: dustFragmentShader,
        transparent: true,
        blending: three.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: 2.5 },
          uColor: { value: new three.Color(AMBER) },
          uOpacity: { value: 0.6 },
        },
      }),
    )
    const trail = new three.Points(trailGeo, trailMat)
    trail.visible = false
    world.add(trail)

    packetPool.push({
      mesh,
      mat,
      trail,
      trailMat,
      curve: new three.QuadraticBezierCurve3(
        new three.Vector3(),
        new three.Vector3(),
        new three.Vector3(),
      ),
      t: 0,
      active: false,
    })
  }

  let lostFlash = 0
  function rescue() {
    fireRing(false, 0, 0, 0, 0.3)
    lostFlash = 0.45
  }

  function sendReply() {
    const p = packetPool.find((x) => !x.active)
    if (!p) return
    const source =
      nodes.length > 0
        ? nodes[Math.floor(Math.random() * nodes.length)].pos
        : { x: 5, y: 2.5, z: -2 }
    p.curve = new three.QuadraticBezierCurve3(
      new three.Vector3(source.x, source.y, source.z),
      new three.Vector3(source.x * 0.4, source.y * 0.4 + 3, 3),
      new three.Vector3(0, 0, 0),
    )
    p.t = 0
    p.mesh.visible = true
    p.mesh.scale.setScalar(1)
    p.trail.visible = true
    p.mat.uniforms.uOpacity.value = 1
    p.active = true
    cameraKick = Math.min(0.5, cameraKick + 0.22)
  }

  /**
   * Thread-launch continuity: the same reply packet, but launched from one
   * specific board node instead of a random one — the board we leave is the
   * node that sends the envoy into the core.
   */
  function launchEnvoyPacket(fromSlug: string): void {
    const p = packetPool.find((x) => !x.active)
    if (!p) return
    const node = nodes.find((n) => n.slug === fromSlug)
    const source = node ? node.pos : { x: 5, y: 2.5, z: -2 }
    p.curve = new three.QuadraticBezierCurve3(
      new three.Vector3(source.x, source.y, source.z),
      new three.Vector3(source.x * 0.4, source.y * 0.4 + 3, 3),
      new three.Vector3(0, 0, 0),
    )
    p.t = 0
    p.mesh.visible = true
    p.mesh.scale.setScalar(1.8)
    p.trail.visible = true
    p.mat.uniforms.uColor.value.setHex(AMBER_BRIGHT)
    p.mat.uniforms.uOpacity.value = 1
    p.trailMat.uniforms.uColor.value.setHex(AMBER_BRIGHT)
    p.trailMat.uniforms.uOpacity.value = 1
    p.active = true
    cameraKick = Math.min(0.5, cameraKick + 0.22)
  }

  // --- platinum archive (distant background) ------------------------------
  // The archive has become a scene of its own: `src/three/archive/space.ts`
  // draws the epoch rings, the paper plates and the dust of the stories on
  // the platinum route (see `ArchiveSpaceCanvas`). What stays in the network
  // is the *distant* version of it — three orbit rings, the vault core and a
  // thin scatter of sparks — so the constellation still has somewhere to
  // dissolve into. It has to stay cheap: the detail belongs to the archive
  // space, this is the background behind it.
  const archiveGroup = new three.Group()
  archiveGroup.visible = false
  world.add(archiveGroup)

  const radii = [3.0, 4.8, 6.6]
  const ringMeshes: RingMesh[] = []
  radii.forEach((radius, i) => {
    const geo = keep(
      new three.EdgesGeometry(new three.TorusGeometry(radius, 0.04, 6, high ? 80 : 36)),
    )
    const mat = keep(
      new three.LineBasicMaterial({ color: STEEL, transparent: true, opacity: 0.4 }),
    )
    const mesh = new three.LineSegments(geo, mat)
    mesh.rotation.set(Math.PI / 2 + (i - 1) * 0.3, 0, 0.12 * (i - 1))
    archiveGroup.add(mesh)
    ringMeshes.push({ mesh, spin: 0.05 + radius * 0.008, dir: i % 2 ? -1 : 1 })
  })

  const vaultGeo = keep(new three.EdgesGeometry(new three.DodecahedronGeometry(1.15)))
  const vaultMat = keep(
    new three.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.7 }),
  )
  const vault = new three.LineSegments(vaultGeo, vaultMat)
  archiveGroup.add(vault)

  const glowGeo = keep(new three.SphereGeometry(1.4, 20, 20))
  const glowMat = keep(
    new three.MeshBasicMaterial({
      color: AMBER,
      transparent: true,
      opacity: 0.08,
      blending: three.AdditiveBlending,
      depthWrite: false,
    }),
  )
  archiveGroup.add(new three.Mesh(glowGeo, glowMat))

  /**
   * The story count used to draw one wire box per story — a geometry and a
   * material for every story, up to eighteen of them. The archive space owns
   * that detail now, so the network keeps only a handful of paper
   * silhouettes, all of them sharing ONE geometry and three materials.
   */
  const MAX_ARCHIVE_SILHOUETTES = 6
  const silhouetteGeo = keep(
    new three.EdgesGeometry(new three.BoxGeometry(0.85, 1.1, 0.06)),
  )
  const silhouetteMat = keep(
    new three.LineBasicMaterial({ color: STEEL, transparent: true, opacity: 0.65 }),
  )
  const silhouetteAccentMat = keep(
    new three.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.65 }),
  )
  const silhouetteHotMat = keep(
    new three.LineBasicMaterial({ color: AMBER_BRIGHT, transparent: true, opacity: 1 }),
  )

  /**
   * The stories themselves survive as sparks along the orbits: one shared
   * point cloud, revealed up to the story count. No per-story objects at
   * all — the count moves the draw range of a single buffer.
   */
  const SPARKS_PER_STORY = 3
  const MAX_ARCHIVE_STORIES = 18
  const sparkCount = MAX_ARCHIVE_STORIES * SPARKS_PER_STORY
  const sparkGeo = keep(new three.BufferGeometry())
  const sparkPositions = new Float32Array(sparkCount * 3)
  const sparkPhases = new Float32Array(sparkCount)
  const sparkSpeeds = new Float32Array(sparkCount)
  // A tiny deterministic generator: the sparks must look the same on every
  // build, so the background never flickers between reloads.
  let sparkSeed = 0x2f6e2b1
  const sparkRand = () => {
    sparkSeed = (sparkSeed * 1664525 + 1013904223) % 4294967296
    return sparkSeed / 4294967296
  }
  for (let i = 0; i < sparkCount; i++) {
    const ringIdx = i % radii.length
    const angle = sparkRand() * Math.PI * 2
    const radius = radii[ringIdx] + (sparkRand() - 0.5) * 0.6
    sparkPositions[i * 3] = Math.cos(angle) * radius
    sparkPositions[i * 3 + 1] = (sparkRand() - 0.5) * 0.9
    sparkPositions[i * 3 + 2] = Math.sin(angle) * radius
    sparkPhases[i] = sparkRand() * Math.PI * 2
    sparkSpeeds[i] = 0.15 + sparkRand() * 0.3
  }
  sparkGeo.setAttribute('position', new three.BufferAttribute(sparkPositions, 3))
  sparkGeo.setAttribute('aPhase', new three.BufferAttribute(sparkPhases, 1))
  sparkGeo.setAttribute('aSpeed', new three.BufferAttribute(sparkSpeeds, 1))
  sparkGeo.setDrawRange(0, 0)
  const sparkMat = keep(
    new three.ShaderMaterial({
      vertexShader: dustVertexShader,
      fragmentShader: dustFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: three.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: high ? 3 : 2 },
        uColor: { value: new three.Color(AMBER) },
        uOpacity: { value: 0 },
      },
    }),
  )
  const sparks = new three.Points(sparkGeo, sparkMat)
  archiveGroup.add(sparks)

  let fragments: Fragment[] = []

  /**
   * Story count → the archive background. The silhouettes are a decorative
   * hint (a few plates drifting on the orbits); the stories themselves are
   * drawn by the archive space. The count still shows here — as sparks.
   */
  function setStoryCount(count: number) {
    for (const f of fragments) archiveGroup.remove(f.mesh)
    fragments = []
    const n = Math.max(0, Math.min(count, MAX_ARCHIVE_SILHOUETTES))
    for (let i = 0; i < n; i++) {
      const accent = i % 3 === 0
      const mesh = new three.LineSegments(
        silhouetteGeo,
        accent ? silhouetteAccentMat : silhouetteMat,
      )
      const ringIdx = i % 3
      const angle = (i / Math.max(1, n)) * Math.PI * 2 + ringIdx * 0.7
      mesh.position.set(
        Math.cos(angle) * radii[ringIdx],
        0,
        Math.sin(angle) * radii[ringIdx],
      )
      archiveGroup.add(mesh)
      fragments.push({ mesh, accent, ringIdx, angle })
    }
    // The stories live on as sparks: one shared cloud, revealed by the count.
    const stories = Math.max(0, Math.min(count, MAX_ARCHIVE_STORIES))
    sparkGeo.setDrawRange(0, stories * SPARKS_PER_STORY)
  }

  // --- lost node (404) ---------------------------------------------------
  const lostGroup = new three.Group()
  lostGroup.visible = false
  world.add(lostGroup)
  const lostMat = keep(
    new three.LineBasicMaterial({ color: STEEL, transparent: true, opacity: 0.75 }),
  )
  const lostNode = new three.LineSegments(
    keep(new three.EdgesGeometry(new three.IcosahedronGeometry(1.25, 1))),
    lostMat,
  )
  lostGroup.add(lostNode)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    const mat = keep(
      new three.LineBasicMaterial({ color: STEEL, transparent: true, opacity: 0.22 }),
    )
    const geo = keep(
      new three.BufferGeometry().setFromPoints([
        new three.Vector3(Math.cos(a) * 1.35, Math.sin(a) * 1.35, 0),
        new three.Vector3(
          Math.cos(a) * (2.8 + (i % 2) * 1.4),
          Math.sin(a) * 2.3,
          -1 - i * 0.4,
        ),
      ]),
    )
    lostGroup.add(new three.Line(geo, mat))
  }

  // --- camera / pointer / presence state ---------------------------------
  const pointer = new three.Vector2(999, 999)
  const smoothPointer = new three.Vector2(0, 0)
  let cameraKick = 0
  let elapsed = 0
  /**
   * Auto-orbit phase offset. Seeded so the drift starts exactly at
   * `cameraPresets.home` (0, y, 17) instead of snapping to another point of
   * the circle, and re-anchored whenever a travel parks the camera.
   */
  let orbitPhase = Math.PI / 2
  /** Whether the previous frame ran the auto-orbit — gates the re-anchor. */
  let wasOrbiting = false
  let composerGlow = 0
  let composerFocus = false
  const presence = { network: 1, archive: 0, lost: 0 }
  /** Where the running morph is dragging `presence` towards. */
  const morphPresence = { network: 1, archive: 0, lost: 0 }
  /** Eased morph progress (0..1) — drives the topology reshuffle. */
  let morphEased = 0
  /** Board node kept as the shared element while the camera travels. */
  let sharedAnchor: string | null = null
  const travelLookAt = new three.Vector3()
  const raycaster = new three.Raycaster()

  // Camera presets per mode
  const cameraPresets = {
    home: { x: 0, y: 1.2, z: 17, lookY: 0 },
    board: { x: 0, y: 1.0, z: 8.5, lookY: 0.6 },
    thread: { x: 0, y: 0.5, z: 9.5, lookY: 0 },
    platinum: { x: 0, y: 2.2, z: 12.5, lookY: 0 },
    error: { x: 0, y: 0, z: 6.5, lookY: 0 },
  }

  type CameraPreset = (typeof cameraPresets)[SceneMode]

  // --- camera travel + topology morph (route transitions) -----------------
  let traveling = false
  let travelStart = {
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z,
  }
  let travelTarget: CameraPreset = { ...cameraPresets.home }
  let travelDuration = 1
  let travelElapsed = 0

  const morph = {
    target: 'home' as SceneMode,
    duration: 1,
    elapsed: 0,
    active: false,
  }

  function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
  }

  function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  /**
   * Fly the camera from wherever it currently is to a mode preset. Starting
   * a travel mid-travel restarts from the live position, so overlapping
   * route changes slide instead of teleporting.
   */
  function travelTo(request: CameraTravelRequest): void {
    const preset = cameraPresets[request.preset]
    if (!preset) return
    travelStart = {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    }
    travelTarget = { ...preset }
    travelDuration = Math.max(0.001, request.durationMs / 1000)
    travelElapsed = 0
    traveling = true
    if (request.sharedSlug !== undefined) anchorSharedElement(request.sharedSlug)
  }

  /**
   * Topology morph timers. `update` turns them into `morphPresence` plus the
   * geometric reshuffle (nodes folding into the archive rings, the lost
   * node materialising out of the core dive).
   */
  function morphTo(target: SceneMode, durationMs: number): void {
    morph.target = target
    morph.duration = Math.max(0.001, durationMs / 1000)
    morph.elapsed = 0
    morph.active = true
  }

  /**
   * Pin the shared element for a board↔home / board↔thread trip. Only known
   * board nodes can anchor — anything else releases the anchor.
   */
  function anchorSharedElement(slug: string | null): void {
    sharedAnchor = slug !== null && nodes.some((n) => n.slug === slug) ? slug : null
  }

  /** Current shared-element node, if the anchor is still valid. */
  function resolveSharedNode(): BoardNode | undefined {
    return sharedAnchor !== null
      ? nodes.find((n) => n.slug === sharedAnchor)
      : undefined
  }

  function update(dt: number, snap: NetworkSnapshot) {
    elapsed += dt
    const ease = Math.min(1, dt * 2.6)
    // Accessibility: one read per frame gates every new animation below
    // (auto-orbit, hover focus, idle spin, ambient pulse, hover lighting).
    const reducedMotion = prefersReducedMotion()

    // --- morph clock -------------------------------------------------------
    // While a morph runs the presence lerp is driven by the morph (faster
    // than the idle drift), so the scene reads as one topological change
    // instead of two competing eases.
    morphEased = 0
    if (morph.active) {
      morph.elapsed += dt
      if (morph.elapsed >= morph.duration) morph.active = false
      const t = Math.min(1, morph.elapsed / morph.duration)
      morphEased = easeInOutCubic(t)
      // Coming back out of the archive, unwind what we wound up.
      const unwindArchive = presence.archive > 0.5 ? 1 - morphEased : 0
      if (morph.target === 'platinum') {
        morphPresence.network = 1 - morphEased
        morphPresence.archive = morphEased
        morphPresence.lost = 0
      } else if (morph.target === 'error') {
        morphPresence.network = 1 - morphEased
        morphPresence.archive = 0
        morphPresence.lost = morphEased
      } else if (morph.target === 'thread') {
        // Thread is the calm mode — the network stays where it is.
        morphPresence.network = 1
        morphPresence.archive = unwindArchive
        morphPresence.lost = 0
      } else {
        // home / board — the constellation folds back into place.
        morphPresence.network = morphEased
        morphPresence.archive = unwindArchive
        morphPresence.lost = 0
      }
    }

    const netTarget = snap.mode === 'platinum' || snap.mode === 'error' ? 0 : 1
    const archiveTarget = morph.active
      ? morphPresence.archive
      : snap.mode === 'platinum'
        ? 1
        : 0
    const lostTarget = morph.active ? morphPresence.lost : snap.mode === 'error' ? 1 : 0
    const networkPresenceTarget = morph.active ? morphPresence.network : netTarget
    const presenceEase = morph.active ? Math.min(1, ease * 4) : ease
    presence.network += (networkPresenceTarget - presence.network) * presenceEase
    presence.archive += (archiveTarget - presence.archive) * presenceEase
    presence.lost += (lostTarget - presence.lost) * presenceEase

    networkGroup.visible = presence.network > 0.02
    coreGroup.visible = networkGroup.visible
    archiveGroup.visible = presence.archive > 0.02
    lostGroup.visible = presence.lost > 0.02

    const calm = snap.mode === 'thread'
    const netPresence = calm ? presence.network * 0.5 : presence.network
    composerGlow += ((composerFocus ? 1 : 0) - composerGlow) * Math.min(1, dt * 3)
    dangerFlashT = Math.max(0, dangerFlashT - dt * 0.8)

    // Update core materials
    coreInnerMat.uniforms.uTime.value = elapsed
    coreInnerMat.uniforms.uPulse.value = 1 + 0.3 * composerGlow + 0.4 * dangerFlashT
    coreInnerMat.uniforms.uOpacity.value =
      (0.9 + 0.3 * composerGlow + 0.3 * Math.min(1, dangerFlashT)) * presence.network
    coreInnerMat.uniforms.uColor.value.setHex(dangerFlashT > 0 ? DANGER : AMBER_BRIGHT)

    coreEdgeMat.color.setHex(dangerFlashT > 0 ? DANGER : AMBER)
    coreEdgeMat.opacity =
      (0.85 + 0.3 * composerGlow + 0.25 * Math.min(1, dangerFlashT)) * presence.network

    coreGlowMat.uniforms.uTime.value = elapsed
    coreGlowMat.uniforms.uPulse.value = 1 + 0.4 * composerGlow
    coreGlowMat.uniforms.uOpacity.value = 0.15 * presence.network

    const coreScale = 1 + 0.12 * composerGlow + 0.08 * Math.min(1, dangerFlashT)
    coreGroup.scale.setScalar(coreScale)

    // Update dust
    dustMat.uniforms.uTime.value = elapsed
    dustMat.uniforms.uOpacity.value =
      0.4 * Math.max(presence.network, presence.archive * 0.8, presence.lost * 0.6)

    // Update nodes
    const hi = snap.highlightedBoard ?? (snap.mode === 'board' ? snap.boardSlug : null)
    // Shared element outranks hover: it is the reason for the whole trip.
    const sharedNode = resolveSharedNode()
    // Folding into the archive: nodes collapse towards the core instead of
    // simply being faded out.
    const folding = morph.active && morph.target === 'platinum'

    // Reactive lighting: the busier the board, the brighter it glows.
    const glow = new Map<string, number>()
    for (const n of nodes) {
      const normalized = clamp(n.board.threadCount / maxThreadCount, 0, 1)
      glow.set(n.slug, GLOW_MIN + normalized * GLOW_SPAN)
    }

    // Hover reactive lighting: the highlighted node outshines the rest and
    // its inter-board neighbours sit in between — the highlight spreads one
    // hop along the network instead of stopping at a single node.
    if (hi !== null) {
      const hiNode = nodes.find((n) => n.slug === hi)
      if (hiNode) {
        glow.set(hiNode.slug, HOVER_GLOW)
        // Reduced motion: the highlight stops at the hovered node — no
        // ripple waking up its neighbours.
        if (!reducedMotion) {
          for (const child of networkGroup.children) {
            if (child.userData.kind !== 'inter-board') continue
            const from = child.userData.from as string
            const to = child.userData.to as string
            if (from !== hiNode.slug && to !== hiNode.slug) continue
            const neighborSlug = from === hiNode.slug ? to : from
            // Only real neighbours of this highlight light up.
            if (neighborSlug !== hiNode.slug && glow.has(neighborSlug)) {
              glow.set(neighborSlug, NEIGHBOR_GLOW)
            }
          }
        }
      }
    }

    for (const n of nodes) {
      const isShared = sharedNode !== undefined && n.slug === sharedNode.slug
      const isHi = isShared || (hi !== null && n.slug === hi)
      const targetScale = folding
        ? n.baseScale * (1 - morphEased * 0.9)
        : isHi
          ? 1.35
          : n.baseScale
      n.scale += (targetScale - n.scale) * Math.min(1, dt * 7)
      n.group.scale.setScalar(n.scale)

      n.mat.uniforms.uTime.value = elapsed
      n.mat.uniforms.uPulse.value = 1 + 0.2 * Math.sin(elapsed * 2 + n.phase)
      n.mat.uniforms.uOpacity.value = (isShared ? 1 : isHi ? 0.95 : 0.7) * netPresence
      n.mat.uniforms.uColor.value.setHex(isHi ? AMBER_BRIGHT : n.color)
      n.mat.uniforms.uGlowIntensity.value = isShared ? 2.8 : (glow.get(n.slug) ?? 1.2)

      n.edgeMat.opacity = (isHi ? 0.6 : 0.35) * netPresence
      n.edgeMat.color.setHex(isHi ? AMBER : n.color)

      // Gentle floating animation
      n.group.position.y = n.pos.y + Math.sin(elapsed * 0.5 + n.phase) * 0.15

      // Idle spin — each cluster turns at its own hash-chosen pace.
      // Reduced motion: the constellation holds perfectly still.
      if (!reducedMotion) {
        n.group.rotation.y += dt * n.rotationSpeed
        n.group.rotation.x += dt * n.rotationSpeed * 0.3
      }

      // Ambient pulse: the busier the board, the more often it signals.
      // Reduced motion: one unhurried beat for the whole set.
      n.pulseTimer += dt
      const busy = clamp(n.board.threadCount / maxThreadCount, 0, 1)
      const interval = reducedMotion
        ? PULSE_INTERVAL_REDUCED
        : PULSE_INTERVAL_MAX - busy * (PULSE_INTERVAL_MAX - PULSE_INTERVAL_MIN)
      if (n.pulseTimer >= interval) {
        pulseAt(n.slug)
        n.pulseTimer = 0
      }
    }

    // Hover tooltip: name + thread count floating over the highlighted node.
    // Follows the node's live position, so it rides the idle float.
    if (snap.highlightedBoard !== null && networkGroup.visible) {
      const hovered = nodes.find((n) => n.slug === snap.highlightedBoard)
      if (hovered) {
        if (hoverLabelSlug !== hovered.slug) makeHoverLabel(hovered.board)
        if (hoverLabel) {
          hoverLabel.visible = true
          hoverLabel.position.set(
            hovered.pos.x,
            hovered.group.position.y + 1.5,
            hovered.pos.z,
          )
        }
      }
    } else if (hoverLabel) {
      hoverLabel.visible = false
    }

    // Update connections
    for (const child of networkGroup.children) {
      if (child.userData.kind === 'edge') {
        const line = child as Line
        const m = line.material as ShaderMaterial
        if (m.uniforms) {
          const edgeHi = hi !== null && child.userData.slug === hi
          m.uniforms.uTime.value = elapsed
          m.uniforms.uOpacity.value = (edgeHi ? 0.5 : 0.18) * netPresence
          m.uniforms.uColor.value.setHex(edgeHi ? AMBER : STEEL)
        }
      }
    }

    coreInner.rotation.y += dt * (calm ? 0.6 : 0.25)
    coreInner.rotation.x = Math.sin(elapsed * 0.3) * 0.1
    coreEdge.rotation.y += dt * (calm ? 0.6 : 0.25)

    // Update pulses
    for (const p of pulsePool) {
      if (!p.active) continue
      p.life += dt
      p.mat.uniforms.uLife.value = p.life / 1.1
      p.mat.uniforms.uScale.value = 1 + (p.life / 1.1) * 7
      if (p.life >= 1.1) {
        p.ring.visible = false
        p.active = false
      }
    }

    // Update packets
    for (const p of packetPool) {
      if (!p.active) continue
      p.t += dt * 1.05
      if (p.t >= 1) {
        p.mesh.visible = false
        p.trail.visible = false
        p.active = false
        continue
      }
      const eased = p.t * p.t * (3 - 2 * p.t)
      const pos = p.curve.getPoint(eased)
      p.mesh.position.copy(pos)
      p.mat.uniforms.uTime.value = elapsed
      p.mat.uniforms.uOpacity.value = 1 - Math.pow(p.t, 3)
      p.trailMat.uniforms.uTime.value = elapsed

      // Update trail
      const trailPositions = p.trail.geometry.attributes.position.array as Float32Array
      const trailCount = trailPositions.length / 3
      for (let i = trailCount - 1; i > 0; i--) {
        trailPositions[i * 3] = trailPositions[(i - 1) * 3]
        trailPositions[i * 3 + 1] = trailPositions[(i - 1) * 3 + 1]
        trailPositions[i * 3 + 2] = trailPositions[(i - 1) * 3 + 2]
      }
      trailPositions[0] = pos.x
      trailPositions[1] = pos.y
      trailPositions[2] = pos.z
      p.trail.geometry.attributes.position.needsUpdate = true
    }

    // Archive mode
    if (archiveGroup.visible) {
      // The archive unwinds from the network on the way in and folds back
      // into it on the way out — scale carries the change, not `visible`.
      let archiveScale = 1
      if (morph.active) {
        if (morph.target === 'platinum') archiveScale = morphEased
        else if (morph.target !== 'error') archiveScale = Math.max(0, 1 - morphEased)
      }
      // Fragments trail the rings: they only start landing once the rings
      // have mostly settled.
      const fragmentScale =
        morph.active && morph.target === 'platinum'
          ? Math.max(0, morphEased * 1.3 - 0.3)
          : archiveScale

      ringMeshes.forEach((r, i) => {
        r.mesh.scale.setScalar(archiveScale)
        r.mesh.rotation.z += dt * r.spin * r.dir * (i === 1 ? 0.7 : 1)
      })
      vault.scale.setScalar(archiveScale)
      if (morph.active && morph.target === 'platinum') {
        vault.rotation.y = morphEased * Math.PI * 2
      }
      vault.rotation.y += dt * 0.4
      vault.rotation.x = Math.sin(elapsed * 0.3) * 0.15
      vaultMat.opacity = (0.6 + Math.sin(elapsed * 1.4) * 0.15) * presence.archive
      glowMat.opacity =
        morph.active && morph.target === 'platinum'
          ? 0.08 * morphEased
          : (0.06 + Math.sin(elapsed * 0.9) * 0.02) * presence.archive

      for (const f of fragments) {
        f.angle += dt * 0.12 * (f.ringIdx % 2 ? -1 : 1)
        f.mesh.position.set(
          Math.cos(f.angle) * radii[f.ringIdx],
          Math.sin(elapsed * 0.6 + f.angle * 3) * 0.35,
          Math.sin(f.angle) * radii[f.ringIdx],
        )
      }
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(
        fragments.map((f) => f.mesh as unknown as Mesh),
        false,
      )
      const hovered =
        hits.length > 0
          ? fragments.findIndex((f) => (f.mesh as unknown) === hits[0].object)
          : -1
      fragments.forEach((f, i) => {
        const isHot = i === hovered
        f.mesh.scale.setScalar((isHot ? 1.35 : 1) * fragmentScale)
        // The materials are shared: the hover is a swap, not a per-fragment
        // material state.
        f.mesh.material = isHot
          ? silhouetteHotMat
          : f.accent
            ? silhouetteAccentMat
            : silhouetteMat
      })
      silhouetteMat.opacity = 0.65 * presence.archive
      silhouetteAccentMat.opacity = 0.65 * presence.archive
      silhouetteHotMat.opacity = presence.archive
      sparks.scale.setScalar(archiveScale)
      sparkMat.uniforms.uTime.value = elapsed
      sparkMat.uniforms.uOpacity.value = 0.75 * presence.archive
    }

    // Lost node mode
    if (lostGroup.visible) {
      lostNode.rotation.y += dt * (0.5 + Math.sin(elapsed * 2.1) * 0.3)
      lostNode.rotation.x += dt * 0.18
      lostFlash = Math.max(0, lostFlash - dt * 0.8)
      // The core dive materialises the lost node out of the dark instead of
      // popping it in.
      const lostFade =
        morph.active && morph.target === 'error' ? morphEased : presence.lost
      lostMat.opacity =
        Math.min(1, 0.5 + (Math.sin(elapsed * 7) > 0.85 ? 0.4 : 0) + lostFlash) *
        lostFade
      lostGroup.position.x +=
        (smoothPointer.x * 1.1 - lostGroup.position.x) * Math.min(1, dt * 2)
      lostGroup.position.y +=
        (smoothPointer.y * 0.7 - lostGroup.position.y) * Math.min(1, dt * 2)
    }

    // Cinematic camera
    const preset = cameraPresets[snap.mode]
    let tx = preset.x
    let ty = preset.y
    let tz = preset.z
    const lookTarget = new three.Vector3(0, preset.lookY, 0)

    if (snap.mode === 'board') {
      const node = nodes.find((n) => n.slug === snap.boardSlug)
      if (node) {
        tx = node.pos.x * 0.55
        ty = node.pos.y * 0.55 + 1.0
        tz = node.pos.z + 8.5
        lookTarget.set(node.pos.x * 0.6, node.pos.y * 0.6, node.pos.z * 0.6)
      }
    }

    // Camera breathing
    const breathe = Math.sin(elapsed * 0.3) * 0.08
    ty += breathe

    cameraKick = Math.max(0, cameraKick - dt * 1.6)
    const camEase = Math.min(1, dt * 1.7)

    // Hover focus: a highlighted card / 3D node pulls the camera part of
    // the way towards that node — enough to say "here", not enough to lose
    // the map. Off under reduced motion, and off for the board the camera
    // already frames. It outranks the ambient auto-orbit, which would
    // otherwise drag the view away from what the user is reading.
    const focusNode =
      !reducedMotion &&
      snap.highlightedBoard !== null &&
      !(snap.mode === 'board' && snap.highlightedBoard === snap.boardSlug)
        ? nodes.find((n) => n.slug === snap.highlightedBoard)
        : undefined
    if (focusNode) {
      tx += focusNode.pos.x * FOCUS_STRENGTH
      ty += focusNode.pos.y * FOCUS_STRENGTH
      // Look between the core and the node: the constellation stays the
      // subject, the hovered board just becomes its centre of gravity.
      lookTarget.set(
        focusNode.pos.x * FOCUS_LOOK_AT,
        focusNode.pos.y * FOCUS_LOOK_AT,
        focusNode.pos.z * FOCUS_LOOK_AT,
      )
    }

    // The auto-orbit only drifts while home mode holds, motion is allowed
    // and nothing is hovered; hover focus would fight it, so the two never
    // run together.
    const orbiting = snap.mode === 'home' && !reducedMotion && !focusNode
    // Entering the orbit (mount, a travel that parked the camera, or a
    // hover that just released): pick up from where the camera already
    // stands instead of snapping to a fixed point of the circle.
    if (orbiting && !wasOrbiting) {
      orbitPhase =
        Math.atan2(camera.position.z, camera.position.x) - elapsed * ORBIT_SPEED
    }
    wasOrbiting = orbiting

    if (traveling) {
      travelElapsed += dt
      const t = Math.min(1, travelElapsed / travelDuration)
      const easedT = easeInOutCubic(t)
      camera.position.x = lerp(travelStart.x, travelTarget.x, easedT)
      camera.position.y = lerp(travelStart.y, travelTarget.y, easedT)
      camera.position.z = lerp(travelStart.z, travelTarget.z, easedT)
      // Shared element: the anchored board node keeps the camera's attention
      // for the whole trip, so the cut reads as one move.
      travelLookAt.set(0, travelTarget.lookY * easedT, 0)
      const sharedNode = resolveSharedNode()
      if (sharedNode) {
        travelLookAt.set(
          sharedNode.pos.x * 0.6,
          sharedNode.pos.y * 0.6,
          sharedNode.pos.z * 0.6,
        )
      }
      camera.lookAt(travelLookAt)
      if (t >= 1) {
        traveling = false
        sharedAnchor = null
        camera.position.set(travelTarget.x, travelTarget.y, travelTarget.z)
      }
    } else if (orbiting) {
      // Auto-orbit: home drifts the camera around the constellation instead
      // of parking it — the whole map stays readable from any angle. It
      // replaces the presence lerp while it runs.
      const orbitAngle = orbitPhase + elapsed * ORBIT_SPEED
      camera.position.x = Math.cos(orbitAngle) * ORBIT_RADIUS
      camera.position.z = Math.sin(orbitAngle) * ORBIT_RADIUS
      // Eased into the bob, so returning from a hover focus glides instead
      // of popping onto the drift.
      const orbitY =
        cameraPresets.home.y +
        Math.sin(elapsed * ORBIT_BOB_SPEED) * ORBIT_BOB_AMPLITUDE
      camera.position.y += (orbitY - camera.position.y) * Math.min(1, dt * 2)
      camera.lookAt(0, 0, 0)
    } else {
      camera.position.x += (tx + smoothPointer.x * 0.9 - camera.position.x) * camEase
      camera.position.y += (ty - smoothPointer.y * 0.55 - camera.position.y) * camEase
      camera.position.z += (tz - cameraKick * 1.6 - camera.position.z) * camEase
      camera.lookAt(lookTarget)
    }

    smoothPointer.x += (pointer.x - smoothPointer.x) * Math.min(1, dt * 2.2)
    smoothPointer.y += (pointer.y - smoothPointer.y) * Math.min(1, dt * 2.2)
  }

  setBoards([])
  setStoryCount(0)

  return {
    scene,
    camera,
    setBoards,
    getBoards,
    setStoryCount,
    pulseAt,
    sendReply,
    rescue,
    setComposerFocus: (on: boolean) => {
      composerFocus = on
    },
    launchPulse,
    dangerFlash,
    travelTo,
    morphTo,
    anchorSharedElement,
    launchEnvoyPacket,
    setPointer: (x, y) => pointer.set(x, y),
    getNodeAtPointer,
    update,
    dispose: () => {
      disposeHoverLabel()
      // The archive background (rings, vault, the shared silhouette geometry
      // and materials, the spark cloud) is tracked through `keep()`, so it is
      // released here with everything else — the fragments themselves own no
      // resources of their own.
      for (const d of [...tracked, ...nodeOwned]) {
        try {
          d.dispose()
        } catch {
          /* already disposed */
        }
      }
      nodeOwned = []
      fragments = []
      nodes = []
    },
  }
}
