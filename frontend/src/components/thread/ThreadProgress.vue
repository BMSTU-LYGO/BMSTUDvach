<script setup lang="ts">
/**
 * Reading progress for long threads (thread UX §33). Purely informational,
 * rAF-throttled by the parent; exposes proper progressbar semantics.
 */
defineProps<{
  progress: number
}>()
</script>

<template>
  <div
    class="thread-progress"
    role="progressbar"
    aria-label="Прогресс чтения треда"
    :aria-valuenow="Math.round(progress * 100)"
    aria-valuemin="0"
    aria-valuemax="100"
    data-testid="thread-progress"
  >
    <div class="thread-progress__fill" :style="{ transform: `scaleX(${progress})` }"></div>
  </div>
</template>

<style scoped>
.thread-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  z-index: var(--z-sticky);
  background: transparent;
  pointer-events: none;
}

.thread-progress__fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-dim), var(--accent));
  transform-origin: left center;
  will-change: transform;
}
</style>
