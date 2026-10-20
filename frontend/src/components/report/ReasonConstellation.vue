<script setup lang="ts">
import { computed, ref } from 'vue'

import type { ReportReason } from '@/types'
import { gsap } from '@/composables/useGsap'
import NetworkIcon, { type NetworkIconName } from '../composer/NetworkIcon.vue'

interface ReasonNode {
  id: ReportReason
  label: string
  glyph: NetworkIconName
}

/** Five real reasons from the API contract — no emoji, no <select>. */
const REASONS: ReasonNode[] = [
  { id: 'spam', label: 'Спам', glyph: 'spam' },
  { id: 'abuse', label: 'Оскорбления', glyph: 'abuse' },
  { id: 'illegal', label: 'Нелегал', glyph: 'illegal' },
  { id: 'offtopic', label: 'Оффтоп', glyph: 'offtopic' },
  { id: 'other', label: 'Другое', glyph: 'other' },
]

const model = defineModel<ReportReason | null>({ required: true })
const emit = defineEmits<{ pick: [reason: ReportReason] }>()

const nodeRefs = ref<(HTMLElement | null)[]>([])
const wireRefs = ref<(SVGLineElement | null)[]>([])
const originRef = ref<HTMLElement | null>(null)

// Radial arc geometry (desktop). Mobile overrides to a vertical track in CSS.
const ARC = { r: 118, start: 196, step: 37 }
const layout = computed(() =>
  REASONS.map((reason, i) => {
    const a = ((ARC.start + i * ARC.step) * Math.PI) / 180
    return {
      ...reason,
      x: 150 + ARC.r * Math.cos(a),
      y: 128 + ARC.r * Math.sin(a) * 0.62,
      index: i,
    }
  }),
)

// The morph clock (probe stage1 → stage2, P3-T3): the constellation is never
// re-rendered, only faded, so every node keeps the exact slot stage 1 left it
// in — which is what makes a return morph possible at all.
const FADE_MS = 420
const FADE_STAGGER_MS = 50
// The chosen node hands itself over to the flying twin that leaves its slot;
// it only re-appears once that twin is about to land, so the handover is a
// crossfade instead of a blink.
const KEEP_DELAY_MS = 300
const KEEP_MS = 240

interface FadeOptions {
  /** Reduced motion: a plain fade, no collapse, no stagger. */
  reduced?: boolean
}

function center(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

/**
 * Live viewport rect of a reason node's ring — the source (stage 1) and the
 * target (stage 2) of the flight the probe plays.
 */
function nodeRect(id: ReportReason): DOMRect | null {
  const index = REASONS.findIndex((reason) => reason.id === id)
  if (index < 0) return null
  return nodeRefs.value[index]?.getBoundingClientRect() ?? null
}

/** Live viewport rect of the origin every wire converges at. */
function originRect(): DOMRect | null {
  return originRef.value?.getBoundingClientRect() ?? null
}

/** `null` when geometry is not measurable (jsdom, detached). */
function measurable(rect: DOMRect | null | undefined): rect is DOMRect {
  return !!rect && (rect.width > 0 || rect.height > 0)
}

/** Where the five wires meet. */
function originCenter(): { x: number; y: number } | null {
  const rect = originRect()
  return measurable(rect) ? center(rect) : null
}

function nodeCenter(index: number): { x: number; y: number } | null {
  const rect = nodeRefs.value[index]?.getBoundingClientRect()
  return measurable(rect) ? center(rect) : null
}

/**
 * The dying order: nearest to the origin first, so the constellation
 * collapses along its own wires instead of blinking out in reading order.
 * The mirror (farthest first) is how it comes back.
 */
function fadeOrder(keep: ReportReason | null, nearestFirst: boolean) {
  const origin = originCenter()
  return REASONS.map((reason, i) => {
    const node = nodeCenter(i)
    const distance =
      origin && node ? Math.hypot(origin.x - node.x, origin.y - node.y) : i
    return { id: reason.id, index: i, distance }
  })
    .filter((entry) => entry.id !== keep)
    .sort((a, b) => (nearestFirst ? a.distance - b.distance : b.distance - a.distance))
}

function liveWires(): SVGLineElement[] {
  return wireRefs.value.filter((el): el is SVGLineElement => el !== null)
}

function keepIndex(keep: ReportReason | null): number {
  return keep === null ? -1 : REASONS.findIndex((reason) => reason.id === keep)
}

/**
 * Every node but the chosen one dies along its own wire, collapsing toward
 * the origin; the wires fade with them. The chosen node simply lifts out —
 * the probe flies a twin of it to the stage-2 anchor.
 */
function recede(keep: ReportReason | null, options: FadeOptions = {}): void {
  const reduced = options.reduced === true
  const origin = originCenter()

  fadeOrder(keep, true).forEach((entry, order) => {
    const el = nodeRefs.value[entry.index]
    if (!el) return
    const vars: gsap.TweenVars = {
      opacity: 0,
      duration: reduced ? 0.14 : FADE_MS / 1000,
      delay: reduced ? 0 : (order * FADE_STAGGER_MS) / 1000,
      ease: 'power2.in',
    }
    if (!reduced) {
      vars.scale = 0.4
      const node = nodeCenter(entry.index)
      if (origin && node) {
        vars.x = (origin.x - node.x) * 0.92
        vars.y = (origin.y - node.y) * 0.92
      }
    }
    gsap.to(el, vars)
  })

  gsap.to(liveWires(), {
    opacity: 0,
    duration: reduced ? 0.14 : 0.4,
    ease: 'power1.out',
    stagger: reduced ? 0 : 0.03,
  })

  const live = nodeRefs.value[keepIndex(keep)]
  if (live) {
    gsap.to(live, {
      opacity: 0,
      duration: reduced ? 0.14 : 0.26,
      ease: 'power2.in',
      ...(reduced ? {} : { scale: 0.86 }),
    })
  }
}

/**
 * The reverse morph: the constellation comes back farthest-first, and the
 * chosen node lands with the flying twin that is returning to its slot.
 */
function restore(keep: ReportReason | null, options: FadeOptions = {}): void {
  const reduced = options.reduced === true

  fadeOrder(keep, false).forEach((entry, order) => {
    const el = nodeRefs.value[entry.index]
    if (!el) return
    gsap.to(el, {
      opacity: 1,
      duration: reduced ? 0.14 : 0.42,
      delay: reduced ? 0 : (order * FADE_STAGGER_MS) / 1000,
      ease: 'power2.out',
      ...(reduced ? {} : { scale: 1, x: 0, y: 0 }),
    })
  })

  gsap.to(liveWires(), {
    opacity: 1,
    duration: reduced ? 0.14 : 0.4,
    ease: 'power1.out',
    stagger: reduced ? 0 : 0.03,
  })

  const live = nodeRefs.value[keepIndex(keep)]
  if (live) {
    gsap.to(live, {
      opacity: 1,
      duration: reduced ? 0.14 : KEEP_MS / 1000,
      delay: reduced ? 0 : KEEP_DELAY_MS / 1000,
      ease: 'power1.out',
      ...(reduced ? {} : { scale: 1, x: 0, y: 0 }),
    })
  }
}

function focusIndex(i: number) {
  nodeRefs.value[i]?.focus()
}

/** Hand the keyboard back to a reason node after a return morph. */
function focusNode(id: ReportReason) {
  const index = REASONS.findIndex((reason) => reason.id === id)
  if (index >= 0) focusIndex(index)
}

function onKeydown(e: KeyboardEvent, i: number) {
  const last = layout.value.length - 1
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault()
    focusIndex(i === last ? 0 : i + 1)
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault()
    focusIndex(i === 0 ? last : i - 1)
  }
}

function pick(reason: ReportReason, i: number) {
  model.value = reason
  emit('pick', reason)
  focusIndex(i)
}

defineExpose({ nodeRect, originRect, recede, restore, focusNode })
</script>

<template>
  <div class="constellation" role="radiogroup" aria-label="Причина жалобы">
    <!-- desktop: fiber lines from the probe origin to every reason node -->
    <svg class="constellation__wires" aria-hidden="true">
      <line
        v-for="node in layout"
        :key="`w-${node.id}`"
        :ref="(el) => (wireRefs[node.index] = el as SVGLineElement)"
        x1="150"
        y1="128"
        :x2="node.x"
        :y2="node.y"
        :class="{ 'constellation__wire--live': model === node.id }"
      />
    </svg>

    <button
      v-for="node in layout"
      :key="node.id"
      :ref="(el) => (nodeRefs[node.index] = el as HTMLElement)"
      type="button"
      class="node"
      role="radio"
      :aria-checked="model === node.id"
      :class="{ 'node--live': model === node.id }"
      :style="{ left: `${node.x}px`, top: `${node.y}px` }"
      :data-testid="`reason-${node.id}`"
      @click="pick(node.id, node.index)"
      @keydown="onKeydown($event, node.index)"
    >
      <span class="node__ring" aria-hidden="true">
        <span class="node__glyph">
          <NetworkIcon :name="node.glyph" :size="16" :stroke-width="1.6" />
        </span>
      </span>
      <span class="node__label">{{ node.label }}</span>
    </button>

    <span ref="originRef" class="constellation__origin" aria-hidden="true"></span>
  </div>
</template>

<style scoped>
.constellation {
  position: relative;
  height: 172px;
  margin: 0 auto;
  max-width: 320px;
}

.constellation__wires {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.constellation__wires line {
  stroke: var(--rule);
  stroke-width: 1;
  transition: stroke 220ms var(--ease-out-quart);
}

.constellation__wires .constellation__wire--live {
  stroke: var(--accent);
}

.node {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: var(--ink-tertiary);
}

/* the one geometry the stage-2 anchor mirrors: a 34px reason ring */
.node__ring {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--rule);
  display: grid;
  place-items: center;
  background: var(--paper);
  transition:
    border-color 200ms var(--ease-out-quart),
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.node__glyph {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
}

.node__label {
  font-family: var(--font-body);
  font-size: 0.62rem;
  white-space: nowrap;
  opacity: 0.75;
  transition:
    opacity 160ms,
    color 160ms;
}

.node:hover .node__ring,
.node:focus-visible .node__ring {
  border-color: var(--accent);
  transform: scale(1.1);
}

.node:hover .node__label,
.node:focus-visible .node__label {
  opacity: 1;
}

.node--live {
  color: var(--accent);
}

.node--live .node__ring {
  border-color: var(--accent);
}

.node--live .node__label {
  opacity: 1;
  color: var(--accent);
}

.constellation__origin {
  position: absolute;
  left: 150px;
  top: 128px;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}

/* mobile: vertical diagnostic track, not a card stack */
@media (max-width: 640px) {
  .constellation {
    height: auto;
    max-width: none;
    display: flex;
    flex-direction: column;
  }

  .constellation__wires {
    display: none;
  }

  .constellation__origin {
    display: none;
  }

  .node {
    position: static;
    transform: none;
    flex-direction: row;
    align-items: center;
    gap: var(--space-3);
    min-height: 44px;
    padding: 0 var(--space-2);
  }

  .node__ring {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
  }

  .node__label {
    font-size: 0.72rem;
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .node__ring,
  .constellation__wires line {
    transition: none;
  }
}
</style>
