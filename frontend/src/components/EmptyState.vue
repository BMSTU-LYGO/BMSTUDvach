<script setup lang="ts">
defineProps<{ message?: string }>()
</script>

<template>
  <div class="empty-state" data-testid="empty">
    <p>{{ message ?? 'Здесь пока пусто.' }}</p>
  </div>
</template>

<style scoped>
.empty-state {
  padding: 1.5rem;
  text-align: center;
  color: #888;
  border: 1px dashed #ccc;
  border-radius: 6px;
}
</style>