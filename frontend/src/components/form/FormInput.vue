<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string
  type?: 'text' | 'email' | 'password' | 'url' | 'number'
  placeholder?: string
  disabled?: boolean
  maxlength?: number
  id?: string
  ariaDescribedby?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputType = computed(() => props.type || 'text')
</script>

<template>
  <input
    :id="id"
    :type="inputType"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :maxlength="maxlength"
    :aria-describedby="ariaDescribedby"
    class="form-input"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<style scoped>
.form-input {
  width: 100%;
  padding: var(--space-3) var(--space-4);
  font-size: 0.9375rem;
  font-family: var(--font-body);
  color: var(--text-primary);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
  outline: none;
}

.form-input::placeholder {
  color: var(--text-muted);
}

.form-input:hover:not(:disabled) {
  border-color: var(--border-medium);
}

.form-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 15%, transparent);
}

.form-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
