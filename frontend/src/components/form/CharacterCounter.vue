<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  current: number
  max: number
  warningThreshold?: number
}>()

const warningThreshold = props.warningThreshold ?? 0.9
const percentage = computed(() => props.current / props.max)
const isWarning = computed(() => percentage.value >= warningThreshold)
const isOver = computed(() => props.current > props.max)

const classes = computed(() => [
  'character-counter',
  {
    'character-counter--warning': isWarning.value && !isOver.value,
    'character-counter--over': isOver.value,
  },
])
</script>

<template>
  <span :class="classes" aria-live="polite">
    {{ current }}/{{ max }}
  </span>
</template>

<style scoped>
.character-counter {
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--text-muted);
  transition: color var(--transition-fast);
}

.character-counter--warning {
  color: #f59e0b;
}

.character-counter--over {
  color: var(--danger);
  font-weight: 600;
}
</style>
