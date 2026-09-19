<script setup lang="ts">
import type { ReportReason } from '@/types'

defineProps<{
  modelValue: ReportReason
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ReportReason]
}>()

const reasons: { value: ReportReason; label: string; icon: string }[] = [
  { value: 'spam', label: 'Спам', icon: '🚫' },
  { value: 'abuse', label: 'Оскорбление', icon: '⚠️' },
  { value: 'illegal', label: 'Незаконный контент', icon: '⛔' },
  { value: 'offtopic', label: 'Оффтоп', icon: '💬' },
  { value: 'other', label: 'Другое', icon: '❓' },
]

function selectReason(reason: ReportReason) {
  emit('update:modelValue', reason)
}
</script>

<template>
  <div class="reason-picker" role="radiogroup" aria-label="Причина жалобы">
    <button
      v-for="reason in reasons"
      :key="reason.value"
      type="button"
      class="reason-picker__option"
      :class="{ 'reason-picker__option--selected': modelValue === reason.value }"
      role="radio"
      :aria-checked="modelValue === reason.value"
      @click="selectReason(reason.value)"
    >
      <span class="reason-picker__icon">{{ reason.icon }}</span>
      <span class="reason-picker__label">{{ reason.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.reason-picker {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-2);
}

.reason-picker__option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.reason-picker__option:hover {
  border-color: var(--border-medium);
  background: var(--bg-raised);
}

.reason-picker__option--selected {
  border-color: var(--accent);
  background: color-mix(in oklab, var(--accent) 10%, var(--bg-surface));
  color: var(--accent);
}

.reason-picker__icon {
  font-size: 1.25rem;
  line-height: 1;
}

.reason-picker__label {
  flex: 1;
  font-weight: 500;
}
</style>
