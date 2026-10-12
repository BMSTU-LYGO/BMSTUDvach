<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

/**
 * Context Fiber (SIGNAL-08): a real visual link between a source post and
 * the Signal Dock — not a chip. A thin curved line is drawn from the post
 * edge to the dock. When the source scrolls out of the viewport the fiber
 * collapses into an edge indicator instead of stretching across the page.
 * Reduced motion: static line, no travelling dash.
 */
const props = defineProps<{
  source: HTMLElement | null
  target: HTMLElement | null
  label: string
}>()

interface Path {
  d: string
  from: { x: number; y: number }
  to: { x: number; y: number }
}

const path = ref<Path | null>(null)
const edge = ref<'top' | 'bottom' | null>(null)
const edgePos = ref({ x: 0, y: 0 })

let raf = 0

function measure() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => {
    const src = props.source
    const dst = props.target
    if (!src || !dst || !src.isConnected || !dst.isConnected) {
      path.value = null
      edge.value = null
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
      return
    }
    edge.value = null

    // from the source's right edge → into the dock's left-top corner
    const from = { x: s.right - 8, y: s.top + Math.min(28, s.height / 2) }
    const to = { x: t.left + 26, y: t.top - 6 }
    const bend = Math.max(60, Math.abs(to.y - from.y) * 0.45)
    const d = `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`
    path.value = { d, from, to }
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
  <div class="context-fiber" aria-hidden="true">
    <svg v-if="path" class="context-fiber__svg">
      <path class="context-fiber__line" :d="path.d" />
      <circle class="context-fiber__node context-fiber__node--source" :cx="path.from.x" :cy="path.from.y" r="3.5" />
      <circle class="context-fiber__node context-fiber__node--dock" :cx="path.to.x" :cy="path.to.y" r="2.5" />
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
      <span class="context-fiber__edge-arrow" :class="`context-fiber__edge-arrow--${edge}`"></span>
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
  fill: none;
  stroke: var(--accent);
  stroke-width: 1.2;
  opacity: 0.75;
  stroke-dasharray: 5 6;
  animation: fiber-flow 1.4s linear infinite;
}

.context-fiber__node {
  fill: var(--accent);
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
  border: 1px solid color-mix(in oklab, var(--accent) 45%, transparent);
  border-radius: 999px;
  color: var(--accent);
  font-family: var(--font-display);
  font-size: 0.7rem;
  cursor: pointer;
  pointer-events: auto;
}

.context-fiber__edge-arrow {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
}

.context-fiber__edge-arrow--top {
  border-bottom: 5px solid var(--accent);
}

.context-fiber__edge-arrow--bottom {
  border-top: 5px solid var(--accent);
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
