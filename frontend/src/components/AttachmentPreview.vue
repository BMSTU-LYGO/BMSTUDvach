<script setup lang="ts">
import type { Attachment } from '@/types'

defineProps<{ attachment: Attachment }>()

const isImage = (mime: string) => mime.startsWith('image/')
</script>

<template>
  <a
    :href="attachment.url"
    target="_blank"
    rel="noopener noreferrer"
    class="attachment"
    data-testid="attachment"
  >
    <img
      v-if="isImage(attachment.mime_type)"
      :src="attachment.url"
      :alt="attachment.original_name"
      class="attachment-img"
      loading="lazy"
    />
    <span v-else class="attachment-file">{{ attachment.original_name }}</span>
  </a>
</template>

<style scoped>
.attachment {
  display: inline-block;
  max-width: 240px;
  margin: 0.4rem 0.4rem 0 0;
  text-decoration: none;
}
.attachment-img {
  max-width: 100%;
  max-height: 240px;
  border: 1px solid #ddd;
  border-radius: 4px;
}
.attachment-file {
  display: inline-block;
  padding: 0.3rem 0.6rem;
  background: #eee;
  border: 1px solid #ccc;
  border-radius: 4px;
  color: #333;
  font-size: 0.85rem;
}
</style>