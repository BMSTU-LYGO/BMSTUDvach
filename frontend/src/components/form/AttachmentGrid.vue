<script setup lang="ts">
import type { Attachment } from '@/types'
import AttachmentItem from './AttachmentItem.vue'

defineProps<{
  attachments: Attachment[]
}>()
</script>

<template>
  <div v-if="attachments.length > 0" class="attachment-grid">
    <AttachmentItem
      v-for="attachment in attachments"
      :key="attachment.id"
      :attachment="attachment"
    />
  </div>
</template>

<style scoped>
.attachment-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-3);
}
</style>
