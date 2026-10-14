<script setup lang="ts">
import NetworkIcon from '../composer/NetworkIcon.vue'
import { useHiddenThreads } from '@/composables/useHiddenThreads'

/**
 * Hidden-threads indicator (HIDE-01).
 *
 * A small self-contained chip for the board header: shows how many threads
 * are hidden on this device and toggles the "reveal hidden" mode. Hidden
 * threads render muted while reveal is on. The reveal flag lives in
 * localStorage (`bmstud-hidden-reveal`), so ThreadRow/CatalogCard react to
 * it without BoardView knowing about the feature.
 */
const { hiddenCount, revealHidden, toggleReveal } = useHiddenThreads()
</script>

<template>
  <div v-if="hiddenCount > 0" class="hidden-chip" data-testid="hidden-chip">
    <span class="hidden-chip__count">скрыто: {{ hiddenCount }}</span>
    <button
      type="button"
      class="hidden-chip__toggle"
      :aria-pressed="revealHidden"
      :aria-label="revealHidden ? 'Скрыть скрытые треды' : 'Показать скрытые'"
      :title="revealHidden ? 'Скрыть скрытые треды' : 'Показать скрытые'"
      data-testid="hidden-chip-toggle"
      @click="toggleReveal"
    >
      <NetworkIcon :name="revealHidden ? 'eyeOff' : 'eye'" :size="14" />
      <span>{{ revealHidden ? 'Скрыть' : 'Показать скрытые' }}</span>
    </button>
  </div>
</template>

<style scoped>
.hidden-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: 0 var(--space-2) 0 var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: none;
  font-family: var(--font-display);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.hidden-chip__count {
  white-space: nowrap;
}

.hidden-chip__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 36px;
  padding: 0 var(--space-2);
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  transition:
    color var(--duration-fast),
    background var(--duration-fast);
}

.hidden-chip__toggle:hover {
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 8%, transparent);
}

.hidden-chip__toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.hidden-chip__toggle[aria-pressed='true'] {
  color: var(--accent);
}

@media (prefers-reduced-motion: reduce) {
  .hidden-chip__toggle {
    transition: none;
  }
}
</style>
