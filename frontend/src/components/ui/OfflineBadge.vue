<script setup lang="ts">
defineProps<{ online: boolean }>()
</script>

<template>
  <div
    v-if="!online"
    class="offline-badge"
    role="status"
    aria-live="polite"
    data-testid="offline-badge"
  >
    <span class="offline-badge__dot" aria-hidden="true"></span>
    <span class="offline-badge__label">НЕТ СВЯЗИ</span>
  </div>
</template>

<style scoped>
.offline-badge {
  position: fixed;
  bottom: var(--space-4);
  left: var(--space-4);
  z-index: var(--z-toast);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  font-family: var(--font-display);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--danger);
  background: var(--bg-overlay);
  border: 1px solid var(--danger-dim);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(8px);
  pointer-events: none;
}

.offline-badge__dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--danger);
  animation: offline-pulse 1.6s ease-in-out infinite;
}

.offline-badge__label {
  line-height: 1.4;
}

@keyframes offline-pulse {
  0%,
  100% {
    opacity: 1;
    box-shadow: 0 0 8px var(--danger);
  }
  50% {
    opacity: 0.35;
    box-shadow: none;
  }
}

/* Reduced motion: a calm static signal instead of a pulsing one. */
@media (prefers-reduced-motion: reduce) {
  .offline-badge__dot {
    animation: none;
    opacity: 1;
    box-shadow: none;
  }

  .offline-badge {
    border-style: solid;
  }
}
</style>
