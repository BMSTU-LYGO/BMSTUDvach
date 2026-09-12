<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

import { useThreeScene, type ThreeBuildResult, type ThreeContext } from '@/composables/useThreeScene'
import { buildNetwork, type NetworkController } from '@/three/network'
import { onSceneEvent, sceneState } from '@/three/sceneState'

/**
 * The single persistent WebGL canvas shared by every route. The visual
 * mode (home / board / thread / platinum / error) comes from sceneState.
 */

const canvasRef = ref<HTMLCanvasElement | null>(null)
const { active } = useThreeScene(canvasRef, build)

let network: NetworkController | null = null
let offEvents: (() => void) | null = null
let stopBoardWatch: (() => void) | null = null
let stopStoryWatch: (() => void) | null = null

function onPointerMove(e: PointerEvent) {
  network?.setPointer(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1,
  )
}

function build(ctx: ThreeContext): ThreeBuildResult {
  const net = buildNetwork(ctx.three, ctx.quality)
  network = net
  net.setBoards(sceneState.boards)
  net.setStoryCount(sceneState.storyCount)

  offEvents = onSceneEvent((ev) => {
    if (ev.type === 'pulse') net.pulseAt(ev.target)
    else if (ev.type === 'reply') net.sendReply()
  })
  stopBoardWatch = watch(
    () => sceneState.boards.join('|'),
    () => net.setBoards(sceneState.boards),
  ).stop
  stopStoryWatch = watch(
    () => sceneState.storyCount,
    (n) => net.setStoryCount(n),
  ).stop

  return {
    frame: (dt) =>
      network?.update(dt, {
        mode: sceneState.mode,
        boardSlug: sceneState.boardSlug,
        highlightedBoard: sceneState.highlightedBoard,
      }),
    dispose: () => {
      offEvents?.()
      offEvents = null
      stopBoardWatch?.()
      stopBoardWatch = null
      stopStoryWatch?.()
      stopStoryWatch = null
      network?.dispose()
      network = null
    },
  }
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
})
</script>

<template>
  <div class="network-canvas-wrap">
    <canvas
      ref="canvasRef"
      class="network-canvas"
      :class="{ hidden: !active }"
      aria-hidden="true"
    ></canvas>
    <div v-if="!active" class="network-fallback" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.network-canvas-wrap {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.network-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.network-canvas.hidden {
  visibility: hidden;
}

.network-fallback {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 50% at 50% 35%, oklch(0.72 0.16 65 / 0.05), transparent 70%),
    radial-gradient(ellipse 40% 40% at 70% 70%, oklch(0.35 0.04 260 / 0.4), transparent 70%);
}
</style>
