<script setup lang="ts">
import { onUnmounted, ref } from 'vue'

import { prefersReducedMotion } from '@/composables/useGsap'
import {
  SCENE_PRIORITY,
  useThreeScene,
  type ThreeBuildResult,
  type ThreeContext,
} from '@/composables/useThreeScene'
import {
  makeWarpMaterial,
  onWarpRequest,
  registerWarpPlayer,
  warpKindIndex,
} from '@/three/warps'

/**
 * Fullscreen shader overlay played during route transitions (item 3 of
 * the REAL3D plan): signal travel, depth tunnel, archive fracture.
 * Lives off the shared playWarp() bus; registers itself only while
 * 3D quality is active.
 *
 * The overlay holds **no** context while it has nothing to draw: it takes
 * a slot of the budget of the contexts when a transition starts and gives
 * it back when the transition is over. A flourish that keeps a slot for
 * the whole life of the page is a slot the page cannot use.
 */

const canvasRef = ref<HTMLCanvasElement | null>(null)

const DURATION = 0.65

/** Whether the overlay wants a canvas on the page right now. */
const wanted = ref(false)

const { active, running, sessionKey, start, stop } = useThreeScene(
  canvasRef,
  build,
  {
    priority: SCENE_PRIORITY.overlay,
    autoStart: false,
  },
)

function build(ctx: ThreeContext): ThreeBuildResult {
  const { three, scene, camera } = ctx
  const material = makeWarpMaterial(three)
  const geometry = new three.PlaneGeometry(2, 2)
  const mesh = new three.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.visible = false
  scene.add(mesh)
  camera.position.z = 1

  let playing = false
  let progress = 0

  registerWarpPlayer((kind) => {
    if (prefersReducedMotion()) return
    material.uniforms.uKind.value = warpKindIndex(kind)
    playing = true
    progress = 0
    mesh.visible = true
  })

  return {
    frame: (dt) => {
      material.uniforms.uAspect.value =
        window.innerWidth / Math.max(1, window.innerHeight)
      if (!playing) return
      progress = Math.min(1, progress + dt / DURATION)
      const t = progress
      material.uniforms.uProgress.value =
        t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      material.uniforms.uTime.value = t
      if (progress >= 1) {
        playing = false
        mesh.visible = false
        // The transition is over: the overlay gives the slot of the budget
        // back. The next transition wakes it up again.
        release()
      }
    },
    dispose: () => {
      registerWarpPlayer(null)
      geometry.dispose()
      material.dispose()
    },
  }
}

/**
 * Give the slot of the budget back — after the frame that ended the
 * transition, so the renderer is not disposed under its own feet.
 */
let releaseTimer: ReturnType<typeof setTimeout> | null = null
function release() {
  if (releaseTimer !== null) return
  releaseTimer = setTimeout(() => {
    releaseTimer = null
    wanted.value = false
    stop()
  }, 0)
}

/**
 * A transition starts: the overlay wakes up and takes a slot of the budget.
 * If the budget is full, the session does not start — the request waits in
 * `warps.ts` until the overlay is on screen again.
 */
const offRequest = onWarpRequest(() => {
  if (prefersReducedMotion()) return
  if (running.value) return
  if (releaseTimer !== null) {
    clearTimeout(releaseTimer)
    releaseTimer = null
  }
  wanted.value = true
  void start()
})

onUnmounted(() => {
  offRequest()
  if (releaseTimer !== null) {
    clearTimeout(releaseTimer)
    releaseTimer = null
  }
})
</script>

<template>
  <canvas
    v-if="wanted && active"
    :key="sessionKey"
    ref="canvasRef"
    class="warp-canvas"
    aria-hidden="true"
  ></canvas>
</template>

<style scoped>
.warp-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: var(--z-warp);
}
</style>
