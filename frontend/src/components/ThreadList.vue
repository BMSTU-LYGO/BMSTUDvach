<script setup lang="ts">
import ThreadCard from './ThreadCard.vue'
import EmptyState from './EmptyState.vue'
import type { ThreadSummary } from '@/types'

defineProps<{ threads: ThreadSummary[] }>()
</script>

<template>
  <div class="thread-list" data-testid="thread-list">
    <ThreadCard v-for="thread in threads" :key="thread.id" :thread="thread" />
    <EmptyState v-if="threads.length === 0" message="В этом разделе пока нет тредов." />
  </div>
</template>

<style scoped>
.thread-list {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: #fff;
}
</style>