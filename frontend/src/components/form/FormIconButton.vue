<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  icon: string
  label: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}>()

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const classes = computed(() => [
  'form-icon-button',
  `form-icon-button--${props.variant || 'ghost'}`,
  `form-icon-button--${props.size || 'md'}`,
])

function handleClick(event: MouseEvent) {
  if (!props.disabled) {
    emit('click', event)
  }
}
</script>

<template>
  <button
    type="button"
    :class="classes"
    :disabled="disabled"
    :aria-label="label"
    @click="handleClick"
  >
    <span class="form-icon-button__icon" aria-hidden="true">{{ icon }}</span>
  </button>
</template>

<style scoped>
.form-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  background: transparent;
  color: var(--text-secondary);
}

.form-icon-button--sm {
  width: 2rem;
  height: 2rem;
  font-size: 0.875rem;
}

.form-icon-button--md {
  width: 2.5rem;
  height: 2.5rem;
  font-size: 1rem;
}

.form-icon-button--lg {
  width: 3rem;
  height: 3rem;
  font-size: 1.25rem;
}

.form-icon-button:hover:not(:disabled) {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.form-icon-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-icon-button--primary:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--accent);
}

.form-icon-button--secondary:hover:not(:disabled) {
  background: var(--bg-raised);
}

.form-icon-button--danger:hover:not(:disabled) {
  color: var(--danger);
  border-color: var(--danger);
}

.form-icon-button__icon {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
