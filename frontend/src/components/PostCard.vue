<script setup lang="ts">
import AttachmentPreview from './AttachmentPreview.vue'
import ReportDialog from './ReportDialog.vue'
import type { Post } from '@/types'
import { ref } from 'vue'

const props = defineProps<{ post: Post }>()

const emit = defineEmits<{
  report: [payload: { postId: number; reason: string; comment: string }]
}>()

const showReport = ref(false)

function formatDate(value: string): string {
  return new Date(value).toLocaleString('ru-RU')
}
</script>

<template>
  <article class="post-card" :class="{ op: props.post.is_op }" data-testid="post">
    <header class="post-header">
      <span class="post-author">{{ props.post.author }}</span>
      <span class="post-date">{{ formatDate(props.post.created_at) }}</span>
      <button
        type="button"
        class="btn-report"
        title="Пожаловаться"
        @click="showReport = true"
      >
        Жалоба
      </button>
    </header>
    <div class="post-body">{{ props.post.body }}</div>
    <div v-if="props.post.attachments.length" class="post-attachments">
      <AttachmentPreview
        v-for="attachment in props.post.attachments"
        :key="attachment.id"
        :attachment="attachment"
      />
    </div>
    <ReportDialog
      v-if="showReport"
      @close="showReport = false"
      @submit="(payload) => emit('report', { postId: props.post.id, ...payload })"
    />
  </article>
</template>

<style scoped>
.post-card {
  padding: 0.8rem 1rem;
  border-bottom: 1px solid #eee;
  background: #fff;
}
.post-card.op {
  background: #f4f0e6;
}
.post-header {
  display: flex;
  align-items: baseline;
  gap: 0.8rem;
  margin-bottom: 0.4rem;
}
.post-author {
  font-weight: 700;
  color: #b00;
}
.post-date {
  color: #999;
  font-size: 0.8rem;
}
.btn-report {
  margin-left: auto;
  border: none;
  background: none;
  color: #999;
  cursor: pointer;
  font-size: 0.8rem;
}
.btn-report:hover {
  color: #b00;
  text-decoration: underline;
}
.post-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.45;
}
.post-attachments {
  margin-top: 0.5rem;
}
</style>