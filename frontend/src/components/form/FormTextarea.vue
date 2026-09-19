<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  disabled?: boolean
  maxlength?: number
  minRows?: number
  maxRows?: number
  id?: string
  ariaDescribedby?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const minRows = props.minRows ?? 3
const maxRows = props.maxRows ?? 10

function adjustHeight() {
  const textarea = textareaRef.value
  if (!textarea) return

  // Reset height to auto to get correct scrollHeight
  textarea.style.height = 'auto'

  const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20
  const paddingTop = parseInt(getComputedStyle(textarea).paddingTop) || 0
  const paddingBottom = parseInt(getComputedStyle(textarea).paddingBottom) || 0
  const borderTop = parseInt(getComputedStyle(textarea).borderTopWidth) || 0
  const borderBottom = parseInt(getComputedStyle(textarea).borderBottomWidth) || 0

  const minHeight = lineHeight * minRows + paddingTop + paddingBottom + borderTop + borderBottom
  const maxHeight = lineHeight * maxRows + paddingTop + paddingBottom + borderTop + borderBottom

  const scrollHeight = textarea.scrollHeight
  textarea.style.height = `${Math.min(Math.max(scrollHeight, minHeight), maxHeight)}px`
  textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden'
}

function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
}

watch(() => props.modelValue, () => {
  nextTick(adjustHeight)
})

onMounted(() => {
  nextTick(adjustHeight)
})
</script>

<template>
  <textarea
    ref="textareaRef"
    :id="id"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :maxlength="maxlength"
    :aria-describedby="ariaDescribedby"
    class="form-textarea"
    rows="1"
    @input="handleInput"
  />
</template>

<style scoped>
.form-textarea {
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
  resize: none;
  line-height: 1.5;
}

.form-textarea::placeholder {
  color: var(--text-muted);
}

.form-textarea:hover:not(:disabled) {
  border-color: var(--border-medium);
}

.form-textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 15%, transparent);
}

.form-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
