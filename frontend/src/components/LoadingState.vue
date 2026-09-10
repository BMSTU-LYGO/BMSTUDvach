<script setup lang="ts">
defineProps<{ label?: string }>()
</script>

<template>
  <div class="loading-state" role="status" data-testid="loading">
    <span class="spinner" aria-hidden="true"></span>
    <span>{{ label ?? 'Загрузка…' }}</span>
  </div>
</template>

<style scoped>
.loading-state {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 1.5rem;
  color: #666;
}
.spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid #ccc;
  border-top-color: #333;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>