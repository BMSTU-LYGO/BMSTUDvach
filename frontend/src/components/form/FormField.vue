<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label?: string
  error?: string
  hint?: string
  required?: boolean
  id?: string
}>()

const fieldId = computed(() => props.id || `field-${Math.random().toString(36).slice(2, 9)}`)
const errorId = computed(() => `${fieldId.value}-error`)
const describedBy = computed(() => {
  const ids = []
  if (props.error) ids.push(errorId.value)
  return ids.length > 0 ? ids.join(' ') : undefined
})
</script>

<template>
  <div class="form-field" :class="{ 'has-error': error, 'is-required': required }">
    <label v-if="label" :for="fieldId" class="form-field__label">
      {{ label }}
      <span v-if="required" class="form-field__required">*</span>
    </label>
    <div class="form-field__input">
      <slot :id="fieldId" :aria-describedby="describedBy" :aria-invalid="!!error" />
    </div>
    <p v-if="hint && !error" class="form-field__hint">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="form-field__error" role="alert">
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.form-field__label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.form-field__required {
  color: var(--accent);
}

.form-field__input {
  position: relative;
}

.form-field__hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 0;
}

.form-field__error {
  font-size: 0.75rem;
  color: var(--danger);
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.form-field__error::before {
  content: '⚠';
  font-size: 0.875rem;
}

.has-error :deep(input),
.has-error :deep(textarea) {
  border-color: var(--danger);
}

.has-error :deep(input:focus),
.has-error :deep(textarea:focus) {
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--danger) 20%, transparent);
}
</style>
