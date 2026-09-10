<script setup lang="ts">
defineProps<{ message?: string }>()
</script>

<template>
  <div class="empty-state" data-testid="empty">
    <div class="empty-icon">○</div>
    <p class="empty-text">{{ message ?? 'Здесь пока пусто.' }}</p>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-8);
  text-align: center;
}

.empty-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px dashed var(--border-medium);
  color: var(--text-muted);
  font-size: 1.2rem;
}

.empty-text {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}
</style>
