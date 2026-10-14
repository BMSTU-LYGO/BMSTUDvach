<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

/**
 * Borderless transmission text canvas (SIGNAL-05).
 * No label, no box, no border — the text surface IS the center of the dock.
 * Optional left micro-gutter: TX (transmission) or R:#123 (reply context).
 */
const props = defineProps<{
  modelValue: string
  placeholder: string
  gutter: string
  maxLength: number
  describedBy?: string
  invalid?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  keydown: [event: KeyboardEvent]
  focus: []
  blur: []
  paste: [event: ClipboardEvent]
}>()

const el = ref<HTMLTextAreaElement | null>(null)

function autoGrow() {
  const node = el.value
  if (!node) return
  node.style.height = 'auto'
  const max = Math.round(window.innerHeight * 0.34)
  node.style.height = `${Math.min(node.scrollHeight, max)}px`
}

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
  autoGrow()
}

watch(
  () => props.modelValue,
  () => {
    if (props.modelValue === '') {
      // collapsed back to one line
      const node = el.value
      if (node) node.style.height = ''
    } else {
      void nextTick(autoGrow)
    }
  },
)

onMounted(() => {
  if (props.modelValue) autoGrow()
})

defineExpose({
  focus: () => el.value?.focus(),
  blur: () => el.value?.blur(),
  el,
})
</script>

<template>
  <div class="signal-surface" :class="{ 'signal-surface--reply': gutter.startsWith('R:') }">
    <span class="signal-surface__gutter" aria-hidden="true">{{ gutter }}</span>
    <textarea
      ref="el"
      class="signal-surface__input"
      rows="1"
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxLength"
      :aria-describedby="describedBy"
      :aria-invalid="invalid || undefined"
      aria-label="Текст сообщения"
      data-testid="signal-input"
      @input="onInput"
      @keydown="emit('keydown', $event)"
      @focus="emit('focus')"
      @blur="emit('blur')"
      @paste="emit('paste', $event)"
    ></textarea>
  </div>
</template>

<style scoped>
.signal-surface {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  flex: 1;
  min-width: 0;
}

.signal-surface__gutter {
  font-family: var(--font-body);
  font-size: 0.62rem;
  color: var(--ink-tertiary);
  padding-top: 0.35rem;
  user-select: none;
  flex-shrink: 0;
  transition: color 200ms;
}

.signal-surface--reply .signal-surface__gutter {
  color: var(--accent);
}

.signal-surface__input {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  resize: none;
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 0.95rem;
  line-height: 1.6;
  padding: 0.3rem 0;
  overflow-y: auto;
  scrollbar-width: thin;
}

.signal-surface__input::placeholder {
  color: var(--ink-tertiary);
  opacity: 0.7;
}

.signal-surface__input::-webkit-scrollbar {
  width: 3px;
}
</style>
