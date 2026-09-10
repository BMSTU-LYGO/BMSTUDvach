<script setup lang="ts">
defineProps<{ label?: string }>()
</script>

<template>
  <div class="loading-state" role="status" data-testid="loading">
    <div class="loading-spinner">
      <span class="spinner-ring"></span>
    </div>
    <span class="loading-text">{{ label ?? 'Загрузка…' }}</span>
  </div>
</template>

<style scoped>
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-8);
  color: var(--text-muted);
}

.loading-spinner {
  position: relative;
  width: 20px;
  height: 20px;
}

.spinner-ring {
  position: absolute;
  inset: 0;
  border: 2px solid var(--border-subtle);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: 0.9rem;
}

@media (prefers-reduced-motion: reduce) {
  .spinner-ring {
    animation: none;
    border-top-color: var(--accent);
    opacity: 0.5;
  }
}
</style>
