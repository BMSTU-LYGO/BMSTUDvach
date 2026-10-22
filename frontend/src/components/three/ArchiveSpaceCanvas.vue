<script setup lang="ts">
import {
  defineComponent,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
  type ComponentPublicInstance,
} from 'vue'

import { prefersReducedMotion } from '@/composables/useGsap'
import {
  SCENE_PRIORITY,
  useThreeScene,
  type ThreeBuildResult,
  type ThreeContext,
} from '@/composables/useThreeScene'
import {
  buildArchiveSpace,
  type ArchiveSpaceController,
  type ArchiveSpacePhase,
} from '@/three/archive/space'
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
 *
 * The canvas itself is decorative (`aria-hidden`): the list of fragments
 * is what a screen reader reads. The wrap around it carries one short
 * label, so the space is not a mystery to the reader.
 */

/* === The register: the space in 3D or the archive as text only ========= */

/**
 * The reader's choice: the archive in 3D or as text only. The choice lives
 * in the device-local storage and travels from the view (which owns the
 * switch) to this canvas through a window event — the two live in different
 * component trees. The same two names are kept in `views/PlatinumView.vue`.
 */
const ARCHIVE_3D_STORAGE_KEY = 'bmstudvach-archive-3d'
const ARCHIVE_3D_EVENT = 'bmstudvach:archive-3d'

/** The stored register of the archive (3D is the default one). */
function readArchive3D(): boolean {
  try {
    const stored = localStorage.getItem(ARCHIVE_3D_STORAGE_KEY)
    if (stored === 'on') return true
    if (stored === 'off') return false
  } catch {
    // blocked storage — the space keeps the register it has
  }
  return true
}

/** Whether the space is rendered at all. */
const enabled = ref(readArchive3D())

/** What the space looks like to a screen reader. */
const SPACE_LABEL = 'Архивное пространство: кольца эпох и фрагменты историй'

/**
 * The switch of the view arrived: the space follows it. The storage is
 * written here as well — the canvas may be mounted before the view reads
 * the choice.
 */
function onArchive3D(event: Event) {
  const detail = (event as CustomEvent<{ enabled?: unknown }>).detail
  const next = typeof detail?.enabled === 'boolean' ? detail.enabled : readArchive3D()
  enabled.value = next
  try {
    localStorage.setItem(ARCHIVE_3D_STORAGE_KEY, next ? 'on' : 'off')
  } catch {
    // blocked storage — the choice lives only as long as the page
  }
}

/* === The state of the page: the space says it in its own voice ========== */

/**
 * The state of the page: the space says it in its own voice.
 *
 * The view knows whether the vault is being asked, whether the line broke
 * and whether the archive is simply silent. The two live in different
 * component trees, so the state travels through the window — the same way
 * the register of the archive (3D or text only) travels.
 */
const ARCHIVE_PHASE_EVENT = 'bmstudvach:archive-phase'
const ARCHIVE_PHASE_REQUEST_EVENT = 'bmstudvach:archive-phase-request'
/**
 * The reader picked a plate in the space itself.
 *
 * The scene bus carries what the *scene* does (focus, open, clear), but
 * the route is led by the view: a navigation from a scene handler would
 * answer the route guard that published the event, and the two calls would
 * push each other in a circle that never ends the navigation. So the pick
 * travels through the window and the view opens the story.
 */
const ARCHIVE_PICK_EVENT = 'bmstudvach:archive-pick'

/** The states the space knows — anything else is left alone. */
const ARCHIVE_PHASES: ArchiveSpacePhase[] = ['loading', 'ready', 'error', 'empty']

/** The state of the page the space mirrors right now. */
const phase = ref<ArchiveSpacePhase>('ready')

/** The view told the space which state the page is in. */
function onArchivePhase(event: Event) {
  const detail = (event as CustomEvent<{ phase?: unknown }>).detail
  if (typeof detail?.phase !== 'string') return
  const next = detail.phase as ArchiveSpacePhase
  if (!ARCHIVE_PHASES.includes(next)) return
  phase.value = next
}

/* === The session: the canvas and the WebGL context it holds ============ */

/**
 * The canvas element and the state of the session. The session itself is
 * owned by a child component: when the archive goes text only the child is
 * unmounted, the WebGL context is given back and the budget of
 * `MAX_ACTIVE_CONTEXTS` is left alone.
 */
const canvasHolder = { ref: ref<HTMLCanvasElement | null>(null) }
const status = reactive({ active: true })
/**
 * The number of the session — the canvas of the space is bound to it.
 *
 * The session lives in a child component (the space may be switched off
 * without unmounting the view), so the number travels up to the template
 * of the wrap.
 */
const sessionKey = ref(0)

/** The canvas of the space (a function ref keeps the holder in sync). */
function setCanvas(el: Element | ComponentPublicInstance | null) {
  canvasHolder.ref.value = (el as HTMLCanvasElement | null) ?? null
}

/** The scene of the archive (null until the WebGL context is ready). */
let space: ArchiveSpaceController | null = null
/** Leaves the scene event bus. */
let offEvents: (() => void) | null = null
/** Stops the watchers of the story set and of the focus. */
let stopStoriesWatch: (() => void) | null = null
let stopFocusWatch: (() => void) | null = null
/** Stops the watcher of the state of the page. */
let stopPhaseWatch: (() => void) | null = null
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
  const canvas = canvasHolder.ref.value
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
    canvasHolder.ref.value?.setPointerCapture?.(e.pointerId)
  } catch {
    // The capture is a nicety — a drag without it still works.
  }
}

function onPointerUp() {
  if (!dragging) return
  dragging = false
  if (dragPointerId !== null) {
    try {
      canvasHolder.ref.value?.releasePointerCapture?.(dragPointerId)
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
  // The view opens the story — the route belongs to it, not to the scene.
  window.dispatchEvent(
    new CustomEvent(ARCHIVE_PICK_EVENT, { detail: { id } }),
  )
}

function build(ctx: ThreeContext): ThreeBuildResult {
  const archive = buildArchiveSpace(ctx.three, ctx.quality === 'high' ? 'high' : 'low')
  space = archive
  archive.setStories(sceneState.archiveStories)

  // The scene is told which state the page is in: the space has to say
  // "loading / broken / silent" in its own voice — with the light, the
  // rings and the dust, not with words.
  archive.setPhase?.(phase.value)

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

  // The state of the page follows the view: the scene changes its voice
  // with it — the rings wake up, the light leaves or the space goes quiet.
  stopPhaseWatch = watch(phase, (next) => {
    space?.setPhase?.(next)
  }).stop

  teardown = () => {
    offEvents?.()
    offEvents = null
    stopStoriesWatch?.()
    stopStoriesWatch = null
    stopFocusWatch?.()
    stopFocusWatch = null
    stopPhaseWatch?.()
    stopPhaseWatch = null
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
    // The archive owns its scene graph and its camera rig: the renderer has
    // to draw *these*, not the empty scene the composable made for itself.
    // Without them the rings, the plates and the dust are built, animated —
    // and never seen.
    scene: archive.scene,
    camera: archive.camera,
    dispose: () => {
      teardown?.()
      teardown = null
    },
  }
}

/**
 * The holder of the WebGL session. It renders nothing of its own: the
 * canvas stays in the template of the wrapper (its styles are scoped
 * there), while the context lives here — so that the text-only mode can
 * unmount the session and give the context back.
 */
const ArchiveScene = defineComponent({
  name: 'ArchiveSpaceScene',
  setup() {
    // The archive is the scene of the route: it is the first one to get a
    // slot of the budget of the contexts.
    const { active, sessionKey: key } = useThreeScene(canvasHolder.ref, build, {
      priority: SCENE_PRIORITY.scene,
    })
    watch(
      active,
      (value) => {
        status.active = value
      },
      { immediate: true, flush: 'sync' },
    )
    // The number of the session travels up: the canvas of the wrap is
    // bound to it, so a new session always gets a canvas of its own.
    watch(
      key,
      (value) => {
        sessionKey.value = value
      },
      { immediate: true, flush: 'sync' },
    )
    return () => null
  },
})

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerup', onPointerUp, { passive: true })
  window.addEventListener('pointercancel', onPointerUp, { passive: true })
  window.addEventListener(ARCHIVE_3D_EVENT, onArchive3D)
  window.addEventListener(ARCHIVE_PHASE_EVENT, onArchivePhase)
  // The space may mount after the view: ask who holds the state of the
  // page — the view answers with the state it is in right now.
  window.dispatchEvent(new CustomEvent(ARCHIVE_PHASE_REQUEST_EVENT))
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener(ARCHIVE_3D_EVENT, onArchive3D)
  window.removeEventListener(ARCHIVE_PHASE_EVENT, onArchivePhase)
  teardown?.()
  teardown = null
})
</script>

<template>
  <div
    class="archive-canvas-wrap"
    :class="{ 'archive-canvas-wrap--off': !enabled }"
    :role="enabled ? 'img' : undefined"
    :aria-label="enabled ? SPACE_LABEL : undefined"
    :aria-hidden="enabled ? undefined : 'true'"
  >
    <template v-if="enabled">
      <canvas
        v-if="status.active"
        :key="sessionKey"
        :ref="setCanvas"
        class="archive-canvas"
        aria-hidden="true"
        @pointerdown="onPointerDown"
        @click="onClick"
      ></canvas>
      <div v-if="!status.active" class="archive-fallback" aria-hidden="true"></div>
      <ArchiveScene />
    </template>
  </div>
</template>

<style scoped>
.archive-canvas-wrap {
  position: absolute;
  inset: 0;
  /* The space is a background of the page: the rings, the plates and the
     dust stay under the words of the list — the text is read on top of
     them, never under them. */
  z-index: -1;
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

/* The archive went text only: the space is not on the page at all. */
.archive-canvas-wrap--off {
  display: none;
}
</style>
