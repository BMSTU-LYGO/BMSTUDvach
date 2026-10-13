<script setup lang="ts">
import type { ThreadSummary } from '@/types'
import NetworkIcon from '../composer/NetworkIcon.vue'

/**
 * Catalog view of a board — threads as cluster nodes. Each card carries
 * the node id, state glyphs, the signal count and the OP teaser.
 */
const props = defineProps<{ thread: ThreadSummary }>()
const emit = defineEmits<{ open: [event: MouseEvent, threadId: number] }>()

function ago(value: string): string {
  const d = new Date(value)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч`
  return `${Math.floor(hours / 24)} д`
}

void props
</script>

<template>
  <RouterLink
    :to="`/threads/${thread.id}`"
    class="catalog-card"
    :class="{ 'catalog-card--pinned': thread.is_pinned }"
    data-testid="catalog-card"
    @click="emit('open', $event, thread.id)"
  >
    <div class="catalog-card__head">
      <span class="catalog-card__node">#{{ thread.id }}</span>
      <span v-if="thread.is_pinned" class="catalog-card__pin" title="Закреплён">
        <NetworkIcon name="pin" :size="12" />
      </span>
      <span v-if="thread.is_locked" class="catalog-card__lock" title="Закрыт">
        <NetworkIcon name="lock" :size="12" />
      </span>
      <span class="catalog-card__replies" title="Ответов">{{ thread.reply_count }}</span>
    </div>

    <h3 class="catalog-card__title">{{ thread.title }}</h3>
    <p v-if="thread.op_snippet" class="catalog-card__snippet">{{ thread.op_snippet }}</p>

    <footer class="catalog-card__foot">
      <span>/{{ thread.board }}/</span>
      <span>{{ ago(thread.bumped_at) }}</span>
    </footer>
  </RouterLink>
</template>

<style scoped>
.catalog-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  text-decoration: none;
  color: inherit;
  min-height: 148px;
  transition:
    border-color var(--duration-fast),
    box-shadow var(--duration-normal) var(--ease-out-quart),
    transform var(--duration-fast) var(--ease-out-quart);
}

.catalog-card:hover {
  border-color: color-mix(in oklab, var(--accent) 45%, transparent);
  box-shadow: 0 0 24px color-mix(in oklab, var(--accent) 12%, transparent);
  transform: translateY(-2px);
}

.catalog-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.catalog-card--pinned {
  border-left: 2px solid var(--accent);
}

.catalog-card__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.catalog-card__node {
  font-family: var(--font-display);
  font-size: 0.66rem;
  color: var(--text-muted);
}

.catalog-card__pin {
  color: var(--accent);
  display: inline-flex;
}

.catalog-card__lock {
  color: var(--text-muted);
  display: inline-flex;
}

.catalog-card__replies {
  margin-left: auto;
  font-family: var(--font-display);
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--accent-dim);
}

.catalog-card__title {
  margin: 0;
  font-size: 0.98rem;
  line-height: 1.35;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.catalog-card__snippet {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.catalog-card__foot {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  font-family: var(--font-display);
  font-size: 0.64rem;
  color: var(--text-muted);
}
</style>
