<script setup lang="ts">
import type { Attachment } from '@/types'

const props = defineProps<{
  attachment: Attachment
}>()

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const isImage = props.attachment.mime_type.startsWith('image/')
</script>

<template>
  <div class="attachment-item" :class="{ 'attachment-item--image': isImage }">
    <template v-if="isImage">
      <img
        :src="attachment.url"
        :alt="attachment.original_name"
        class="attachment-item__preview"
        loading="lazy"
      />
    </template>
    <template v-else>
      <div class="attachment-item__icon">📄</div>
    </template>
    <div class="attachment-item__info">
      <div class="attachment-item__name">{{ attachment.original_name }}</div>
      <div class="attachment-item__meta">{{ formatSize(attachment.size) }}</div>
    </div>
  </div>
</template>

<style scoped>
.attachment-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  background: var(--bg-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.attachment-item:hover {
  border-color: var(--border-medium);
  background: var(--bg-surface);
}

.attachment-item--image {
  flex-direction: column;
  align-items: stretch;
}

.attachment-item__preview {
  width: 100%;
  max-width: 300px;
  height: auto;
  border-radius: var(--radius-sm);
  object-fit: cover;
}

.attachment-item__icon {
  font-size: 2rem;
  opacity: 0.5;
  padding: var(--space-3);
}

.attachment-item__info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  flex: 1;
}

.attachment-item__name {
  font-size: 0.8125rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.attachment-item__meta {
  font-size: 0.75rem;
  color: var(--text-muted);
}
</style>
