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
    <span class="new-posts__label">новые сообщения · {{ padded }}</span>
    <span class="new-posts__line" aria-hidden="true"></span>
  </div>
</template>

<style scoped>
.new-posts {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--rule, #D4CEB8);
}

.new-posts__line {
  flex: 1;
  height: 1px;
  background: var(--rule, #D4CEB8);
}

.new-posts__label {
  font-family: var(--font-body, 'Inter', sans-serif);
  font-size: 0.875rem;
  color: var(--accent, #2F4F4E);
  white-space: nowrap;
}

@media (max-width: 640px) {
  .new-posts {
    gap: var(--space-2);
    padding: var(--space-3);
  }

  .new-posts__label {
    font-size: 0.75rem;
  }
}
</style>
