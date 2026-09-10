<script setup lang="ts">
defineProps<{ message?: string; onRetry?: () => void }>()
</script>

<template>
  <div class="error-state" role="alert" data-testid="error">
    <div class="error-icon">✕</div>
    <p class="error-title">Ошибка</p>
    <p class="error-message">{{ message ?? 'Что-то пошло не так.' }}</p>
    <button v-if="onRetry" type="button" class="btn btn-ghost" @click="onRetry">
      Повторить
    </button>
  </div>
</template>

<style scoped>
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-8);
  text-align: center;
}

.error-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: oklch(0.55 0.20 25 / 0.15);
  color: var(--danger);
  font-size: 1.2rem;
  font-weight: 700;
}

.error-title {
  margin: 0;
  font-weight: 700;
  color: var(--text-primary);
}

.error-message {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
}
</style>
