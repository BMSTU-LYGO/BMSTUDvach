<script setup lang="ts">
import type { ThreadSummary } from '@/types'

defineProps<{ thread: ThreadSummary }>()
</script>

<template>
  <article class="thread-card" data-testid="thread-card">
    <RouterLink
      :to="`/threads/${thread.id}`"
      class="thread-title"
      :class="{ pinned: thread.is_pinned }"
    >
      <span v-if="thread.is_pinned" class="pin" title="Закреплён">📌</span>
      {{ thread.title }}
    </RouterLink>
    <div class="thread-meta">
      <span>Ответов: {{ thread.reply_count }}</span>
      <span v-if="thread.is_locked" class="lock" title="Закрыт">🔒</span>
    </div>
  </article>
</template>

<style scoped>
.thread-card {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
}
.thread-card:hover {
  background: #fafafa;
}
.thread-title {
  color: #0b5cab;
  text-decoration: none;
  font-weight: 600;
}
.thread-title:hover {
  text-decoration: underline;
}
.thread-title.pinned {
  color: #333;
}
.pin {
  margin-right: 0.2rem;
}
.thread-meta {
  color: #888;
  font-size: 0.85rem;
  white-space: nowrap;
}
</style>