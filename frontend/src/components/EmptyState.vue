<script setup lang="ts">
/**
 * «ПУСТОЙ УЗЕЛ» — сеть на связи, но в узле нет пакетов. Легче ошибки:
 * приглушённый accent, без danger-цвета.
 */
defineProps<{ message?: string }>()
</script>

<template>
  <div class="state-empty" role="status" aria-live="polite" data-testid="empty">
    <div class="void" data-testid="state-empty">
      <span class="void__ring" aria-hidden="true"></span>
      <span class="void__core" aria-hidden="true"></span>
    </div>

    <p class="state-empty__caption">EMPTY NODE · УЗЕЛ ПУСТ</p>
    <p class="state-empty__message">{{ message ?? 'Здесь пока пусто.' }}</p>
  </div>
</template>

<style scoped>
.state-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-8);
  text-align: center;
}

/* === Dormant node: no packets === */
.void {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-bottom: var(--space-1);
}

.void__ring {
  position: absolute;
  inset: 0;
  border: 1px dashed var(--accent-dim);
  border-radius: 50%;
}

.void__core {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-dim);
  box-shadow: 0 0 10px color-mix(in oklab, var(--accent) 20%, transparent);
  animation: void-core 2.4s var(--ease-out-quart) infinite;
}

@keyframes void-core {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.state-empty__caption {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent-dim);
}

.state-empty__message {
  margin: 0;
  max-width: 42ch;
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* === Reduced motion: node rests === */
@media (prefers-reduced-motion: reduce) {
  .void__core {
    animation: none;
    opacity: 0.75;
    transform: none;
    box-shadow: none;
  }
}
</style>
