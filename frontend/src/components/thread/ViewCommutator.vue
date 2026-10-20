<script setup lang="ts">
import { computed } from 'vue'

/**
 * View commutator (P3-T4).
 *
 * The board used to carry two identical rectangular toggles — a generic
 * segmented control with a «list» pill and a «catalog» pill, both telling
 * the same binary story. A binary state wants one control, so the switch
 * became a single node: a round hairline bezel, kin of the dock's lens,
 * with a glyph that morphs between the two views.
 *
 * The morph is geometric, not a cross-fade: the four hairlines of the
 * list bloom into the four squares of the cluster grid. Each row keeps its
 * anchor — left rows stay left, right rows stay right — and only grows
 * into its own square of the grid, staggered row by row over 200ms. The
 * node's `title`/`aria-label` name the view you are in and the one the
 * click will bring, `aria-pressed` carries the cluster state, and the
 * bezel lights up while the cluster holds.
 */
export type ViewMode = 'list' | 'catalog'

const props = defineProps<{ modelValue: ViewMode }>()

const emit = defineEmits<{ change: [mode: ViewMode] }>()

const cluster = computed(() => props.modelValue === 'catalog')
const nextMode = computed<ViewMode>(() => (cluster.value ? 'list' : 'catalog'))
const hint = computed(() =>
  cluster.value
    ? 'Каталог узлов — переключить на список тредов'
    : 'Список тредов — переключить на каталог узлов',
)

// list rows: four hairlines. In the cluster they become the four squares
// of the 2×2 grid, each anchored to its own side of the glyph.
const ROWS = [
  { y: 2.5, side: 'left', dy: 1.25 },
  { y: 6, side: 'right', dy: -2.25 },
  { y: 9.5, side: 'left', dy: 1.25 },
  { y: 13, side: 'right', dy: -2.25 },
] as const

function toggle() {
  emit('change', nextMode.value)
}
</script>

<template>
  <button
    type="button"
    class="view-node"
    :class="{ 'view-node--cluster': cluster }"
    data-testid="view-commutator"
    :data-mode="modelValue"
    :title="hint"
    :aria-label="hint"
    :aria-pressed="cluster"
    @click="toggle"
  >
    <svg
      class="view-node__glyph"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        v-for="(row, i) in ROWS"
        :key="row.y"
        class="view-node__hair"
        :class="`view-node__hair--${row.side}`"
        x="2"
        :y="row.y"
        width="12"
        height="1.5"
        :style="{ '--dy': `${row.dy}px`, '--row': String(i) }"
      />
    </svg>
  </button>
</template>

<style scoped>
/* one node, not two pills: a hairline bezel with a morphing glyph */
.view-node {
  position: relative;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--rule);
  border-radius: 50%;
  background: none;
  color: var(--ink-tertiary);
  cursor: pointer;
  transition:
    color var(--duration-normal) var(--ease-out),
    border-color var(--duration-normal) var(--ease-out),
    background var(--duration-normal) var(--ease-out);
}

/* the lens' inner hairline — it opens only while the cluster holds */
.view-node::after {
  content: '';
  position: absolute;
  inset: 4px;
  border: 1px solid currentColor;
  border-radius: 50%;
  opacity: 0;
  transition: opacity var(--duration-normal) var(--ease-out);
}

.view-node:hover {
  color: var(--ink);
  border-color: var(--ink-tertiary);
}

.view-node:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.view-node--cluster {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-glow);
}

.view-node--cluster::after {
  opacity: 0.35;
}

.view-node__glyph {
  display: block;
  fill: currentColor;
}

/* ── the morph: hairlines → grid squares ── */
.view-node__hair {
  transform-box: fill-box;
  transform-origin: 0% 50%;
  transition: transform var(--duration-normal) var(--ease-out);
  transition-delay: calc(var(--row) * 20ms);
}

.view-node__hair--right {
  transform-origin: 100% 50%;
}

/* 12×1.5 → 5×5: the row shrinks to its square's width and grows to its
   height, then slides the row into place. Left rows keep their left edge,
   right rows keep their right one — the grid appears out of the rows. */
.view-node--cluster .view-node__hair {
  transform: translateY(var(--dy)) scale(0.41667, 3.33333);
}

@media (prefers-reduced-motion: reduce) {
  .view-node,
  .view-node::after,
  .view-node__hair {
    transition: none;
  }
}
</style>
