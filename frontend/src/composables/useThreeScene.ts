import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from 'vue'
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { useQuality3D, type QualityResolved } from './useQuality3D'

type ThreeModule = typeof import('three')

export interface ThreeContext {
  three: ThreeModule
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  quality: QualityResolved
}

export interface ThreeBuildResult {
  /** Called every rendered frame with delta seconds (capped at 50ms). */
  frame: (dt: number) => void
  /** Optional extra cleanup for things not reachable from the scene graph. */
  dispose?: () => void
  /**
   * The scene the renderer has to draw.
   *
   * A builder that owns a scene graph of its own (the network, the archive
   * space) hands it over here: the renderer of the composable then draws
   * *that* scene and not the empty one it made for itself. Without it the
   * scene of the builder is built, animated — and never seen.
   */
  scene?: Scene
  /**
   * The camera the renderer has to look through. It belongs to the same
   * scene graph as `scene` and carries its own rig (the orbit, the focus
   * travel), so the composable must not move it on its own.
   */
  camera?: PerspectiveCamera
}

/**
 * Who wins the budget of the contexts when two scenes want it at once.
 *
 * The order is the order of the page: the scene of the route is the page
 * itself, the hero is the picture of the page, the overlay of the transition
 * is a flourish over it. A flourish never takes a slot away from a page.
 */
export const SCENE_PRIORITY = {
  /** The overlay of the route transition. */
  overlay: 10,
  /** The hero of the page (the core of the network on the home page). */
  hero: 20,
  /** The scene of the route (the network, the archive space). */
  scene: 30,
} as const

/** Options of a scene bound to a canvas. */
export interface ThreeSceneOptions {
  /**
   * The priority of the scene in the budget of the contexts. The scene with
   * the higher priority takes the free slot; a scene with the lower one
   * gives its slot away.
   */
  priority?: number
  /**
   * Whether the scene starts on its own.
   *
   * A scene that draws only from time to time (the overlay of a route
   * transition) starts itself when it has something to draw: a context that
   * is held for the whole life of the page and draws nothing is a slot of
   * the budget spent for nothing.
   */
  autoStart?: boolean
}

/** Hard budget: the route scene + the hero or the transition overlay. */
const MAX_ACTIVE_CONTEXTS = 2

/**
 * One slot of the budget, held by a scene.
 *
 * The lease is the unit of the budget: a scene holds one while it renders
 * and gives it back when it stops. The budget is therefore never more than
 * `MAX_ACTIVE_CONTEXTS` leases at the same time — the check and the claim
 * happen in one step, so three scenes that start together cannot all see a
 * free slot.
 */
interface SceneLease {
  /** The priority of the owner — the lower one yields first. */
  priority: number
  /**
   * The owner gives the slot away: its session goes with it.
   *
   * The scene that loses the slot does not die — it waits for a new one.
   */
  stop: () => void
}

/** The leases that are held right now. */
const leases = new Set<SceneLease>()
/** The scenes that wait for a free slot of the budget. */
const waiters = new Set<() => void>()

/**
 * The lease holder with the lowest priority — the one that gives its slot
 * away to a scene that needs it more.
 */
function weakestLease(priority: number): SceneLease | null {
  let weakest: SceneLease | null = null
  for (const lease of leases) {
    if (lease.priority >= priority) continue
    if (!weakest || lease.priority < weakest.priority) weakest = lease
  }
  return weakest
}

/**
 * Owns the full lifecycle of one WebGL scene bound to a canvas element.
 *
 * - three.js is imported lazily; nothing renders until the module arrives.
 * - The loop pauses when the tab is hidden or the canvas is off-screen.
 * - Sustained < 30 fps triggers quality degradation (high→low→off).
 * - Everything (scene graph, renderer, observers, context budget slot) is
 *   released on unmount or when the resolved quality changes.
 * - The budget of the contexts is shared by the whole application: the slot
 *   is reserved in one step (before the lazy import of three.js), and a
 *   scene that loses the race waits for a free slot instead of staying dead.
 */
export function useThreeScene(
  canvasRef: Ref<HTMLCanvasElement | null>,
  build: (ctx: ThreeContext) => ThreeBuildResult | void,
  options: ThreeSceneOptions = {},
) {
  const { resolved, degrade } = useQuality3D()
  const supported = ref(true)
  /** The scene lives and draws. */
  const running = ref(false)
  /** The scene wants to draw, but the budget of the contexts is full. */
  const starved = ref(false)
  const active = computed(
    () => resolved.value !== 'off' && supported.value && !starved.value,
  )

  const priority = options.priority ?? SCENE_PRIORITY.scene

  /**
   * The number of the session — the canvas of a scene is bound to it.
   *
   * Every session gets a canvas of its own: a WebGL context lives on the
   * element it was created on, and a context that nobody gives back stays
   * alive (with all its GPU buffers) until the browser kills the oldest
   * one. A new session therefore means a new element — and the old context
   * is lost by hand.
   */
  const sessionKey = ref(0)
  let sessionToken = 0
  let stopSession: (() => void) | null = null
  /** The slot of the budget this scene holds (null = it holds none). */
  let lease: SceneLease | null = null
  /** The retry that runs when the budget frees a slot. */
  let waiter: (() => void) | null = null
  /** The renderer of the live session — the context it holds. */
  let liveRenderer: WebGLRenderer | null = null
  /** Whether the scene wants to draw right now. */
  let wants = false

  /** Give the slot of the budget back — exactly once. */
  function dropLease() {
    if (!lease) return
    const held = lease
    lease = null
    leases.delete(held)
    // The waiters are woken in a microtask: the scene that freed the slot
    // takes it first, the others wait their turn.
    queueMicrotask(() => {
      for (const retry of Array.from(waiters)) retry()
    })
  }

  /** Tear the live session down — the canvas and the context go with it. */
  function stopLiveSession() {
    stopSession?.()
    stopSession = null
  }

  /** Take a slot of the budget. */
  function grantLease() {
    lease = {
      priority,
      stop: () => {
        // The session of the owner goes with the slot: the canvas of the
        // scene leaves the page and the context with it.
        stopLiveSession()
        dropLease()
        // The scene still wants to draw — it waits for a new slot.
        if (wants) {
          starved.value = true
          waitForSlot()
        }
      },
    }
    leases.add(lease)
  }

  /**
   * Take a slot of the budget.
   *
   * The check and the claim happen together: three scenes that start at the
   * same moment cannot all see a free slot, because the slot is taken
   * before the first `await` of the session.
   */
  function takeLease(): boolean {
    if (lease) return true
    if (leases.size < MAX_ACTIVE_CONTEXTS) {
      grantLease()
      return true
    }
    // The budget is full. The scene with the lowest priority gives its slot
    // away — a flourish never keeps a page from drawing.
    const victim = weakestLease(priority)
    if (!victim) return false
    victim.stop()
    if (leases.size >= MAX_ACTIVE_CONTEXTS) return false
    grantLease()
    return true
  }

  /** Wait for a free slot of the budget and try again. */
  function waitForSlot() {
    if (waiter) return
    const retry = () => {
      if (waiter !== retry) return
      waiter = null
      waiters.delete(retry)
      if (!wants) return
      // The canvas comes back with the scene: the waiting is over, the
      // page may draw again.
      starved.value = false
      void start()
    }
    waiter = retry
    waiters.add(retry)
  }

  /** Stop waiting for a slot of the budget. */
  function stopWaiting() {
    if (!waiter) return
    waiters.delete(waiter)
    waiter = null
  }

  /**
   * Release the WebGL context of the canvas by hand.
   *
   * The session that ends gives its context back on its own (see `stop`).
   * This is the last line of defence: a scene that never got a session must
   * not leave a context behind either.
   */
  function releaseContext() {
    const renderer = liveRenderer
    liveRenderer = null
    if (!renderer) return
    try {
      renderer.forceContextLoss()
    } catch {
      // The context is already gone — nothing to lose.
    }
  }

  async function start() {
    // The old session goes first: its slot is given back before the new
    // one asks for one.
    stopLiveSession()
    running.value = false

    // The canvas of the new session is a canvas of its own: the old one
    // leaves the page together with the context that was bound to it.
    sessionKey.value += 1

    // Let the DOM catch up (the canvas of the session is rendered with the
    // number of the session, so a fresh context is always bound to a fresh
    // element).
    await nextTick()

    const canvas = canvasRef.value
    const quality = resolved.value
    if (!canvas || quality === 'off') {
      wants = false
      stopWaiting()
      return
    }
    wants = true

    // The slot of the budget is reserved here — before the lazy import of
    // three.js, which is the first point where this function could give
    // the CPU away to another scene.
    if (!takeLease()) {
      // The budget is full: the scene waits for a slot instead of giving
      // up forever. A canvas that lost the race used to stay dead for the
      // whole life of the page.
      starved.value = true
      waitForSlot()
      return
    }
    starved.value = false
    stopWaiting()

    const token = ++sessionToken

    let three: ThreeModule
    try {
      three = await import('three')
    } catch {
      dropLease()
      supported.value = false
      return
    }
    if (token !== sessionToken || !canvasRef.value) {
      dropLease()
      return
    }

    let renderer: WebGLRenderer
    try {
      renderer = new three.WebGLRenderer({
        canvas,
        antialias: quality === 'high',
        alpha: true,
        powerPreference: 'high-performance',
      })
    } catch {
      dropLease()
      supported.value = false
      return
    }
    liveRenderer = renderer

    const scene = new three.Scene()
    const camera = new three.PerspectiveCamera(55, 1, 0.1, 200)
    /** The scene and the camera the renderer really draws. */
    let renderScene: Scene = scene
    let renderCamera: PerspectiveCamera = camera

    let built: ThreeBuildResult | void
    let resizeObserver: ResizeObserver | null = null
    let io: IntersectionObserver | null = null
    let rafId = 0

    function stop() {
      stopSession = null
      if (rafId) cancelAnimationFrame(rafId)
      rafId = 0
      io?.disconnect()
      resizeObserver?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      built?.dispose?.()
      built = undefined
      scene.traverse((obj) => {
        const mesh = obj as unknown as {
          geometry?: { dispose: () => void }
          material?: { dispose: () => void }
        }
        mesh.geometry?.dispose()
        mesh.material?.dispose()
      })
      // The context of the canvas is lost by hand: `renderer.dispose()`
      // gives the programs, the buffers and the textures back, but the
      // context itself stays alive — with everything it holds — until the
      // browser kills the oldest one. The canvas of the session leaves the
      // page with it, so the context may go too.
      try {
        renderer.forceContextLoss()
      } catch {
        // The context is already gone — nothing to lose.
      }
      renderer.dispose()
      if (liveRenderer === renderer) liveRenderer = null
      running.value = false
      dropLease()
    }
    stopSession = stop

    renderer.setPixelRatio(
      quality === 'high' ? Math.min(window.devicePixelRatio, 2) : 1,
    )

    function resize() {
      const w = canvas!.offsetWidth
      const h = canvas!.offsetHeight
      if (w === 0 || h === 0) return
      renderer!.setSize(w, h, false)
      renderCamera!.aspect = w / h
      renderCamera!.updateProjectionMatrix()
    }
    resize()

    try {
      built = build({ three, scene, camera, renderer, quality })
    } catch {
      stop()
      supported.value = false
      return
    }

    // A builder with a scene graph of its own hands it over: the renderer
    // draws that scene, not the empty one the composable made for itself.
    if (built?.scene) renderScene = built.scene
    if (built?.camera) renderCamera = built.camera
    resize()

    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    let inView = true
    let pageVisible = !document.hidden
    let last = performance.now()
    const frameSamples: number[] = []
    let degraded = false
    /** The frames the first ones after a start are not judged by. */
    let warmup = 30

    function shouldRender() {
      return inView && pageVisible
    }

    function tick(now: number) {
      rafId = requestAnimationFrame(tick)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      if (!shouldRender()) return

      built?.frame(dt)
      renderer!.render(renderScene, renderCamera)

      // FPS guard: degrade once per resolved tier. The median of the
      // window is judged, not the mean — a single hitch (a garbage
      // collection, a lazy chunk) must not send the scene down the tiers.
      if (!degraded) {
        if (warmup > 0) {
          warmup -= 1
        } else {
          frameSamples.push(dt)
          if (frameSamples.length >= 120) {
            const sorted = frameSamples.slice().sort((a, b) => a - b)
            const median = sorted[Math.floor(sorted.length / 2)] ?? 0
            frameSamples.length = 0
            if (median > 0.033) {
              degraded = true
              degrade()
            }
          }
        }
      }
    }

    function syncLoop() {
      if (shouldRender()) {
        if (!rafId) {
          last = performance.now()
          rafId = requestAnimationFrame(tick)
        }
      } else if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
    }

    io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting
        syncLoop()
      },
      { rootMargin: '120px' },
    )
    io.observe(canvas)

    function onVisibility() {
      pageVisible = !document.hidden
      syncLoop()
    }
    document.addEventListener('visibilitychange', onVisibility)

    running.value = true
    syncLoop()
  }

  onMounted(() => {
    if (options.autoStart === false) return
    void start()
  })

  watch(resolved, () => {
    void start()
  })

  onBeforeUnmount(() => {
    sessionToken++
    wants = false
    stopWaiting()
    // The canvas leaves the page with the component: the WebGL context has
    // to be released by hand, otherwise it — and every GPU buffer it holds
    // — stays alive until the browser kills the oldest one.
    releaseContext()
    stopSession?.()
    stopSession = null
  })

  return {
    supported,
    active,
    running,
    starved,
    sessionKey,
    /** Start the session by hand — for a scene that draws from time to time. */
    start: () => void start(),
    /** Stop the session and give the slot of the budget back. */
    stop: () => {
      stopLiveSession()
      stopWaiting()
      wants = false
    },
  }
}
