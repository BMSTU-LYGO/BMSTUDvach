<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  type?: 'info' | 'success' | 'warning' | 'error'
  dismissible?: boolean
}>()

const emit = defineEmits<{
  dismiss: []
}>()

const classes = computed(() => [
  'form-notice',
  `form-notice--${props.type || 'info'}`,
])

const icon = computed(() => {
  switch (props.type) {
    case 'success': return '✓'
    case 'warning': return '⚠'
    case 'error': return '✕'
    default: return 'ℹ'
  }
})
</script>

<template>
  <div :class="classes" role="alert">
    <span class="form-notice__icon" aria-hidden="true">{{ icon }}</span>
    <div class="form-notice__content">
      <slot />
    </div>
    <button
      v-if="dismissible"
      type="button"
      class="form-notice__dismiss"
      aria-label="Закрыть"
      @click="emit('dismiss')"
    >
      ✕
    </button>
  </div>
</template>

<style scoped>
.form-notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid;
  font-size: 0.875rem;
}

.form-notice--info {
  background: color-mix(in oklab, var(--accent) 10%, var(--bg-surface));
  border-color: color-mix(in oklab, var(--accent) 30%, transparent);
  color: var(--text-primary);
}

.form-notice--success {
  background: color-mix(in oklab, var(--success) 10%, var(--bg-surface));
  border-color: color-mix(in oklab, var(--success) 30%, transparent);
  color: var(--text-primary);
}

.form-notice--warning {
  background: color-mix(in oklab, #f59e0b 10%, var(--bg-surface));
  border-color: color-mix(in oklab, #f59e0b 30%, transparent);
  color: var(--text-primary);
}

.form-notice--error {
  background: color-mix(in oklab, var(--danger) 10%, var(--bg-surface));
  border-color: color-mix(in oklab, var(--danger) 30%, transparent);
  color: var(--text-primary);
}

.form-notice__icon {
  flex-shrink: 0;
  font-size: 1.125rem;
  line-height: 1;
}

.form-notice__content {
  flex: 1;
  line-height: 1.5;
}

.form-notice__dismiss {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  font-size: 1rem;
  line-height: 1;
  transition: color var(--transition-fast);
}

.form-notice__dismiss:hover {
  color: var(--text-primary);
}
</style>
