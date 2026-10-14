<script setup lang="ts">
import { computed, ref } from 'vue'

import type { ReportReason } from '@/types'
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

function focusIndex(i: number) {
  nodeRefs.value[i]?.focus()
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
</script>

<template>
  <div class="constellation" role="radiogroup" aria-label="Причина жалобы">
    <!-- desktop: fiber lines from the probe origin to every reason node -->
    <svg class="constellation__wires" aria-hidden="true">
      <line
        v-for="node in layout"
        :key="`w-${node.id}`"
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

    <span class="constellation__origin" aria-hidden="true"></span>
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
  transition: opacity 160ms, color 160ms;
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
