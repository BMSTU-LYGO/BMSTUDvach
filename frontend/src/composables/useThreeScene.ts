import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from 'vue'
import type {
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three'
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
}

/**
 * Owns the full lifecycle of one WebGL scene bound to a canvas element.
 *
 * - three.js is imported lazily; nothing renders until the module arrives.
 * - The loop pauses when the tab is hidden or the canvas is off-screen.
 * - Sustained < 30 fps triggers quality degradation (high→low→off).
 * - Everything (scene graph, renderer, observers) is disposed on unmount
 *   or when the resolved quality changes.
 */
export function useThreeScene(
  canvasRef: Ref<HTMLCanvasElement | null>,
  build: (ctx: ThreeContext) => ThreeBuildResult | void,
) {
  const { resolved, degrade } = useQuality3D()
  const supported = ref(true)
  const active = computed(() => resolved.value !== 'off' && supported.value)

  let sessionToken = 0
  let stopSession: (() => void) | null = null

  async function start() {
    stopSession?.()
    stopSession = null

    const canvas = canvasRef.value
    const quality = resolved.value
    if (!canvas || quality === 'off') return

    const token = ++sessionToken

    let three: ThreeModule
    try {
      three = await import('three')
    } catch {
      supported.value = false
      return
    }
    if (token !== sessionToken || !canvasRef.value) return

    let renderer: WebGLRenderer
    try {
      renderer = new three.WebGLRenderer({
        canvas,
        antialias: quality === 'high',
        alpha: true,
        powerPreference: 'high-performance',
      })
    } catch {
      supported.value = false
      return
    }

    renderer.setPixelRatio(
      quality === 'high' ? Math.min(window.devicePixelRatio, 2) : 1,
    )

    const scene = new three.Scene()
    const camera = new three.PerspectiveCamera(55, 1, 0.1, 200)

    function resize() {
      const w = canvas!.offsetWidth
      const h = canvas!.offsetHeight
      if (w === 0 || h === 0) return
      renderer!.setSize(w, h, false)
      camera!.aspect = w / h
      camera!.updateProjectionMatrix()
    }
    resize()

    const built = build({ three, scene, camera, renderer, quality })

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    let inView = true
    let pageVisible = !document.hidden
    let rafId = 0
    let last = performance.now()
    const frameSamples: number[] = []
    let degraded = false

    function shouldRender() {
      return inView && pageVisible
    }

    function tick(now: number) {
      rafId = requestAnimationFrame(tick)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      if (!shouldRender()) return

      built?.frame(dt)
      renderer!.render(scene, camera)

      // FPS guard: degrade once per resolved tier.
      if (!degraded) {
        frameSamples.push(dt)
        if (frameSamples.length >= 90) {
          const avg =
            frameSamples.reduce((sum, s) => sum + s, 0) / frameSamples.length
          frameSamples.length = 0
          if (avg > 0.033) {
            degraded = true
            degrade()
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

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting
        syncLoop()
      },
      { rootMargin: '120px' },
    )
    io.observe(canvas)

    const onVisibility = () => {
      pageVisible = !document.hidden
      syncLoop()
    }
    document.addEventListener('visibilitychange', onVisibility)

    syncLoop()

    stopSession = () => {
      if (rafId) cancelAnimationFrame(rafId)
      io.disconnect()
      resizeObserver.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      built?.dispose?.()
      scene.traverse((obj) => {
        const mesh = obj as unknown as {
          geometry?: { dispose: () => void }
          material?: { dispose: () => void }
        }
        mesh.geometry?.dispose()
        mesh.material?.dispose()
      })
      renderer!.dispose()
    }
  }

  onMounted(() => {
    void start()
  })

  watch(resolved, () => {
    void start()
  })

  onBeforeUnmount(() => {
    sessionToken++
    stopSession?.()
    stopSession = null
  })

  return { supported, active }
}
