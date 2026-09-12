<script setup lang="ts">
import { ref } from 'vue'

import { prefersReducedMotion } from '@/composables/useGsap'
import {
  useThreeScene,
  type ThreeBuildResult,
  type ThreeContext,
} from '@/composables/useThreeScene'
import {
  makeWarpMaterial,
  registerWarpPlayer,
  warpKindIndex,
} from '@/three/warps'

/**
 * Fullscreen shader overlay played during route transitions (item 3 of
 * the REAL3D plan): signal travel, depth tunnel, archive fracture.
 * Lives off the shared playWarp() bus; registers itself only while
 * 3D quality is active.
 */

const canvasRef = ref<HTMLCanvasElement | null>(null)
useThreeScene(canvasRef, build)

const DURATION = 0.65

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
      }
    },
    dispose: () => {
      registerWarpPlayer(null)
      geometry.dispose()
      material.dispose()
    },
  }
}
</script>

<template>
  <canvas ref="canvasRef" class="warp-canvas" aria-hidden="true"></canvas>
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
