<script setup lang="ts">
defineProps<{
  canAttach?: boolean
  canClear?: boolean
  canQuote?: boolean
}>()

const emit = defineEmits<{
  attach: []
  clear: []
  quote: []
}>()
</script>

<template>
  <div class="composer-toolbar">
    <button
      v-if="canAttach"
      type="button"
      class="composer-toolbar__button"
      aria-label="Прикрепить файл"
      @click="emit('attach')"
    >
      <span class="composer-toolbar__icon">📎</span>
      <span class="composer-toolbar__label">Файлы</span>
    </button>

    <button
      v-if="canQuote"
      type="button"
      class="composer-toolbar__button"
      aria-label="Ответить с цитированием"
      @click="emit('quote')"
    >
      <span class="composer-toolbar__icon">↳</span>
      <span class="composer-toolbar__label">Цитата</span>
    </button>

    <button
      v-if="canClear"
      type="button"
      class="composer-toolbar__button composer-toolbar__button--danger"
      aria-label="Очистить черновик"
      @click="emit('clear')"
    >
      <span class="composer-toolbar__icon">🗑</span>
      <span class="composer-toolbar__label">Очистить</span>
    </button>

    <div class="composer-toolbar__spacer"></div>

    <div class="composer-toolbar__hint">
      <kbd>Ctrl</kbd>+<kbd>Enter</kbd> для отправки
    </div>
  </div>
</template>

<style scoped>
.composer-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-top: 1px solid var(--border-subtle);
  margin-top: var(--space-3);
}

.composer-toolbar__button {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.composer-toolbar__button:hover {
  background: var(--bg-raised);
  border-color: var(--border-medium);
  color: var(--text-primary);
}

.composer-toolbar__button--danger:hover {
  background: color-mix(in oklab, var(--danger) 10%, transparent);
  border-color: var(--danger);
  color: var(--danger);
}

.composer-toolbar__icon {
  font-size: 1rem;
  line-height: 1;
}

.composer-toolbar__label {
  font-size: 0.8125rem;
}

.composer-toolbar__spacer {
  flex: 1;
}

.composer-toolbar__hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.composer-toolbar__hint kbd {
  padding: 0.125rem 0.375rem;
  background: var(--bg-raised);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.6875rem;
}
</style>
