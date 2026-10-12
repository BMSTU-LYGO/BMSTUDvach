<script setup lang="ts">
import { computed } from 'vue'

import type { Post } from '@/types'

/**
 * Desktop hover preview for a `>>123` link (SIGNAL-27/33: hover preview).
 * One shared instance follows the pointer; hidden on scroll, Escape,
 * touch devices and reduced motion is still fine (no entrance animation).
 */
const props = defineProps<{
  post: Post | null
  x: number
  y: number
  visible: boolean
}>()

const emit = defineEmits<{ navigate: [id: number] }>()

const PREVIEW_W = 264

const style = computed(() => {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const x = props.x + 16 + PREVIEW_W > vw - 12 ? Math.max(12, props.x - PREVIEW_W - 16) : props.x + 16
  const y = Math.min(props.y + 14, Math.max(12, vh - 220))
  return { left: `${x}px`, top: `${y}px`, width: `${PREVIEW_W}px` }
})

const snippet = computed(() => {
  const raw = props.post?.body ?? ''
  const flat = raw.replace(/>>\d+/g, '').replace(/\s+/g, ' ').trim()
  return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat
})
</script>

<template>
  <div
    v-if="visible && post"
    class="post-preview"
    :style="style"
    data-testid="post-preview"
    @click="emit('navigate', post.id)"
  >
    <header class="post-preview__head">
      <span class="post-preview__id">#{{ post.id }}</span>
      <span class="post-preview__author">{{ post.author }}</span>
      <span v-if="post.is_op" class="post-preview__op">OP</span>
    </header>
    <p class="post-preview__snippet">{{ snippet || '—' }}</p>
    <span v-if="post.attachments.length" class="post-preview__meta">
      вложений: {{ post.attachments.length }}
    </span>
  </div>
</template>

<style scoped>
.post-preview {
  position: fixed;
  z-index: 25;
  padding: var(--space-3);
  background: var(--bg-raised);
  border: 1px solid color-mix(in oklab, var(--accent) 30%, transparent);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  cursor: pointer;
  pointer-events: auto;
}

.post-preview__head {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.post-preview__id {
  font-family: var(--font-display);
  font-size: 0.72rem;
  color: var(--accent);
}

.post-preview__author {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-primary);
}

.post-preview__op {
  font-family: var(--font-display);
  font-size: 0.6rem;
  color: var(--accent-dim);
  border: 1px solid var(--accent-dim);
  border-radius: 3px;
  padding: 0 4px;
}

.post-preview__snippet {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--text-secondary);
  max-height: 96px;
  overflow: hidden;
}

.post-preview__meta {
  display: block;
  margin-top: var(--space-2);
  font-family: var(--font-display);
  font-size: 0.64rem;
  color: var(--text-muted);
}
</style>
