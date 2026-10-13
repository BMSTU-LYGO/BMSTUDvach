<script setup lang="ts">
/**
 * Горизонтальный разделитель «НОВЫЕ СООБЩЕНИЯ · N» (SEEN-01) между прочитанными
 * и новыми постами треда. Классическая имиджбордная разметка: всё выше границы
 * уже читано, всё ниже — ещё нет.
 */
import { computed } from 'vue'

const props = defineProps<{ count: number }>()

const visible = computed(() => props.count > 0)
const padded = computed(() =>
  String(Math.max(0, Math.floor(props.count))).padStart(2, '0'),
)
</script>

<template>
  <div
    v-if="visible"
    class="new-posts"
    role="separator"
    :aria-label="`${count} новых сообщений`"
    data-testid="new-posts-divider"
  >
    <span class="new-posts__line" aria-hidden="true"></span>
    <span class="new-posts__label">НОВЫЕ СООБЩЕНИЯ · {{ padded }}</span>
    <span class="new-posts__line" aria-hidden="true"></span>
  </div>
</template>

<style scoped>
.new-posts {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
}

.new-posts__line {
  flex: 1;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--accent-glow-strong),
    transparent
  );
}

.new-posts__label {
  font-family: var(--font-display);
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  color: var(--accent);
  white-space: nowrap;
}

@media (max-width: 640px) {
  .new-posts {
    gap: var(--space-2);
    padding: var(--space-3);
  }

  .new-posts__label {
    font-size: 0.62rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .new-posts__line {
    background: var(--border-medium);
  }
}
</style>
