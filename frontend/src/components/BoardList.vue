<script setup lang="ts">
import type { Board } from '@/types'

defineProps<{ boards: Board[] }>()
</script>

<template>
  <nav class="board-list" data-testid="board-list" aria-label="Разделы">
    <RouterLink
      v-for="board in boards"
      :key="board.slug"
      :to="`/boards/${board.slug}`"
      class="board-link"
    >
      <span class="board-slug">/{{ board.slug }}/</span>
      <span class="board-name">{{ board.name }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.board-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
}
.board-link {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.9rem 1rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  color: #222;
  text-decoration: none;
  background: #fff;
}
.board-link:hover {
  border-color: #999;
  background: #f6f6f6;
}
.board-slug {
  font-weight: 700;
  color: #b00;
}
.board-name {
  font-size: 0.95rem;
}
</style>