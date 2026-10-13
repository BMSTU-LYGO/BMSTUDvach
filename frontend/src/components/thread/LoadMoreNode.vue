<script setup lang="ts">
/**
 * Terminal node of the board listing: pulls the next page of threads, or
 * states honestly that the signal was transmitted in full. Mirrors the
 * SortLens node — mono type, dashed instrumentation, 44px touch target.
 */
const props = defineProps<{
  hasMore: boolean
  loading: boolean
}>()

const emit = defineEmits<{ 'load-more': [] }>()

void props
</script>

<template>
  <div class="load-more" data-testid="load-more" :aria-busy="loading">
    <button
      v-if="hasMore"
      type="button"
      class="load-more__btn"
      data-testid="load-more-button"
      :disabled="loading"
      :aria-label="loading ? 'Догрузка тредов' : 'Загрузить следующую страницу тредов'"
      @click="emit('load-more')"
    >
      <span v-if="loading" class="load-more__dot" aria-hidden="true" />
      {{ loading ? 'догружаю' : 'загрузить ещё' }}
    </button>
    <p v-else class="load-more__done" data-testid="load-more-done">
      сигнал передан полностью
    </p>
  </div>
</template>

<style scoped>
.load-more {
  display: flex;
  justify-content: center;
  min-height: 44px;
}

.load-more__btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: 0 var(--space-6);
  background: var(--bg-surface);
  border: 1px dashed var(--border-medium);
  border-radius: var(--radius-md);
  color: var(--accent);
  font-family: var(--font-display);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-out-quart),
    color var(--duration-fast) var(--ease-out-quart),
    box-shadow var(--duration-normal) var(--ease-out-quart);
}

.load-more__btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--text-primary);
  box-shadow: 0 0 24px color-mix(in oklab, var(--accent) 14%, transparent);
}

.load-more__btn:disabled {
  color: var(--text-muted);
  cursor: progress;
}

.load-more__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.load-more__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: load-more-pulse 1s var(--ease-out-quart) infinite;
}

@keyframes load-more-pulse {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 1;
  }
}

.load-more__done {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-display);
  font-size: 0.66rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.load-more__done::before,
.load-more__done::after {
  content: '';
  width: var(--space-6);
  border-top: 1px dashed var(--border-medium);
}

@media (prefers-reduced-motion: reduce) {
  .load-more__btn {
    transition: none;
  }

  .load-more__dot {
    animation: none;
  }
}
</style>
