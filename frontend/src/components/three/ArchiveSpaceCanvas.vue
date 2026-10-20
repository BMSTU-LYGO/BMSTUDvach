<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

import { prefersReducedMotion } from '@/composables/useGsap'
import {
  useThreeScene,
  type ThreeBuildResult,
  type ThreeContext,
} from '@/composables/useThreeScene'
import { buildArchiveSpace, type ArchiveSpaceController } from '@/three/archive/space'
import {
  emitSceneEvent,
  focusStory,
  onSceneEvent,
  sceneState,
  selectStory,
} from '@/three/sceneState'

/**
 * The Archive Space of the platinum section: a self-contained three.js
 * scene of epoch rings with one paper plate per story.
 *
 * The component is a thin wrapper around `useThreeScene` — it owns no
 * three.js object itself: the scene is built by `buildArchiveSpace`, the
 * state comes from `sceneState` and the pointer is translated into the NDC
 * of the canvas box (the archive is not necessarily fullscreen).
 *
 * The DOM list stays the source of truth: while the pointer rests on a row
 * of the list, that row owns the focus and the scene only follows it. The
 * camera never travels on a hover — it travels when a story is opened.
 */

const canvasRef = ref<HTMLCanvasElement | null>(null)
const { active } = useThreeScene(canvasRef, build)

/** The scene of the archive (null until the WebGL context is ready). */
let space: ArchiveSpaceController | null = null
/** Leaves the scene event bus. */
let offEvents: (() => void) | null = null
/** Stops the watchers of the story set and of the focus. */
let stopStoriesWatch: (() => void) | null = null
let stopFocusWatch: (() => void) | null = null
/** Releases everything the build owns — called on dispose and on unmount. */
let teardown: (() => void) | null = null

/** A pointer that travelled further than this is a drag, not a click. */
const DRAG_THRESHOLD = 4

/** Whether the pointer drags the archive right now. */
let dragging = false
/** How far the pointer travelled since the pointer went down. */
let dragDistance = 0
/** The last position of the pointer during the drag. */
let dragX = 0
let dragY = 0
/** The pointer the canvas captured for the drag. */
let dragPointerId: number | null = null

/**
 * The box of the canvas. The pointer is mapped into this box, not into the
 * window: the archive may live in a corner of the page.
 */
function canvasBox(): DOMRect | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  return rect
}

/** Whether the event happened on a row of the DOM list. */
function overListRow(target: EventTarget | null): boolean {
  const element = target as Element | null
  if (!element || typeof element.closest !== 'function') return false
  return !!element.closest('[data-testid="fragment-row"]')
}

function onPointerMove(e: PointerEvent) {
  const rect = canvasBox()
  if (!rect) return

  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
  const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
  space?.setPointer(ndcX, ndcY)

  if (dragging) {
    // A drag steers the camera; it never changes the focus.
    const dx = e.clientX - dragX
    const dy = e.clientY - dragY
    dragX = e.clientX
    dragY = e.clientY
    dragDistance += Math.abs(dx) + Math.abs(dy)
    space?.orbitBy(dx, dy)
    return
  }

  // The row of the list owns the focus while the pointer rests on it.
  if (overListRow(e.target)) return

  const hovered = space?.pointerStoryId() ?? null
  if (hovered !== sceneState.focusedStory) {
    focusStory(hovered)
    emitSceneEvent({ type: 'archive-focus', target: hovered })
  }
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  dragging = true
  dragDistance = 0
  dragX = e.clientX
  dragY = e.clientY
  dragPointerId = e.pointerId ?? null
  try {
    canvasRef.value?.setPointerCapture?.(e.pointerId)
  } catch {
    // The capture is a nicety — a drag without it still works.
  }
}

function onPointerUp() {
  if (!dragging) return
  dragging = false
  if (dragPointerId !== null) {
    try {
      canvasRef.value?.releasePointerCapture?.(dragPointerId)
    } catch {
      // The capture may already be gone — nothing to release.
    }
  }
  dragPointerId = null
}

function onClick(e: MouseEvent) {
  // A drag that ended over a plate is not a click on it.
  if (dragDistance > DRAG_THRESHOLD) {
    dragDistance = 0
    return
  }
  if (overListRow(e.target)) return
  const id = space?.pointerStoryId() ?? null
  if (id == null) return
  space?.focus(id)
  selectStory(id)
  emitSceneEvent({ type: 'archive-open', target: id })
  // The camera flies to the plate before the story comes in.
  space?.travelToFocus()
}

function build(ctx: ThreeContext): ThreeBuildResult {
  const archive = buildArchiveSpace(ctx.three, ctx.quality === 'high' ? 'high' : 'low')
  space = archive
  archive.setStories(sceneState.archiveStories)

  offEvents = onSceneEvent((ev) => {
    if (ev.type === 'archive-focus') {
      archive.focus(ev.target)
    } else if (ev.type === 'archive-open') {
      archive.focus(ev.target)
      archive.travelToFocus()
    } else if (ev.type === 'archive-clear') {
      archive.focus(null)
      archive.releaseFocus()
    }
  })

  // `sceneState.archiveStories` is the story descriptor array; watch an id
  // signature so identity churn (new objects, same stories) does not rebuild
  // the archive.
  stopStoriesWatch = watch(
    () => sceneState.archiveStories.map((s) => s.id).join('|'),
    () => archive.setStories(sceneState.archiveStories),
  ).stop
  stopFocusWatch = watch(
    () => sceneState.focusedStory,
    (id) => {
      // The focus follows the outside world, but the camera does not: it
      // would jump after the cursor on every hover of the DOM list.
      archive.focus(id)
    },
  ).stop

  teardown = () => {
    offEvents?.()
    offEvents = null
    stopStoriesWatch?.()
    stopStoriesWatch = null
    stopFocusWatch?.()
    stopFocusWatch = null
    archive.dispose()
    space = null
  }

  return {
    frame: (dt) =>
      archive.update(dt, {
        stories: sceneState.archiveStories,
        focusedStory: sceneState.focusedStory,
        selectedStory: sceneState.selectedStory,
        reducedMotion: prefersReducedMotion(),
      }),
    dispose: () => {
      teardown?.()
      teardown = null
    },
  }
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerup', onPointerUp, { passive: true })
  window.addEventListener('pointercancel', onPointerUp, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  teardown?.()
  teardown = null
})
</script>

<template>
  <div class="archive-canvas-wrap">
    <canvas
      ref="canvasRef"
      class="archive-canvas"
      :class="{ hidden: !active }"
      aria-hidden="true"
      @pointerdown="onPointerDown"
      @click="onClick"
    ></canvas>
    <div v-if="!active" class="archive-fallback" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.archive-canvas-wrap {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  /* The wrap is a background: the DOM list above it keeps its clicks. */
  pointer-events: none;
}

.archive-canvas {
  width: 100%;
  height: 100%;
  display: block;
  /* Only the canvas itself takes the pointer. */
  pointer-events: auto;
}

.archive-canvas.hidden {
  visibility: hidden;
}

.archive-fallback {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      ellipse 55% 45% at 50% 38%,
      oklch(0.72 0.16 65 / 0.06),
      transparent 70%
    ),
    radial-gradient(
      ellipse 45% 40% at 68% 72%,
      oklch(0.35 0.04 260 / 0.35),
      transparent 72%
    );
}
</style>
