<script setup lang="ts">
import type { ThreadSummary } from '@/types'
import NetworkIcon from '../composer/NetworkIcon.vue'

/**
 * One thread row in a board listing — shared by the board view and the
 * home feed so a thread looks the same everywhere. Pinned/locked states
 * use the network glyph set, the row keeps the shared-element morph
 * hook via the `open` event.
 */
const props = defineProps<{
  thread: ThreadSummary
  showBoard?: boolean
}>()

const emit = defineEmits<{ open: [event: MouseEvent, threadId: number] }>()

function formatDate(value: string): string {
  const d = new Date(value)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч`
  const days = Math.floor(hours / 24)
  return `${days} д`
}
</script>

<template>
  <RouterLink
    :to="`/threads/${props.thread.id}`"
    class="thread-row"
    data-testid="thread-row"
    @click="emit('open', $event, props.thread.id)"
  >
    <div class="thread-main">
      <div class="thread-title-row">
        <span v-if="thread.is_pinned" class="thread-pin" title="Закреплён">
          <NetworkIcon name="pin" :size="12" />
        </span>
        <span class="thread-title">{{ thread.title }}</span>
      </div>
      <div class="thread-meta">
        <span v-if="showBoard" class="meta-board">/{{ thread.board }}/</span>
        <span class="meta-item">
          <span class="meta-count">{{ thread.reply_count }}</span>
          ответ{{ thread.reply_count === 1 ? '' : thread.reply_count < 5 ? 'а' : 'ов' }}
        </span>
        <span v-if="thread.is_locked" class="meta-lock" title="Закрыт">
          <NetworkIcon name="lock" :size="12" />
          закрыт
        </span>
      </div>
    </div>
    <span class="thread-time">{{ formatDate(thread.bumped_at) }}</span>
  </RouterLink>
</template>

<style scoped>
.thread-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
  text-decoration: none;
  color: inherit;
  transition:
    background var(--duration-fast) var(--ease-out-quart),
    transform var(--duration-fast) var(--ease-out-quart);
}

.thread-row:hover {
  background: var(--bg-surface);
  transform: translateX(4px);
}

.thread-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.thread-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.thread-title-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.thread-pin {
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.thread-title {
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: 0.8rem;
  color: var(--text-muted);
}

.meta-board {
  font-family: var(--font-display);
  color: var(--accent-dim);
}

.meta-count {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--accent-dim);
}

.meta-lock {
  font-size: 0.75rem;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.thread-time {
  font-family: var(--font-display);
  font-size: 0.8rem;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .thread-row {
    padding: var(--space-3) var(--space-4);
  }

  .thread-time {
    display: none;
  }
}
</style>
