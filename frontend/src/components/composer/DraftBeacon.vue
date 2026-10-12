<script setup lang="ts">
import { computed } from 'vue'

/**
 * Draft Buffer Beacon (SIGNAL-12).
 *
 * ● idle        : no draft
 * ◌ writing     : typing, not yet saved
 * ● saved       : draft persisted
 * ! storage err : persistence failed
 *
 * Hover → "сохранено N сек назад"
 */
const props = defineProps<{
  state: 'idle' | 'writing' | 'saved' | 'error'
  savedAt?: number | null
}>()

const label = computed(() => {
  switch (props.state) {
    case 'writing':
      return 'запись…'
    case 'saved':
      return props.savedAt ? `сохранено ${ago(props.savedAt)}` : 'буфер сохранён'
    case 'error':
      return 'не удалось сохранить'
    default:
      return 'буфер пуст'
  }
})

function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s} сек назад`
  return `${Math.floor(s / 60)} мин назад`
}

const glyph = computed(() => {
  switch (props.state) {
    case 'writing':
      return '◌'
    case 'saved':
      return '●'
    case 'error':
      return '!'
    default:
      return '○'
  }
})
</script>

<template>
  <span
    class="beacon"
    :class="`beacon--${state}`"
    :title="label"
    :aria-label="label"
    data-testid="draft-beacon"
  >
    <span class="beacon__dot" aria-hidden="true">{{ glyph }}</span>
    <span v-if="state !== 'idle'" class="beacon__text">{{ label }}</span>
  </span>
</template>

<style scoped>
.beacon {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-display);
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  white-space: nowrap;
}

.beacon__dot {
  width: 12px;
  text-align: center;
  font-size: 0.8rem;
}

.beacon--writing .beacon__dot {
  color: var(--text-secondary);
  animation: beacon-blink 1s ease-in-out infinite;
}

.beacon--saved .beacon__dot {
  color: var(--accent);
}

.beacon--saved .beacon__text {
  color: var(--text-secondary);
}

.beacon--error .beacon__dot {
  color: var(--danger);
}

.beacon--error .beacon__text {
  color: var(--danger);
}

@keyframes beacon-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

@media (prefers-reduced-motion: reduce) {
  .beacon--writing .beacon__dot {
    animation: none;
  }
}
</style>