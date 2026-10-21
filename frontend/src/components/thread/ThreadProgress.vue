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
    <div
      class="thread-progress__fill"
      :style="{ transform: `scaleX(${progress})` }"
    ></div>
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
  background: var(--accent, #2f4f4e);
  transform-origin: left center;
  /* Постоянного `will-change` здесь нет: полоска обновляется каждый кадр
     прокрутки, но она высотой 2px — слой композитора ей не нужен, а
     вечно поднятый слой держит память браузера. */
}
</style>
