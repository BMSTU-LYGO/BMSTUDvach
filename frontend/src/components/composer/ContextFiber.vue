<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

/**
 * Context Fiber (SIGNAL-08): a real visual link between a source post and
 * the Signal Dock — not a chip. A thin curved line is drawn from the post
 * edge to the dock. When the source scrolls out of the viewport the fiber
 * collapses into an edge indicator instead of stretching across the page.
 * Reduced motion: static line, no travelling dash.
 *
 * P3-T1c — the fiber and the dock are ONE link, not two decorations that
 * happen to be accent-coloured. The fiber measures the relationship itself
 * and publishes it (`link-state`: `idle | live | edge`), so the section can
 * mirror it and the dock's leading edge can answer with the very same
 * marker while the source has left the viewport. Both halves read the same
 * `--link-accent` token, so the line and the marker never drift apart.
 */
export type FiberLinkState = 'idle' | 'live' | 'edge'

const props = defineProps<{
  source: HTMLElement | null
  target: HTMLElement | null
  label: string
}>()

const emit = defineEmits<{
  'link-state': [state: FiberLinkState]
}>()

interface Path {
  d: string
  from: { x: number; y: number }
  to: { x: number; y: number }
}

const path = ref<Path | null>(null)
const edge = ref<'top' | 'bottom' | null>(null)
const edgePos = ref({ x: 0, y: 0 })
/** The published half of this link — the dock answers the `edge` state. */
const linkState = ref<FiberLinkState>('idle')

let raf = 0

function setLinkState(next: FiberLinkState) {
  if (linkState.value === next) return
  linkState.value = next
  emit('link-state', next)
}

function measure() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => {
    const src = props.source
    const dst = props.target
    if (!src || !dst || !src.isConnected || !dst.isConnected) {
      path.value = null
      edge.value = null
      setLinkState('idle')
      return
    }

    const s = src.getBoundingClientRect()
    const t = dst.getBoundingClientRect()
    const vh = window.innerHeight

    const sourceVisible = s.bottom > 24 && s.top < vh - 24
    if (!sourceVisible) {
      path.value = null
      edge.value = s.bottom <= 24 ? 'top' : 'bottom'
      edgePos.value = {
        x: Math.min(Math.max(s.left + s.width / 2, 72), window.innerWidth - 72),
        y: edge.value === 'top' ? 88 : vh - 132,
      }
      setLinkState('edge')
      return
    }
    edge.value = null

    // from the source's right edge → into the dock's leading edge, where
    // the dock lights its own accent marker: the line and the marker are
    // the same wire, drawn from both ends (P3-T1c)
    const from = { x: s.right - 8, y: s.top + Math.min(28, s.height / 2) }
    const to = { x: t.left + 1, y: t.top + Math.min(24, t.height / 2) }
    const bend = Math.max(60, Math.abs(to.y - from.y) * 0.45)
    const d = `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`
    path.value = { d, from, to }
    setLinkState('live')
  })
}

function scrollToSource() {
  props.source?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

let observer: ResizeObserver | null = null

onMounted(() => {
  window.addEventListener('scroll', measure, { passive: true })
  window.addEventListener('resize', measure)
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    if (props.source) observer.observe(props.source)
    if (props.target) observer.observe(props.target)
  }
  measure()
})

onUnmounted(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('scroll', measure)
  window.removeEventListener('resize', measure)
  observer?.disconnect()
})

watch(() => [props.source, props.target, props.label], measure)
</script>

<template>
  <div class="context-fiber" :class="`context-fiber--${linkState}`" aria-hidden="true">
    <svg v-if="path" class="context-fiber__svg">
      <path class="context-fiber__line" :d="path.d" />
      <circle
        class="context-fiber__node context-fiber__node--source"
        :cx="path.from.x"
        :cy="path.from.y"
        r="3.5"
      />
      <circle
        class="context-fiber__node context-fiber__node--dock"
        :cx="path.to.x"
        :cy="path.to.y"
        r="2.5"
      />
    </svg>

    <button
      v-if="edge"
      type="button"
      class="context-fiber__edge"
      :class="`context-fiber__edge--${edge}`"
      :style="{ left: `${edgePos.x}px`, top: `${edgePos.y}px` }"
      :aria-label="`Показать пост ${label}`"
      tabindex="-1"
      @click="scrollToSource"
    >
      <span
        class="context-fiber__edge-arrow"
        :class="`context-fiber__edge-arrow--${edge}`"
      ></span>
      <span class="context-fiber__edge-label">{{ label }}</span>
    </button>
  </div>
</template>

<style scoped>
.context-fiber {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 15;
}

.context-fiber__svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.context-fiber__line {
  /* Поток течёт равномерно: у линии свой ритм (1.4 с) и своя кривая —
     линейная, потому что линия не должна дёргаться на стыке цикла. */
  --fiber-flow-rhythm: 1.4s linear;
  fill: none;
  stroke: var(--link-accent, var(--accent));
  stroke-width: 1.2;
  /* the strength of the line follows the section's shared link token —
     the dock's leading edge burns with the same accent */
  opacity: calc(0.6 + 0.4 * var(--link-state, 1));
  stroke-dasharray: 5 6;
  animation: fiber-flow var(--fiber-flow-rhythm) infinite;
}

.context-fiber__node {
  fill: var(--link-accent, var(--accent));
}

.context-fiber__node--dock {
  opacity: 0.8;
}

.context-fiber__edge {
  position: absolute;
  transform: translate(-50%, -50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-raised);
  border: 1px solid
    color-mix(in oklab, var(--link-accent, var(--accent)) 45%, transparent);
  border-radius: 999px;
  color: var(--link-accent, var(--accent));
  font-family: var(--font-display);
  font-size: 0.7rem;
  cursor: pointer;
  pointer-events: auto;
  /* the same accent halo the dock's leading-edge bead wears — one marker,
     two ends of the same link */
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.context-fiber__edge-arrow {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
}

.context-fiber__edge-arrow--top {
  border-bottom: 5px solid var(--link-accent, var(--accent));
}

.context-fiber__edge-arrow--bottom {
  border-top: 5px solid var(--link-accent, var(--accent));
}

@keyframes fiber-flow {
  to {
    stroke-dashoffset: -22;
  }
}

@media (prefers-reduced-motion: reduce) {
  .context-fiber__line {
    animation: none;
  }
}
</style>
