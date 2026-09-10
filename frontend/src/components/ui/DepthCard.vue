<script setup lang="ts">
import { ref } from 'vue'
import { useTilt } from '@/composables/useTilt'

withDefaults(defineProps<{ depth?: 1 | 2 | 3 }>(), { depth: 1 })

const cardRef = ref<HTMLElement | null>(null)
const { isHovered } = useTilt(cardRef)
</script>

<template>
  <div
    ref="cardRef"
    class="depth-card"
    :class="[`depth-${depth}`, { hovered: isHovered }]"
  >
    <slot />
  </div>
</template>

<style scoped>
.depth-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  transform-style: preserve-3d;
  will-change: transform;
  transition:
    box-shadow var(--duration-normal) var(--ease-out-quart),
    border-color var(--duration-normal) var(--ease-out-quart);
}

.depth-1 {
  box-shadow: var(--shadow-sm);
}
.depth-1.hovered {
  box-shadow: var(--shadow-md);
  border-color: var(--border-medium);
}

.depth-2 {
  box-shadow: var(--shadow-md);
}
.depth-2.hovered {
  box-shadow: var(--shadow-lg);
  border-color: var(--border-medium);
}

.depth-3 {
  box-shadow: var(--shadow-lg);
}
.depth-3.hovered {
  box-shadow: 0 12px 48px oklch(0 0 0 / 0.6);
  border-color: var(--border-accent);
}

@media (prefers-reduced-motion: reduce) {
  .depth-card {
    transform: none !important;
    will-change: auto;
  }
}
</style>
