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
    <span class="offline-badge__mark" aria-hidden="true"></span>
    <span class="offline-badge__label">НЕТ СВЯЗИ</span>
  </div>
</template>

<style scoped>
/* === Метка оффлайна: язык состояний ===
   Та же бумага, та же волосяная рамка, та же моно-подпись и одна чернильная
   метка. Без мигания: потеря связи — факт, а не тревога, поэтому метка
   стоит спокойно и ничего не требует внимания. */
.offline-badge {
  position: fixed;
  bottom: var(--space-4);
  left: var(--space-4);
  z-index: var(--z-toast);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-secondary);
  background: var(--bg-surface);
  border: 1px solid var(--rule);
  box-shadow: var(--shadow-sm);
  pointer-events: none;
}

/* Метка — чернильный квадрат: знак, а не лампочка. */
.offline-badge__mark {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  background: var(--ink);
}

.offline-badge__label {
  line-height: 1.4;
}
</style>
