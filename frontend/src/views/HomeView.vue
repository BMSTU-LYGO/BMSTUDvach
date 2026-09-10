<script setup lang="ts">
import { onMounted } from 'vue'

import BoardList from '@/components/BoardList.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'
import LoadingState from '@/components/LoadingState.vue'
import { useForumStore } from '@/stores/forum'

const store = useForumStore()

onMounted(() => {
  void store.fetchBoards()
})
</script>

<template>
  <section>
    <h2>Разделы</h2>
    <LoadingState v-if="store.boards.loading" />
    <ErrorState
      v-else-if="store.boards.error"
      :message="store.boards.error"
      :on-retry="store.fetchBoards"
    />
    <EmptyState
      v-else-if="store.boards.boards.length === 0"
      message="Разделов пока нет."
    />
    <BoardList v-else :boards="store.boards.boards" />
  </section>
</template>