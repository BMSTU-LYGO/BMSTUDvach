<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'signal'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
  success?: boolean
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
}>()

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const classes = computed(() => [
  'form-button',
  `form-button--${props.variant || 'primary'}`,
  `form-button--${props.size || 'md'}`,
  {
    'form-button--loading': props.loading,
    'form-button--success': props.success,
    'form-button--full-width': props.fullWidth,
  },
])

function handleClick(event: MouseEvent) {
  if (!props.disabled && !props.loading) {
    emit('click', event)
  }
}
</script>

<template>
  <button
    :type="type || 'button'"
    :class="classes"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span v-if="loading" class="form-button__spinner" aria-hidden="true"></span>
    <span v-if="success" class="form-button__check" aria-hidden="true">✓</span>
    <span class="form-button__content">
      <slot />
    </span>
  </button>
</template>

<style scoped>
.form-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-family: var(--font-body);
  font-weight: 500;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
}

.form-button--sm {
  padding: var(--space-2) var(--space-3);
  font-size: 0.8125rem;
}

.form-button--md {
  padding: var(--space-3) var(--space-4);
  font-size: 0.875rem;
}

.form-button--lg {
  padding: var(--space-4) var(--space-5);
  font-size: 1rem;
}

.form-button--full-width {
  width: 100%;
}

.form-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Primary */
.form-button--primary {
  background: var(--accent);
  color: var(--bg-deep);
  border-color: var(--accent);
}

.form-button--primary:hover:not(:disabled) {
  background: color-mix(in oklab, var(--accent) 85%, white);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 20%, transparent);
}

/* Secondary */
.form-button--secondary {
  background: var(--bg-surface);
  color: var(--text-primary);
  border-color: var(--border-medium);
}

.form-button--secondary:hover:not(:disabled) {
  background: var(--bg-raised);
  border-color: var(--accent);
}

/* Ghost */
.form-button--ghost {
  background: transparent;
  color: var(--text-secondary);
  border-color: transparent;
}

.form-button--ghost:hover:not(:disabled) {
  background: var(--bg-surface);
  color: var(--text-primary);
}

/* Danger */
.form-button--danger {
  background: var(--danger);
  color: white;
  border-color: var(--danger);
}

.form-button--danger:hover:not(:disabled) {
  background: color-mix(in oklab, var(--danger) 85%, white);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--danger) 20%, transparent);
}

/* Signal */
.form-button--signal {
  background: transparent;
  color: var(--accent);
  border-color: var(--accent);
}

.form-button--signal:hover:not(:disabled) {
  background: color-mix(in oklab, var(--accent) 10%, transparent);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 20%, transparent);
}

/* Loading state */
.form-button--loading {
  cursor: wait;
}

.form-button__spinner {
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Success state */
.form-button--success {
  background: var(--success);
  color: white;
  border-color: var(--success);
}

.form-button__check {
  font-size: 1.2em;
  animation: check-pop 0.3s ease-out;
}

@keyframes check-pop {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.form-button__content {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
</style>
