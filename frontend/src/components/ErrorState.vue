<script setup lang="ts">
defineProps<{ message?: string; onRetry?: () => void }>()
</script>

<template>
  <div class="error-state" role="alert" data-testid="error">
    <p class="error-title">Ошибка</p>
    <p class="error-message">{{ message ?? 'Что-то пошло не так.' }}</p>
    <button v-if="onRetry" type="button" class="btn" @click="onRetry">
      Повторить
    </button>
  </div>
</template>

<style scoped>
.error-state {
  padding: 1.5rem;
  border: 1px solid #d66;
  background: #fdeaea;
  color: #8a1f1f;
  border-radius: 6px;
}
.error-title {
  font-weight: 700;
  margin: 0 0 0.4rem;
}
.error-message {
  margin: 0 0 1rem;
}
</style>